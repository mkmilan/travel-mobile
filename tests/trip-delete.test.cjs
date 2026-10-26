const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/component-fixture.cjs');
const { sqliteFixture } = require('./helpers/sqlite-fixture.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(setImmediate);
const serverId='1234567890abcdef12345678';
const receipt={deleted:true,cleanupPending:false,tripId:serverId};
const createTripDeletion=load('src/utils/tripDeletion.js','createTripDeletion');
function action(remove,options={}) {
  let current=true,session=true;const states=[],invalidations=[],reconciles=[],completions=[];
  const context={tripId:serverId,userId:'owner',sessionEpoch:Math.random(),isCurrent:()=>current&&session,isSessionCurrent:()=>session,...options.context};
  const api=createTripDeletion({context,remove,reconcile:async(...args)=>{reconciles.push(args);if(options.localFailure)throw Error('disk full');},invalidate:id=>{invalidations.push(id);if(options.invalidateError)throw Error("cache unavailable");},onChange:state=>states.push(state),onComplete:message=>completions.push(message)});
  return {api,context,states,invalidations,reconciles,completions,blur:()=>{current=false;},logout:()=>{session=false;}};
}
test('trip deletion is single-flight, retains pending state, and mutates caches only after exact completion',async()=>{
  const pending=deferred();let calls=0;const f=action(()=>{calls++;return pending.promise;});
  const first=f.api.run();await tick();await f.api.run();assert.equal(calls,1);assert.equal(f.api.getState().pending,true);assert.equal(f.invalidations.length,0);
  pending.resolve(receipt);assert.equal(await first,true);assert.equal(f.invalidations.length,1);assert.deepEqual(f.reconciles,[[serverId,'owner']]);assert.deepEqual(f.completions,[null]);
  await f.api.run();assert.equal(calls,1);
});
test('network failures, pending responses and malformed completion retain the trip and permit explicit retry',async()=>{
  for(const result of [null,{}, {success:true}, {...receipt,deleted:false}, {...receipt,tripId:'wrong'}, Error('offline')]){
    let fail=true;const f=action(async()=>{if(fail){if(result instanceof Error)throw result;return result;}return receipt;});
    assert.equal(await f.api.run(),false);assert.match(f.api.getState().error,/not confirmed/);assert.equal(f.invalidations.length,0);assert.equal(f.completions.length,0);
    fail=false;assert.equal(await f.api.run(),true);assert.equal(f.api.getState().error,null);
  }
});
test('new session rejects old confirmation and completions; navigation suppresses UI but not same-session invalidation',async()=>{
  for(const transition of ['logout','blur'])for(const failure of [false,true]){
    const pending=deferred(),f=action(()=>pending.promise);const work=f.api.run();await tick();const count=f.states.length;f[transition]();failure?pending.reject(Error('late')):pending.resolve(receipt);await work;
    assert.equal(f.completions.length,0);assert.equal(f.states.length,count);assert.equal(f.invalidations.length,transition==='blur'&&!failure?1:0);assert.equal(await f.api.run(),false);
  }
  const f=action(()=>{throw Error('must not dispatch');});f.logout();assert.equal(await f.api.run(),false);
});
test('a remounted screen shares an in-flight delete and local cleanup failure does not pretend server deletion failed',async()=>{
  const pending=deferred();let calls=0;const old=action(()=>{calls++;return pending.promise;});const work=old.api.run();await tick();old.blur();
  const next=action(()=>{calls++;return pending.promise;},{context:{sessionEpoch:old.context.sessionEpoch},localFailure:true});const nextWork=next.api.run();await tick();assert.equal(calls,1);pending.resolve(receipt);await work;await nextWork;
  assert.equal(next.api.getState().completed,true);assert.match(next.completions[0],/online trip was deleted/);
});

function apiFixture({enabled=true,status=200,data=receipt,csrf,capability={safeTripDeletion:1}}={}){
  let state={user:{_id:'owner'},token:'secret',sessionEpoch:1,isSessionChanging:false};const calls=[];
  const api=load('src/services/api.js','({deleteServerTrip,getPendingTripDeletionsApi})',{
    ENABLE_SAFE_TRIP_DELETE:enabled,Constants:{expoConfig:{extra:{API_URL:'https://fixture.invalid/api'}}},Updates:{},console:{log(){},warn(){},error(){}},
    require:()=>({useAuthStore:{getState:()=>state}}),SecureStore:{getItemAsync:async key=>key==='auth-token'?state.token:JSON.stringify({...state.user,token:state.token})},getCsrfToken:csrf|| (async()=> 'csrf'),
    fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith("/deletion-capability"))return {status:200,ok:true,headers:{get:()=>"application/json"},json:async()=>capability};return {status,ok:status<400,headers:{get:()=> 'application/json'},json:async()=>data};},
  });
  return {...api,calls,logout:()=>{state={...state,sessionEpoch:2};}};
}
test('trip DELETE uses CSRF and bound owner, rejects legacy receipts, and false feature gate sends no request',async()=>{
  const disabled=apiFixture({enabled:false});await assert.rejects(disabled.deleteServerTrip(serverId,'owner'),/not available/);assert.equal(disabled.calls.length,0);

  const f=apiFixture();await f.deleteServerTrip(serverId,'owner');assert.equal(f.calls[0].options.method,'DELETE');assert.match(f.calls[0].url,/\/permanent$/);assert.equal(f.calls[0].options.headers['X-CSRF-Token'],'csrf');assert.equal(f.calls[0].options.headers.Authorization,'Bearer secret');assert.equal(f.calls[0].options.credentials,'include');
  for(const options of [{status:201},{status:204,data:null},{data:{message:'deleted'}},{data:{...receipt,tripId:'other'}},{status:403,data:{message:'Forbidden'}}])await assert.rejects(apiFixture(options).deleteServerTrip(serverId,'owner'));
  await assert.rejects(f.deleteServerTrip(serverId,'other'),/Account changed/);await assert.rejects(f.deleteServerTrip('bad','owner'),/verified trip/);
});
test('trip DELETE cannot dispatch after a same-token login epoch changes during CSRF preparation',async()=>{
  const pending=deferred();const f=apiFixture({csrf:()=>pending.promise});const request=f.deleteServerTrip(serverId,'owner');f.logout();pending.resolve('csrf');await assert.rejects(request,/Account changed/);assert.equal(f.calls.filter(call=>call.options.method==='DELETE').length,0);
});

