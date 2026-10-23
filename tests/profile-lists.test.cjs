const test=require('node:test');
const assert=require('node:assert/strict');
const {load,read,fixture,nodes,native,theme}=require('./helpers/component-fixture.cjs');
const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('empty/error first pages complete once; repeated focus never loops or silently retries',async()=>{
  for(const fails of [false,true]) {
    let calls=0;const list=createPagedList(async()=>{calls++;if(fails)throw Error('fixture');return {data:[],totalPages:0};});
    assert.equal(list.getSnapshot().loaded,false);
    await Promise.all([list.ensureLoaded(),list.ensureLoaded(),list.loadMore()]);
    for(let i=0;i<20;i++)await list.ensureLoaded();
    const state=list.getSnapshot();assert.equal(calls,1);assert.equal(state.loading,false);assert.equal(state.loaded,true);assert.equal(state.hasNext,false);assert.equal(Boolean(state.error),fails);
    await list.refresh();assert.equal(calls,2);assert.equal(list.getSnapshot().refreshing,false);
  }
});
test('slow first page/pagination are single-flight; loaded items persist during refresh',async()=>{
  const requests=[];const list=createPagedList(page=>{const pending=deferred();requests.push({page,...pending});return pending.promise;});
  const first=list.ensureLoaded();assert.equal(list.ensureLoaded(),first);await tick();assert.equal(requests.length,1);
  assert.equal(list.getSnapshot().loading,true);assert.equal(list.getSnapshot().loaded,false);
  requests[0].resolve({data:[{_id:'one'}],totalPages:2});await first;
  const more=list.loadMore();assert.equal(list.loadMore(),more);await tick();assert.equal(requests[1].page,2);
  requests[1].resolve({data:[{_id:'two'}],totalPages:2});await more;
  assert.equal(list.getSnapshot().items.length,2);await list.loadMore();assert.equal(requests.length,2);
  const refresh=list.refresh();await tick();assert.equal(requests[2].page,1);assert.equal(list.getSnapshot().items.length,2);assert.equal(list.getSnapshot().refreshing,true);
  requests[2].resolve({data:[{_id:'new'}],totalPages:1});await refresh;assert.equal(list.getSnapshot().items[0]._id,'new');assert.equal(list.getSnapshot().items.length,1);
});
test('refresh during request is coalesced and replaces the older response after it settles',async()=>{
  const requests=[];const list=createPagedList(()=>{const pending=deferred();requests.push(pending);return pending.promise;});
  const initial=list.ensureLoaded();const refresh=list.refresh();assert.equal(list.refresh(),refresh);await tick();assert.equal(requests.length,1);
  requests[0].resolve({data:[{_id:'old'}],totalPages:1});await initial;await tick();assert.equal(requests.length,2);
  requests[1].resolve({data:[{_id:'fresh'}],totalPages:1});await refresh;assert.equal(list.getSnapshot().items[0]._id,'fresh');
});
test('a different profile/session store cannot receive an older response or failure',async()=>{
  const old=deferred();const a=createPagedList(()=>old.promise);const pending=a.ensureLoaded();
  const b=createPagedList(async()=>({data:[{_id:'new-profile'}],totalPages:1}));await b.ensureLoaded();
  old.resolve({data:[{_id:'old-profile'}],totalPages:3});await pending;
  assert.equal(b.getSnapshot().items[0]._id,'new-profile');assert.equal(b.getSnapshot().loading,false);assert.equal(b.getSnapshot().hasNext,false);
});
test('malformed/synchronous failures release locks, pagination errors retain data and explicit retry recovers',async()=>{
  for(const invalid of [undefined,{data:null}]) {
    let fail=true;const list=createPagedList(()=>fail?invalid:{data:[],totalPages:0});await list.ensureLoaded();assert.ok(list.getSnapshot().error);assert.equal(list.getSnapshot().loading,false);
    fail=false;await list.refresh();assert.equal(list.getSnapshot().error,null);
  }
  let calls=0;const list=createPagedList(()=>{calls++;if(calls===2)throw Error('fixture');return {data:[{_id:'one'}],totalPages:2};});
  await list.ensureLoaded();await list.loadMore();assert.equal(list.getSnapshot().items.length,1);assert.ok(list.getSnapshot().error);
  await list.loadMore();assert.equal(calls,2);await list.refresh();assert.equal(calls,3);assert.equal(list.getSnapshot().error,null);
});
test('list hook ties focus to stable profile/session store, not loading/items identities',async()=>{
  let userId='a',token='one';let memo,dependencies,focus;let calls=0;const sourceReturn={current:null};let contextKey,context;
  const hook=load('src/hooks/useProfileList.js','useProfileList',{
    createPagedList,useRef:()=>sourceReturn,useProfileContext:()=>{const key=userId+token;if(contextKey!==key){contextKey=key;context={isCurrent:()=>true};}return context;},
    useMemo:(create,next)=>{if(!dependencies||next.some((value,i)=>value!==dependencies[i])){memo=create();dependencies=next;}return memo;},
    useSyncExternalStore:(_subscribe,get)=>get(),useCallback:fn=>fn,useFocusEffect:fn=>{focus=fn;},
  });
  const loader=async()=>{calls++;return {data:[],totalPages:0};};
  let state=hook(userId,loader);assert.equal(state.initialLoading,true);focus();await tick();
  for(let i=0;i<5;i++){state=hook(userId,loader);focus();await tick();}assert.equal(calls,1);assert.equal(state.initialLoading,false);
  userId='b';state=hook(userId,loader);assert.equal(state.initialLoading,true);focus();await tick();assert.equal(calls,2);
  token='two';state=hook(userId,loader);assert.equal(state.initialLoading,true);focus();await tick();assert.equal(calls,3);
  assert.match(read('src/hooks/useProfileList.js'),/useFocusEffect\(useCallback\(/);
});
test('status UI distinguishes loading, empty and retryable error',()=>{
  const render=props=>fixture('src/components/ProfileListStatus.js','ProfileListStatus',props,{...native,theme}).render();
  assert.equal(render({loading:true,emptyMessage:'Empty'}).type,'ActivityIndicator');
  assert.equal(nodes(render({loading:false,emptyMessage:'Empty'}),'Text')[0].children[0],'Empty');
  let retried=0;const tree=render({error:'fixture',onRetry:()=>retried++});nodes(tree,'Pressable')[0].props.onPress();assert.equal(retried,1);
});
test('TripsTab uses the stable list hook and renders initial spinner rather than premature empty text',()=>{
  const source=read('src/screens/profile/tabs/TripsTab.js');assert.match(source,/useProfileList\(userId, getTripsByUser\)/);assert.doesNotMatch(source,/useFocusEffect|setLoading|fetchPage/);
  const tree=fixture('src/screens/profile/tabs/TripsTab.js','TripsTab',{userId:'fixture'},{...native,theme,RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',TripCardContainer:'TripCardContainer',LikersSheet:'LikersSheet',CommentsSheet:'CommentsSheet',RecommendationsSheet:'RecommendationsSheet',useRouter:()=>({}),getTripsByUser:()=>{},useProfileList:()=>({items:[],loading:false,initialLoading:true})}).render();
  assert.equal(nodes(tree,'FlatList')[0].props.ListEmptyComponent.props.loading,true);
});

test('Trips sheets are hidden immediately when profile/session identity changes',()=>{
  let identity={};const items=[{_id:'old'}];
  const screen=fixture('src/screens/profile/tabs/TripsTab.js','TripsTab',{userId:'fixture'}, {...native,theme,RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',TripCardContainer:'TripCardContainer',LikersSheet:'LikersSheet',CommentsSheet:'CommentsSheet',RecommendationsSheet:'RecommendationsSheet',useRouter:()=>({}),getTripsByUser:()=>{},useProfileList:()=>({identity,items})});
  let tree=screen.render();nodes(tree,'FlatList')[0].props.renderItem({item:items[0]}).props.onOpenSheet('comments',items[0]);
  tree=screen.render();assert.equal(nodes(tree,'CommentsSheet')[0].props.visible,true);
  identity={};tree=screen.render();assert.equal(nodes(tree,'CommentsSheet')[0].props.visible,false);assert.equal(nodes(tree,'CommentsSheet')[0].props.trip,null);
});

function recommendationsFixture(loader,routeParams={},dependencies={}) {
  let list=createPagedList(loader);const route={params:routeParams};const effects=[];let effectIndex=0;const queued=[];const alerts=[];
  const nativeDeps={...native,theme,RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',RecommendationCard:'RecommendationCard',RecommendationDetailModal:'RecommendationDetailModal',AddRecommendationModal:'AddRecommendationModal',getRecommendationsByUser:()=>{},lineStringToCoords:coords=>coords,
    getTripJsonById:async()=>({}),deleteRecommendation:async()=>{},updateRecommendation:async()=>{},Alert:{alert:(...args)=>alerts.push(args)},
    useNavigation:()=>({setParams:params=>Object.assign(route.params,params)}),useRoute:()=>route,
    useProfileList:()=>({...list.getSnapshot(),identity:list,initialLoading:!list.getSnapshot().loaded,ensureLoaded:list.ensureLoaded,refresh:list.refresh,loadMore:list.loadMore,setItems:list.setItems}),
    useEffect:(callback,deps)=>{const index=effectIndex++;if(!effects[index]||deps.some((value,i)=>value!==effects[index][i])){effects[index]=deps;queued.push(callback);}},
    ...dependencies,
  };
  const screen=fixture('src/screens/profile/tabs/RecommendationsTab.js','RecommendationsTab',{userId:'fixture',isSelf:true},nativeDeps);
  return {alerts,route,get list(){return list;},switchList(next){list=next;},render(){effectIndex=0;return screen.render();},effects(){while(queued.length)queued.shift()();}};
}
test('Recommendations focus plus gallery intent share one slow request and repeated same-ID navigation still opens',async()=>{
  const pending=deferred();let calls=0;
  const screen=recommendationsFixture(()=>{calls++;return pending.promise;},{openRecId:'target',ts:1});
  let tree=screen.render();assert.equal(nodes(tree,'FlatList')[0].props.ListEmptyComponent.props.loading,true);
  const focus=screen.list.ensureLoaded();screen.effects();screen.render();screen.effects();await tick();assert.equal(calls,1);
  pending.resolve({data:[{_id:'target',name:'Fixture'}],totalPages:1});await focus;
  screen.render();screen.effects();tree=screen.render();assert.equal(nodes(tree,'RecommendationDetailModal')[0].props.isVisible,true);assert.equal(screen.route.params.openRecId,undefined);
  nodes(tree,'RecommendationDetailModal')[0].props.onClose();screen.render();
  screen.route.params={openRecId:'target',ts:2};screen.render();screen.effects();screen.render();screen.effects();tree=screen.render();
  assert.equal(nodes(tree,'RecommendationDetailModal')[0].props.isVisible,true);assert.equal(calls,1);
});
test('Recommendations empty/error gallery intent does not refetch on renders or focus',async()=>{
  for(const failure of [false,true]) {
    let calls=0;const screen=recommendationsFixture(async()=>{calls++;if(failure)throw Error('fixture');return {data:[],totalPages:0};},{openRecId:'not-loaded',ts:1});
    screen.render();screen.effects();await screen.list.ensureLoaded();
    for(let i=0;i<5;i++){screen.render();screen.effects();await screen.list.ensureLoaded();}
    assert.equal(calls,1);assert.equal(nodes(screen.render(),'RecommendationDetailModal').length,0);
    assert.equal(Boolean(screen.list.getSnapshot().error),failure);
  }
});
test('Recommendations isolate detail/editor and late route responses across selection/profile changes',async()=>{
  const pending=deferred();const records=[{_id:'old',associatedTrip:'route'}, {_id:'new',trip:{simplifiedRoute:['new-route']}}];
  const screen=recommendationsFixture(async()=>({data:records,totalPages:1}),{}, {getTripJsonById:()=>pending.promise});
  await screen.list.ensureLoaded();let tree=screen.render();const list=nodes(tree,'FlatList')[0];
  const opening=list.props.renderItem({item:records[0]}).props.onPress();tree=screen.render();assert.equal(nodes(tree,'RecommendationDetailModal')[0].props.recommendation._id,'old');
  await list.props.renderItem({item:records[1]}).props.onPress();pending.resolve({simplifiedRoute:['old-route']});await opening;tree=screen.render();
  assert.equal(nodes(tree,'RecommendationDetailModal')[0].props.tripRouteCoordinates[0],'new-route');
  screen.switchList(createPagedList(async()=>({data:[],totalPages:0})));tree=screen.render();
  assert.equal(nodes(tree,'RecommendationDetailModal').length,0);assert.equal(nodes(tree,'AddRecommendationModal').length,0);
});
test('Recommendations editor refresh and confirmed deletion still update the same list without a focus loop',async()=>{
  let calls=0,updates=0,deletes=0,edited;const rec={_id:'fixture',name:'Fixture',photos:['photo']};
  const screen=recommendationsFixture(async()=>{calls++;return {data:deletes?[]:[rec],totalPages:1};},{},{updateRecommendation:async()=>updates++,deleteRecommendation:async()=>deletes++});
  await screen.list.ensureLoaded();let tree=screen.render();await nodes(tree,'FlatList')[0].props.renderItem({item:rec}).props.onPress();tree=screen.render();
  const editor=nodes(tree,'AddRecommendationModal')[0];editor.props.ref.current={openEdit:rec=>{edited=rec;}};
  nodes(tree,'RecommendationDetailModal')[0].props.onEdit();assert.equal(edited._id,'fixture');
  const result=await editor.props.onSubmit(rec,true);assert.equal(updates,1);assert.equal(calls,2);await result.refreshCallback();assert.equal(calls,3);
  tree=screen.render();nodes(tree,'RecommendationDetailModal')[0].props.onPhotoDeleted('fixture','photo');assert.equal(screen.list.getSnapshot().items[0].photos.length,0);
  nodes(tree,'FlatList')[0].props.renderItem({item:rec}).props.onLongPress();const confirm=screen.alerts.at(-1)[2].find(button=>button.text==='Delete');await confirm.onPress();
  assert.equal(deletes,1);assert.equal(screen.list.getSnapshot().items.length,0);await screen.list.ensureLoaded();assert.equal(calls,4);
});


test('recommendation deletion queues a replacement after an older refresh response',async()=>{
  const requests=[];const rec={_id:'fixture',name:'Fixture'};
  const screen=recommendationsFixture(()=>{const pending=deferred();requests.push(pending);return pending.promise;});
  const initial=screen.list.ensureLoaded();await tick();requests[0].resolve({data:[rec],totalPages:1});await initial;
  const oldRefresh=screen.list.refresh();await tick();
  const tree=screen.render();nodes(tree,'FlatList')[0].props.renderItem({item:rec}).props.onLongPress();
  const deleting=screen.alerts.at(-1)[2].find(button=>button.text==='Delete').onPress();await tick();
  assert.equal(screen.list.getSnapshot().items.length,0);
  requests[1].resolve({data:[rec],totalPages:1});await oldRefresh;await tick();assert.equal(requests.length,3);
  requests[2].resolve({data:[],totalPages:0});await deleting;assert.equal(screen.list.getSnapshot().items.length,0);
});

function galleryFixture(loader) {
  const props={userId:'profile-a'};let mediaKey='session-a',focused=false,list,storeKey,effectIndex=0;const effects=[],queued=[],navigation=[];
  const screen=fixture('src/components/ProfileGallery.js','ProfileGallery',props,{
    ...native,theme,Image:'Image',ImageViewing:'ImageViewing',BlurView:'BlurView',RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',fetchUserPhotosApi:loader,
    useWindowDimensions:()=>({width:400}),usePhotoSource:()=>({mediaKey,getPhotoSource:photoId=>({uri:'https://fixture.invalid/'+photoId,headers:{Authorization:'Bearer fixture'}})}),
    useRouter:()=>({push:route=>navigation.push({route})}),useNavigation:()=>({navigate:(route,params)=>navigation.push({route,params})}),useIsFocused:()=>focused,
    useProfileList:(userId,fetchPage,size,key)=>{
      const next=userId+'/'+key;if(next!==storeKey){list=createPagedList(page=>fetchPage(userId,page,size));storeKey=next;}
      return {...list.getSnapshot(),identity:list,initialLoading:!list.getSnapshot().loaded,refresh:list.refresh,loadMore:list.loadMore};
    },
    useEffect:(callback,deps)=>{const index=effectIndex++;if(!effects[index]||deps.some((value,i)=>value!==effects[index][i])){effects[index]=deps;queued.push(callback);}},
  });
  return {navigation,get list(){return list;},render(){effectIndex=0;return screen.render();},effects(){while(queued.length)queued.shift()();},focus(value){focused=value;if(value&&list)void list.ensureLoaded();},profile(userId){props.userId=userId;},session(key){mediaKey=key;}};
}
test('Gallery shares bounded pagination, keeps focus cache, and offers explicit refresh/retry/empty states',async()=>{
  const requests=[];const screen=galleryFixture((userId,page,limit)=>{const pending=deferred();requests.push({userId,page,limit,...pending});return pending.promise;});
  let tree=screen.render();assert.equal(nodes(tree,'FlatList')[0].props.ListEmptyComponent.props.loading,true);
  screen.focus(true);screen.effects();screen.focus(true);await tick();assert.equal(requests.length,1);assert.equal(requests[0].limit,20);
  requests[0].resolve(Array.from({length:20},(_,i)=>({photoId:'photo-'+i})));await tick();tree=screen.render();screen.effects();
  const more=nodes(tree,'FlatList')[0].props.onEndReached();nodes(tree,'FlatList')[0].props.onEndReached();await tick();assert.equal(requests.length,2);assert.equal(requests[1].page,2);
  requests[1].resolve([]);await more;
  for(let i=0;i<3;i++){screen.focus(false);screen.render();screen.effects();screen.focus(true);screen.render();screen.effects();}await tick();assert.equal(requests.length,2);
  tree=screen.render();const refresh=nodes(tree,'FlatList')[0].props.refreshControl.props.onRefresh();await tick();requests[2].reject(Error('fixture'));await refresh;
  tree=screen.render();assert.ok(nodes(tree,'FlatList')[0].props.ListFooterComponent.props.error);
  const retry=nodes(tree,'FlatList')[0].props.ListFooterComponent.props.onRetry();await tick();requests[3].resolve([]);await retry;tree=screen.render();
  assert.equal(nodes(tree,'FlatList')[0].props.ListEmptyComponent.props.loading,false);assert.equal(nodes(tree,'FlatList')[0].props.ListEmptyComponent.props.emptyMessage,'No photos yet.');
});
test('Gallery source links close viewer, preserve trip/Recs destinations and revalidate exactly once on return',async()=>{
  for(const sourceType of ['trip','recommendation']) {
    let calls=0;const photo={photoId:'photo',sourceId:'source',sourceType,context:'Fixture'};
    const screen=galleryFixture(async()=>{calls++;return [photo];});screen.render();screen.focus(true);await tick();screen.render();screen.effects();
    let tree=screen.render();nodes(tree,'FlatList')[0].props.renderItem({item:photo}).props.onPress();tree=screen.render();
    const viewer=nodes(tree,'ImageViewing')[0];assert.equal(viewer.props.visible,true);assert.equal(viewer.props.images[0].headers.Authorization,'Bearer fixture');
    nodes(viewer.props.FooterComponent(),'Pressable')[0].props.onPress();assert.equal(nodes(screen.render(),'ImageViewing')[0].props.visible,false);
    assert.equal(screen.navigation[0].route,sourceType==='trip'?'(tabs)/trip/source':'Recs');if(sourceType==='recommendation')assert.equal(screen.navigation[0].params.openRecId,'source');
    screen.focus(false);screen.render();screen.effects();screen.focus(true);screen.render();screen.effects();await tick();assert.equal(calls,2);
    screen.render();screen.effects();await tick();assert.equal(calls,2);
  }
});
test('Gallery hides old viewer immediately and isolates late profile/session responses',async()=>{
  const requests=[];const screen=galleryFixture((userId,page)=>{const pending=deferred();requests.push({userId,...pending});return pending.promise;});
  screen.render();screen.focus(true);await tick();const photo={photoId:'old',sourceType:'trip',sourceId:'old'};requests[0].resolve([photo]);await tick();let tree=screen.render();
  nodes(tree,'FlatList')[0].props.renderItem({item:photo}).props.onPress();assert.equal(nodes(screen.render(),'ImageViewing')[0].props.visible,true);
  const late=screen.list.refresh();await tick();screen.profile('profile-b');tree=screen.render();assert.equal(nodes(tree,'ImageViewing')[0].props.visible,false);assert.equal(nodes(tree,'ImageViewing')[0].props.images.length,0);screen.focus(true);await tick();
  requests[2].resolve([{photoId:'new'}]);await tick();requests[1].resolve([photo]);await late;tree=screen.render();assert.equal(nodes(tree,'FlatList')[0].props.data[0].photoId,'new');
  const key=nodes(tree,'FlatList')[0].props.key;screen.session('session-b');tree=screen.render();assert.notEqual(nodes(tree,'FlatList')[0].props.key,key);assert.equal(nodes(tree,'FlatList')[0].props.data.length,0);assert.equal(nodes(tree,'ImageViewing')[0].props.visible,false);
});
test('Gallery GET retains authentication and query pagination without acquiring an unnecessary CSRF token',async()=>{
  const requests=[];
  const fetchPhotos=load('src/services/api.js','(apiFetch = request, fetchUserPhotosApi)',{
    Constants:{expoConfig:{extra:{API_URL:'https://fixture.invalid/api'}}},Updates:{},URLSearchParams,console:{log(){},error(){}},request:async(path,options)=>{requests.push({path,options});return {data:[{photoId:'fixture'}]};},
  });
  const result=await fetchPhotos('fixture-profile',2,20);assert.equal(result[0].photoId,'fixture');assert.equal(requests[0].path,'/users/v2/fixture-profile/photos?page=2&limit=20');assert.equal(requests[0].options.method,'GET');assert.equal(requests[0].options.auth,true);assert.notEqual(requests[0].options.csrf,true);
});