async function insert(f,id,status='uploaded',owner='owner',remote=serverId){
  await f.db.runAsync('INSERT INTO trips (id,user_id,status,upload_server_id) VALUES (?,?,?,?)',[id,owner,status,remote]);
  for(const table of ['track_points','pois','recommendations'])await f.db.runAsync(`INSERT INTO ${table} (trip_id) VALUES (?)`,[id]);
}
test('confirmed deletion reconciles only verified uploaded owner rows; active, unsynced, foreign and unrelated GPX/local history survive',async()=>{
  const f=await sqliteFixture();try{
    await insert(f,'matching');await insert(f,'active');await insert(f,'unsynced','stopped');await insert(f,'recording','recording');await insert(f,'foreign','uploaded','other');await insert(f,'legacy','uploaded','owner',null);await insert(f,'unrelated','uploaded','owner','abcdef1234567890abcdef12');f.setActive({tripId:'active',userId:'owner'});
    await f.dao.reconcileDeletedServerTrip(serverId,'owner');
    const ids=(await f.db.getAllAsync('SELECT id FROM trips')).map(x=>x.id);assert.equal(ids.includes('matching'),false);assert.equal(ids.length,6);
    for(const table of ['track_points','pois','recommendations'])assert.equal((await f.db.getAllAsync(`SELECT * FROM ${table}`)).length,6);
    await f.dao.reconcileDeletedServerTrip(serverId,'owner');assert.equal((await f.db.getAllAsync('SELECT * FROM trips')).length,6);
  }finally{f.close();}
});
test('local reconciliation rolls back every child and trip deletion on database failure',async()=>{
  const f=await sqliteFixture();try{await insert(f,'matching');f.sqlite.exec("CREATE TRIGGER fixture_failure BEFORE DELETE ON pois BEGIN SELECT RAISE(ABORT, 'disk failure'); END;");await assert.rejects(f.dao.reconcileDeletedServerTrip(serverId,'owner'),/disk failure/);for(const table of ['trips','track_points','pois','recommendations'])assert.equal((await f.db.getAllAsync(`SELECT * FROM ${table}`)).length,1);}finally{f.close();}
});
test('matching terminal replay rejection blocks reupload but preserves unsynced recording and children',async()=>{
  const f=await sqliteFixture();try{
    await insert(f,'local','stopped');const payload={uploadProtocol:1,uploadId:'local',recommendations:[]};await f.db.runAsync('UPDATE trips SET upload_payload = ? WHERE id = ?', [JSON.stringify(payload),'local']);
    const rejection={code:'TRIP_DELETED',tripId:serverId,uploadId:'local'};
    assert.equal(await f.dao.markDeletedTripUpload('local','owner',{},rejection),false);
    for(const changed of [{...rejection,uploadId:'other'},{...rejection,tripId:'bad'},{...rejection,code:'TIMEOUT'}])assert.equal(await f.dao.markDeletedTripUpload('local','owner',payload,changed),false);
    assert.equal(await f.dao.markDeletedTripUpload('local','owner',payload,rejection),true);await assert.rejects(f.dao.buildTripJsonForUpload('local',{},'owner',true),error=>error.code==='TRIP_DELETED');
    for(const table of ['trips','track_points','pois','recommendations'])assert.equal((await f.db.getAllAsync(`SELECT * FROM ${table}`)).length,1);
    assert.equal((await f.db.getAllAsync('SELECT status FROM trips'))[0].status,'stopped');
  }finally{f.close();}
});

const {fixture,nodes,native,theme,read}=require('./helpers/component-fixture.cjs');
const {hooksFixture,authFixture}=require('./helpers/hooks-fixture.cjs');
const {create}=require('zustand');
function detailScreen(remove,enabled=true){
  let session={user:{_id:'owner'},token:'token',sessionEpoch:1,isAuthenticated:true};const route={id:serverId},alerts=[],navigations=[],invalidations=[],reconciles=[];let focus;
  const components=Object.fromEntries(['CommentList','TripRecommendationCard','TransportIcon','TripMapThumbnail','AddCommentModal','AddRecommendationModal','LikersModal','MapModal','RecommendationDetailModal','IconStatDisplay','PhotoGallery','Section','SocialButton','Avatar','Feather'].map(name=>[name,name]));
  const screen=fixture('app/(tabs)/trip/[id].js','TripDetailScreen',{}, {
    ...native,...components,theme,StyleSheet:{create:x=>x},ENABLE_SAFE_TRIP_DELETE:enabled,createTripDeletion,
    useAuthStore:Object.assign(()=>session,{getState:()=>session}),useRouter:()=>({replace:path=>navigations.push(path),push(){}}),useNavigation:()=>({getState:()=>({index:0,routes:[{name:'(tabs)'}]})}),useLocalSearchParams:()=>route,
    useTripSocialStore:Object.assign(()=>({setRecCount(){},setLikeState(){},setCommentCount(){}}),{getState:()=>({invalidateDeletedTrip:id=>invalidations.push(id)})}),useCallback:f=>f,useFocusEffect:fn=>{focus=fn;},
    calcAvgSpeed:()=>1,kmOrMiles:()=> '1 km',msToDuration:()=>'',isoToDate:()=>'',lineStringToCoords:()=>[],getTripJsonById:async()=>({_id:serverId,user:{_id:'owner'},recommendations:[]}),
    Alert:{alert:(...args)=>alerts.push(args)},deleteServerTrip:remove,reconcileDeletedServerTrip:async(...args)=>reconciles.push(args),rememberPendingTripDeletion:async()=>{},settlePendingTripDeletion:async()=>{},
  });screen.setState(0,{_id:serverId,user:{_id:'owner'},recommendations:[]});screen.setState(1,false);
  const menu=()=>nodes(screen.render()).find(n=>n.type?.name==='DropdownMenu');
  return {...screen,alerts,navigations,invalidations,reconciles,route,open:()=>menu().props.onDelete(),logout:()=>{session={...session,sessionEpoch:2};},blur:()=>focus()(),focus:()=>focus()};
}
test('actual detail confirmation names irreversible associated content; Cancel/gated/stale confirmations send nothing',async()=>{
  let calls=0;const f=detailScreen(async()=>{calls++;return receipt;});f.open();const prompt=f.alerts[0];assert.match(prompt[0],/Permanently/);assert.match(prompt[1],/recommendations.*comments and likes.*photos/);assert.match(prompt[1],/cannot be undone/);assert.equal(prompt[2].find(b=>b.text==='Cancel').style,'cancel');assert.equal(calls,0);
  const confirm=prompt[2].find(b=>b.style==='destructive').onPress;f.logout();await confirm();assert.equal(calls,0);
  const gated=detailScreen(async()=>{calls++;return receipt;},false);gated.open();assert.equal(gated.alerts[0][0],'Deletion unavailable');assert.equal(calls,0);
});
test('actual detail double confirmation shows pending, then retryable error; verified success alone navigates',async()=>{
  const pending=deferred();let calls=0;const f=detailScreen(()=>{calls++;return calls===1?pending.promise:Promise.resolve(receipt);});f.open();const confirm=f.alerts[0][2].find(b=>b.style==='destructive').onPress;const request=confirm();confirm();await tick();
  assert.equal(calls,1);assert.equal(f.navigations.length,0);assert.ok(nodes(f.render()).some(n=>n.props.testID==='trip-delete-pending'));
  pending.reject(Error('offline'));await request;assert.ok(nodes(f.render()).some(n=>n.props.testID==='trip-delete-error'));assert.equal(f.invalidations.length,0);
  nodes(f.render()).find(n=>n.props.testID==='trip-delete-retry').props.onPress();await f.alerts.at(-1)[2].find(b=>b.style==='destructive').onPress();assert.equal(calls,2);assert.equal(f.invalidations.length,1);assert.deepEqual(f.navigations,['/(tabs)/trips/']);
});
test('actual detail late completion after blur invalidates without navigating over newer screen',async()=>{
  const pending=deferred();const f=detailScreen(()=>pending.promise);f.open();const work=f.alerts[0][2].find(b=>b.style==='destructive').onPress();await tick();f.blur();pending.resolve(receipt);await work;assert.equal(f.invalidations.length,1);assert.equal(f.navigations.length,0);
});
test('actual social cache invalidation discards pending responses and refuses stale priming/setters for deleted trip',async()=>{
  const pending=deferred();const session={user:{_id:'owner'},token:'token'};const store=load('src/stores/tripSocialStore.js','useTripSocialStore',{create,useAuthStore:{getState:()=>session},getTripComments:()=>pending.promise});
  store.getState().primeCounts({_id:serverId,commentsCount:2});const loading=store.getState().loadComments(serverId);store.getState().invalidateDeletedTrip(serverId);pending.resolve([{_id:'stale'}]);await loading;
  store.getState().primeCounts({_id:serverId,commentsCount:4});store.getState().setCommentCount(serverId,4);store.getState().setLikeState(serverId,{isLiked:true,count:4});store.getState().setRecCount(serverId,4);assert.equal(store.getState().trips[serverId],undefined);assert.equal(store.getState().deletionRevision,1);
});
test('actual recording upload handler preserves terminal-rejected local data and never unlocks its frozen upload identity',async()=>{
  const vm=require('node:vm'),source=read('app/(tabs)/record/index.js');const start=source.indexOf('const handleUpload = '),end=source.indexOf('\n\tconst resetState',start);const session={token:'token',user:{_id:'owner'},sessionEpoch:1};const payload={uploadProtocol:1,uploadId:'local'},calls=[],toasts=[];
  const handle=vm.runInNewContext(source.slice(start,end)+';handleUpload',{
    tripId:'local',status:'stopped',user:session.user,isRestoring:false,uploadRequest:{current:false},lifecycleRequest:{current:false},useAuthStore:{getState:()=>session},setIsUploading(){},setUploadingTripId(){},toast:x=>toasts.push(x),buildTripJsonForUpload:async()=>payload,
    uploadTripJson:async()=>{throw Object.assign(Error('deleted'),{status:410,data:{code:'TRIP_DELETED',tripId:serverId,uploadId:'local'}});},markDeletedTripUpload:async(...args)=>{calls.push(args);return true;},releaseRejectedTripUpload:()=>{throw Error('must never unlock');},markTripUploaded:()=>{throw Error('must never mark uploaded');},console,
  });await handle();assert.equal(calls.length,1);assert.equal(calls[0][0],'local');assert.equal(calls[0][1],'owner');assert.equal(calls[0][2],payload);assert.equal(toasts.at(-1).title,'Online trip was deleted');
});
test('actual list hook invalidates loaded trip/feed/gallery identities and ignores late pre-deletion pages',async()=>{
  const host=hooksFixture(),auth=authFixture();let revision=0,calls=0;const old=deferred();const createPagedList=load('src/utils/pagedList.js','createPagedList');const useProfileContext=load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.store});
  const useProfileList=load('src/hooks/useProfileList.js','useProfileList',{...host.hooks,useProfileContext,createPagedList,useTripSocialStore:select=>select({deletionRevision:revision})});
  const loader=async()=>{calls++;return calls===1?old.promise:{data:[],totalPages:1};};const render=()=>host.render(()=>useProfileList('owner',loader));const previous=render();await tick();revision++;const next=render();assert.notEqual(next.identity,previous.identity);await tick();old.resolve({data:[{_id:serverId}],totalPages:1});await tick();assert.equal(render().items.length,0);assert.equal(calls,2);
});

test('actual My Trips clears the selected social sheet after confirmed deletion and retries failed replacement list safely',async()=>{
  const host=hooksFixture(),auth=authFixture();let revision=0,fail=false,calls=0;const first=deferred();
  const useTripSocialStore=select=>{const state={deletionRevision:revision,primeCounts(){}};return select?select(state):state;};
  const createPagedList=load('src/utils/pagedList.js','createPagedList');const useProfileContext=load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.store});
  const useProfileList=load('src/hooks/useProfileList.js','useProfileList',{...host.hooks,useProfileContext,createPagedList,useTripSocialStore});
  const screen=fixture('app/(tabs)/trips/index.js','MyTrips',{}, {...native,theme,...host.hooks,useProfileList,useAuthStore:auth.store,useTripSocialStore,useRouter:()=>({push(){}}),RefreshControl:'RefreshControl',PendingTripDeletions:'PendingTripDeletions',ProfileListStatus:'ProfileListStatus',TripCardContainer:'TripCardContainer',CommentsSheet:'CommentsSheet',LikersSheet:'LikersSheet',RecommendationsSheet:'RecommendationsSheet',recordAuthDiagnostic(){},getMyJsonTrips:async()=>{calls++;if(calls===1)return first.promise;if(fail)throw Error('refresh offline');return {items:[]};}});
  const render=()=>host.render(()=>screen.render());render();first.resolve({items:[{_id:serverId}]});await tick();let list=nodes(render(),'FlatList')[0];assert.equal(list.props.data.length,1);list.props.renderItem({item:list.props.data[0]}).props.onOpenSheet('comments',list.props.data[0]);assert.equal(nodes(render(),'CommentsSheet')[0].props.visible,true);
  fail=true;revision++;render();await tick();let tree=render();list=nodes(tree,'FlatList')[0];assert.equal(list.props.data.length,0);assert.equal(nodes(tree,'CommentsSheet')[0].props.visible,false);assert.match(list.props.ListEmptyComponent.props.error,/refresh offline/);
  fail=false;await list.props.ListEmptyComponent.props.onRetry();assert.equal(nodes(render(),'FlatList')[0].props.data.length,0);assert.equal(calls,3);
});

test('terminal upload rejection cannot mark another owner, an active recording, or a different known server receipt',async()=>{
  const f=await sqliteFixture();try{
    const payload={uploadProtocol:1,uploadId:'local'};const rejection={code:'TRIP_DELETED',tripId:serverId,uploadId:'local'};
    await insert(f,'local','stopped','owner','abcdef1234567890abcdef12');await f.db.runAsync('UPDATE trips SET upload_payload = ? WHERE id = ?', [JSON.stringify(payload),'local']);
    assert.equal(await f.dao.markDeletedTripUpload('local','owner',payload,rejection),false);await assert.rejects(f.dao.markDeletedTripUpload('local','other',payload,rejection),/not found/);
    await f.db.runAsync('UPDATE trips SET upload_server_id = ? WHERE id = ?',[serverId,'local']);f.setActive({tripId:'local',userId:'owner'});await assert.rejects(f.dao.markDeletedTripUpload('local','owner',payload,rejection),/Stop/);assert.equal((await f.db.getAllAsync('SELECT upload_deleted FROM trips'))[0].upload_deleted,0);
  }finally{f.close();}
});

test('blur before queued dispatch or during CSRF waits sends no destructive request',async()=>{
  let calls=0;const queued=action(async()=>{calls++;return receipt;});const work=queued.api.run();queued.blur();await work;assert.equal(calls,0);
  for(const stage of ['csrf']){
    const pending=deferred();let current=true;const f=apiFixture(stage==='capability'?{capability:pending.promise}:{csrf:()=>pending.promise});
    const request=f.deleteServerTrip(serverId,'owner',{isCurrent:()=>current});await tick();current=false;pending.resolve(stage==='capability'?{safeTripDeletion:1}:'csrf');await assert.rejects(request,/changed/);assert.equal(f.calls.filter(call=>call.options.method==='DELETE').length,0);
  }
});
test('reconciliation observes active-marker changes while waiting for SQLite transaction and cannot resume uploaded rows',async()=>{
  const f=await sqliteFixture();try{
    await insert(f,'matching');const transaction=f.db.withExclusiveTransactionAsync;f.db.withExclusiveTransactionAsync=async work=>{f.setActive({tripId:'matching',userId:'owner'});return transaction(work);};
    await f.dao.reconcileDeletedServerTrip(serverId,'owner');for(const table of ['trips','track_points','pois','recommendations'])assert.equal((await f.db.getAllAsync(`SELECT * FROM ${table}`)).length,1);
    f.setActive({});await assert.rejects(f.dao.setTripRecordingStatus('matching','recording','owner'),/already stopped/);
  }finally{f.close();}
});
test('unverified terminal upload response stays an ordinary unconfirmed failure, never a false deletion success',async()=>{
  const vm=require('node:vm'),source=read('app/(tabs)/record/index.js');const start=source.indexOf('const handleUpload = '),end=source.indexOf('\n\tconst resetState',start);const session={token:'token',user:{_id:'owner'},sessionEpoch:1},toasts=[];
  const handle=vm.runInNewContext(source.slice(start,end)+';handleUpload',{
    tripId:'local',status:'stopped',user:session.user,isRestoring:false,uploadRequest:{current:false},lifecycleRequest:{current:false},useAuthStore:{getState:()=>session},setIsUploading(){},setUploadingTripId(){},toast:x=>toasts.push(x),buildTripJsonForUpload:async()=>({uploadId:'local'}),
    uploadTripJson:async()=>{throw Object.assign(Error('unverified response'),{status:410,data:{code:'TRIP_DELETED',tripId:serverId,uploadId:'different',uploadRejected:true}});},markDeletedTripUpload:async()=>false,releaseRejectedTripUpload:()=>{throw Error('must never unlock');},console:{error(){}},
  });await handle();assert.equal(toasts.at(-1).title,'Upload not confirmed');assert.equal(toasts.some(toast=>toast.title==='Online trip was deleted'),false);
});


test('detail cannot offer deletion while a previous route’s loaded trip is still on screen',async()=>{
  let calls=0;const f=detailScreen(async()=>{calls++;return receipt;});const oldMenu=nodes(f.render()).find(n=>n.type?.name==='DropdownMenu');f.route.id='abcdef1234567890abcdef12';const changed=f.render();assert.equal(nodes(changed).some(n=>n.type?.name==='DropdownMenu'),false);oldMenu.props.onDelete();assert.equal(f.alerts.length,0);assert.equal(calls,0);
});


test('returning to the same detail after blur does not inherit an abandoned pending lock or stale failure',async()=>{
  const pending=deferred();let calls=0;const f=detailScreen(()=>{calls++;return calls===1?pending.promise:Promise.resolve(receipt);});f.open();const old=f.alerts[0][2].find(b=>b.style==='destructive').onPress();await tick();f.blur();f.focus();await tick();assert.equal(nodes(f.render()).some(n=>n.props.testID==='trip-delete-pending'),false);
  pending.reject(Error('old failure'));await old;assert.equal(nodes(f.render()).some(n=>n.props.testID==='trip-delete-error'),false);f.open();await f.alerts.at(-1)[2].find(b=>b.style==='destructive').onPress();assert.equal(calls,2);assert.deepEqual(f.navigations,['/(tabs)/trips/']);
});


test('a post-commit cache failure never claims the server deletion failed or retries the destructive request',async()=>{
  let calls=0;const f=action(async()=>{calls++;return receipt;},{invalidateError:true});assert.equal(await f.api.run(),true);assert.equal(f.api.getState().completed,true);assert.match(f.api.getState().error,/deleted online/);assert.doesNotMatch(f.api.getState().error,/not confirmed/);await f.api.run();assert.equal(calls,1);
});


test('202 cleanup pending is an honest deletion receipt, not complete cleanup', async () => {
  const pendingReceipt = {...receipt, cleanupPending:true};
  const f=apiFixture({status:202,data:pendingReceipt});
  assert.equal((await f.deleteServerTrip(serverId,'owner')).cleanupPending,true);
  assert.match(f.calls[0].url,/\/mobile\/trips\//);
  const events=[];
  const action=createTripDeletion({context:{tripId:serverId,userId:'owner',sessionEpoch:99,isCurrent:()=>true,isSessionCurrent:()=>true},prepare:async()=>events.push('persist'),remove:async()=>{events.push('request');return pendingReceipt;},reconcile:async()=>events.push('reconcile'),settle:async(_id,_owner,r)=>events.push(r.cleanupPending),invalidate:()=>{},onChange:()=>{},onComplete:(_error,r)=>events.push(r.cleanupPending)});
  assert.equal(await action.run(),true);
  assert.deepEqual(events,['persist','request','reconcile',true,true]);
});
test('durable retry rows are owner scoped, idempotent, retained until exact cleanup completion', async () => {
 const f=await sqliteFixture();try {
  await f.dao.rememberPendingTripDeletion(serverId,'owner');await f.dao.rememberPendingTripDeletion(serverId,'owner');await f.dao.rememberPendingTripDeletion(serverId,'other');
  assert.equal((await f.dao.getPendingTripDeletions('owner')).length,1);
  await f.dao.settlePendingTripDeletion(serverId,'owner',{...receipt,cleanupPending:true});
  await f.dao.settlePendingTripDeletion(serverId,'owner',{...receipt,tripId:'wrong'});
  assert.equal((await f.dao.getPendingTripDeletions('owner')).length,1);
  await f.dao.settlePendingTripDeletion(serverId,'owner',receipt);
  assert.equal((await f.dao.getPendingTripDeletions('owner')).length,0);
  assert.equal((await f.dao.getPendingTripDeletions('other')).length,1);
 }finally {f.close();}
});
test('failure to persist retry identity prevents dispatch', async () => {
 let calls=0;
 const action=createTripDeletion({context:{tripId:serverId,userId:'owner',sessionEpoch:100,isCurrent:()=>true,isSessionCurrent:()=>true},prepare:async()=>{throw Error('disk full');},remove:async()=>{calls++;return receipt;},reconcile:async()=>{},invalidate:()=>{},onChange:()=>{},onComplete:()=>{}});
 assert.equal(await action.run(),false);assert.equal(calls,0);
});

test('actual persistent cleanup banner requires confirmation, preserves pending, and hides across accounts',async()=>{
 const host=hooksFixture(),auth=authFixture(),alerts=[],calls=[];let rows=[{trip_id:serverId}],pending=true;
 const screen=fixture('src/components/PendingTripDeletions.js','PendingTripDeletions',{}, {
  ...native,...host.hooks,ENABLE_SAFE_TRIP_DELETE:true,useAuthStore:auth.store,getPendingTripDeletionsApi:async()=>[],rememberPendingTripDeletion:async()=>{},
  Alert:{alert:(...args)=>alerts.push(args)},getPendingTripDeletions:async owner=>{calls.push(['read',owner]);return rows;},
  deleteServerTrip:async(id,owner,options)=>{assert.equal(options.isCurrent(),true);calls.push(['delete',id,owner]);return {...receipt,cleanupPending:pending};},
  settlePendingTripDeletion:async(_id,_owner,r)=>{if(!r.cleanupPending)rows=[];},reconcileDeletedServerTrip:async()=>{},useTripSocialStore:{getState:()=>({invalidateDeletedTrip(){}})},
 });
 const render=()=>host.render(()=>screen.render());render();await tick();let tree=render();assert.ok(nodes(tree).some(n=>n.props.testID==='pending-trip-deletions'));assert.equal(calls.some(x=>x[0]==='delete'),false);
 nodes(tree,'Pressable')[0].props.onPress();assert.equal(calls.some(x=>x[0]==='delete'),false);await alerts[0][2].find(b=>b.style==='destructive').onPress();
 assert.equal(calls.filter(x=>x[0]==='delete').length,1);assert.ok(nodes(render(),'Text').some(n=>JSON.stringify(n).includes('still pending')));
 nodes(render(),'Pressable')[0].props.onPress();const oldConfirm=alerts.at(-1)[2].find(b=>b.style==='destructive').onPress;
 auth.set({user:{_id:'different'},token:'different'});assert.equal(render(),null);await oldConfirm();assert.equal(calls.filter(x=>x[0]==='delete').length,1);
 await tick();pending=false;nodes(render(),'Pressable')[0].props.onPress();await alerts.at(-1)[2].find(b=>b.style==='destructive').onPress();assert.equal(render(),null);
});

test('actual cleanup banner keeps same-session reconciliation after blur but drops late UI',async()=>{
 const host=hooksFixture(),auth=authFixture(),alerts=[],pending=deferred();let reconciles=0,settles=0;
 const screen=fixture('src/components/PendingTripDeletions.js','PendingTripDeletions',{}, {
  ...native,...host.hooks,ENABLE_SAFE_TRIP_DELETE:true,useAuthStore:auth.store,getPendingTripDeletionsApi:async()=>[],rememberPendingTripDeletion:async()=>{},Alert:{alert:(...args)=>alerts.push(args)},getPendingTripDeletions:async()=>[{trip_id:serverId}],
  deleteServerTrip:()=>pending.promise,settlePendingTripDeletion:async()=>{settles++;},reconcileDeletedServerTrip:async()=>{reconciles++;},useTripSocialStore:{getState:()=>({invalidateDeletedTrip(){}})},
 });
 const render=()=>host.render(()=>screen.render());render();await tick();nodes(render(),'Pressable')[0].props.onPress();const work=alerts[0][2].find(b=>b.style==='destructive').onPress();await tick();host.blur();pending.resolve(receipt);await work;
 assert.equal(reconciles,1);assert.equal(settles,1);assert.equal(render(),null);
});

test('pending cleanup identity survives process-like SQLite reopen without recording content',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mobile-cleanup-')),file=path.join(dir,'synthetic.sqlite');let f;
 try {f=await sqliteFixture(file);await f.dao.rememberPendingTripDeletion(serverId,'owner');f.close();f=await sqliteFixture(file);const rows=await f.dao.getPendingTripDeletions('owner');assert.equal(rows.length,1);assert.equal(rows[0].trip_id,serverId);assert.deepEqual(Object.keys(rows[0]),['trip_id']);assert.equal((await f.dao.getPendingTripDeletions('other')).length,0);}finally{f?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('cleanup discovery merges server late-upload manifests and a failed retry does not starve later rows',async()=>{
 const host=hooksFixture(),auth=authFixture(),alerts=[],calls=[];const later='abcdef1234567890abcdef12';let rows=[{trip_id:serverId}];
 const screen=fixture('src/components/PendingTripDeletions.js','PendingTripDeletions',{}, {
  ...native,...host.hooks,ENABLE_SAFE_TRIP_DELETE:true,useAuthStore:auth.store,Alert:{alert:(...args)=>alerts.push(args)},
  getPendingTripDeletions:async()=>rows,getPendingTripDeletionsApi:async()=>[{tripId:later}],rememberPendingTripDeletion:async(id,owner)=>{assert.equal(owner,'actor');rows=[...rows,{trip_id:id}];},
  deleteServerTrip:async(id)=>{calls.push(id);if(id===serverId)throw Error('not found');return {...receipt,tripId:id};},settlePendingTripDeletion:async(id)=>{rows=rows.filter(row=>row.trip_id!==id);},reconcileDeletedServerTrip:async()=>{},useTripSocialStore:{getState:()=>({invalidateDeletedTrip(){}})},
 });
 const render=()=>host.render(()=>screen.render());render();await tick();assert.equal(rows.length,2);assert.equal(calls.length,0);
 nodes(render(),'Pressable')[0].props.onPress();await alerts[0][2].find(b=>b.style==='destructive').onPress();assert.deepEqual(calls,[serverId,later]);assert.deepEqual(rows,[{trip_id:serverId}]);assert.ok(nodes(render(),'Text').some(n=>JSON.stringify(n).includes('1 deletion or cleanup')));
});
test('failed server cleanup discovery keeps local pending retries available',async()=>{
 const host=hooksFixture(),auth=authFixture();
 const screen=fixture('src/components/PendingTripDeletions.js','PendingTripDeletions',{}, {
  ...native,...host.hooks,ENABLE_SAFE_TRIP_DELETE:true,useAuthStore:auth.store,getPendingTripDeletions:async()=>[{trip_id:serverId}],getPendingTripDeletionsApi:async()=>{throw Error('offline');},
 });
 const render=()=>host.render(()=>screen.render());render();await tick();assert.equal(nodes(render(),'Pressable').length,1);assert.ok(nodes(render(),'Text').some(n=>JSON.stringify(n).includes('Saved retries are kept')));
});


test('server cleanup discovery is gated, authenticated, validates IDs, and never uses a delete method',async()=>{
 const disabled=apiFixture({enabled:false});assert.equal((await disabled.getPendingTripDeletionsApi('owner')).length,0);assert.equal(disabled.calls.length,0);
 const f=apiFixture({data:{pending:[{tripId:serverId}]}});assert.equal((await f.getPendingTripDeletionsApi('owner'))[0].tripId,serverId);assert.equal(f.calls[0].options.method,'GET');assert.match(f.calls[0].url,/\/mobile\/trip-deletions$/);assert.equal(f.calls[0].options.headers.Authorization,'Bearer secret');
 await assert.rejects(apiFixture({data:{pending:[{tripId:'bad'}]}}).getPendingTripDeletionsApi('owner'),/not valid/);
});
