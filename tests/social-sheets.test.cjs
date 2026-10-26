const test = require('node:test');
const assert = require('node:assert/strict');
const {read,load,fixture,nodes,theme,native} = require('./helpers/component-fixture.cjs');
const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const initialLoader={identity:{},loading:false,error:null,retry:async()=>{}};
const defaults={ProfileListStatus:'ProfileListStatus',useSocialSheetLoader:()=>initialLoader,...native,theme,StyleSheet:{create:value=>value},BottomModal:'BottomModal',ModalHeader:'ModalHeader',BaseSheet:'BaseSheet',Avatar:'Avatar',Feather:'Feather',isoToDate:()=>'',useRouter:()=>({push(){}}),useAuthStore:()=>({user:{_id:'fixture-user'},token:'fixture-session'})};
function lifecycle(file,name,props,dependencies={}) {
  let effectIndex=0;const effects=[],queued=[];
  const form=fixture(file,name,props,{...defaults,...dependencies,useEffect:(callback,deps)=>{
    const i=effectIndex++,previous=effects[i];
    if(!previous||deps.some((v,j)=>v!==previous.deps[j])){effects[i]={deps,cleanup:previous?.cleanup};queued.push(()=>{effects[i].cleanup?.();effects[i].cleanup=callback();});}
  }});
  return {render(){effectIndex=0;return form.render();},effects(){while(queued.length)queued.shift()();},unmount(){for(const e of effects)e?.cleanup?.();}};
}
const button=(tree,id)=>nodes(tree).find(node=>node.props.testID===id);
const input=tree=>nodes(tree,'TextInput')[0];
const alertText=tree=>nodes(tree,'Text').filter(node=>node.props.accessibilityRole==='alert').map(node=>node.children.join('')).join(' ');

test('Add Comment deduplicates saves, guards dismissal, retains failed text and retries',async()=>{
  let closed=0,calls=0;const pending=deferred();let response=pending.promise;
  const props={isVisible:true,onClose:()=>closed++,onSubmit:async text=>{calls++;assert.equal(text,'Fixture comment');return response;}};
  const form=lifecycle('src/components/modals/AddCommentModal.js','AddCommentModal',props);
  form.render();form.effects();input(form.render()).props.onChangeText(' Fixture comment ');
  const submit=button(form.render(),'comment-submit').props.onPress;const save=submit();await submit();
  let tree=form.render();tree.props.onClose();nodes(tree,'ModalHeader')[0].props.onClose();
  assert.equal(closed,0);assert.equal(calls,1);assert.equal(input(tree).props.editable,false);assert.equal(button(tree,'comment-submit').props.disabled,true);
  pending.reject(Error('fixture failure'));await save;tree=form.render();
  assert.equal(input(tree).props.value,' Fixture comment ');assert.match(alertText(tree),/fixture failure/);assert.equal(button(tree,'comment-submit').props.disabled,false);
  response=Promise.resolve();
  await button(tree,'comment-submit').props.onPress();assert.equal(calls,2);assert.equal(closed,1);
});

test('externally closing/reopening Add Comment isolates a new draft from old completion',async()=>{
  const pending=deferred();let closed=0;
  const props={isVisible:true,onClose:()=>closed++,onSubmit:()=>pending.promise};
  const form=lifecycle('src/components/modals/AddCommentModal.js','AddCommentModal',props);
  form.render();form.effects();input(form.render()).props.onChangeText('Old');const saving=button(form.render(),'comment-submit').props.onPress();
  props.isVisible=false;form.render();form.effects();props.isVisible=true;form.render();form.effects();
  input(form.render()).props.onChangeText('New draft');pending.resolve();await saving;
  assert.equal(closed,0);assert.equal(input(form.render()).props.value,'New draft');assert.equal(button(form.render(),'comment-submit').props.disabled,false);
});

test('comment sheet releases failed sends and prevents duplicate requests/dismissal while pending',async()=>{
  const pending=deferred();let calls=0,closed=0;let result=pending.promise;
  const props={visible:true,trip:{_id:'trip-a'},onClose:()=>closed++};
  const form=lifecycle('src/components/sheets/CommentsSheet.js','CommentsSheet',props,{useTripSocial:()=>({comments:[],loadComments:async()=>{},addComment:()=>{calls++;return result;}})});
  form.render();form.effects();input(form.render()).props.onChangeText('Draft');
  const send=button(form.render(),'comments-send').props.onPress;const saving=send();await send();
  form.render().props.onClose();assert.equal(closed,0);assert.equal(calls,1);
  pending.reject(null);await saving;let tree=form.render();assert.equal(input(tree).props.value,'Draft');assert.match(alertText(tree),/Could not post/);assert.equal(button(tree,'comments-send').props.disabled,false);
  result=Promise.resolve({refreshError:null});await button(tree,'comments-send').props.onPress();tree=form.render();assert.equal(input(tree).props.value,'');tree.props.onClose();assert.equal(closed,1);
  assert.equal(nodes(tree,'KeyboardAvoidingView').length,0);
});

test('successful comment POST with failed refresh clears sent text and retries GET only',async()=>{
  let sends=0,loads=0;const props={visible:true,trip:{_id:'trip-a'},onClose(){}};
  const form=lifecycle('src/components/sheets/CommentsSheet.js','CommentsSheet',props,{useTripSocial:()=>({comments:[],loadComments:async()=>{loads++;},addComment:async()=>{sends++;return {refreshError:'fixture'};}})});
  form.render();form.effects();input(form.render()).props.onChangeText('Sent');await button(form.render(),'comments-send').props.onPress();
  let tree=form.render();assert.equal(input(tree).props.value,'');assert.match(alertText(tree),/Comment posted/);
  await button(tree,'comments-refresh-posted').props.onPress();tree=form.render();assert.equal(sends,1);assert.equal(loads,1);assert.equal(alertText(tree),'');
});

test('comment sheet ignores an old save response after trip identity changes',async()=>{
  const pending=deferred();const props={visible:true,trip:{_id:'trip-a'},onClose(){}};
  const form=lifecycle('src/components/sheets/CommentsSheet.js','CommentsSheet',props,{useTripSocial:()=>({comments:[],loadComments:async()=>{},addComment:()=>pending.promise})});
  form.render();form.effects();input(form.render()).props.onChangeText('Old');const saving=button(form.render(),'comments-send').props.onPress();
  props.trip={_id:'trip-b'};form.render();form.effects();input(form.render()).props.onChangeText('New');pending.resolve({refreshError:'fixture'});await saving;
  assert.equal(input(form.render()).props.value,'New');assert.equal(alertText(form.render()),'');
});

function socialStore(dependencies={}) {
  let state;const module=load('src/stores/tripSocialStore.js','({useTripSocialStore,getSocialSessionScope})',{
    create:initialize=>{state=initialize(patch=>{state={...state,...(typeof patch==='function'?patch(state):patch)};},()=>state);return {getState:()=>state};},
    useAuthStore:{getState:()=>({token:'fixture-session',user:{_id:'fixture-user'}})},getTripComments:async()=>[],getTripLikers:async()=>[],getTripJsonById:async()=>({}),addTripComment:async()=>({_id:'fixture'}),likeTrip:async()=>{},unlikeTrip:async()=>{},...dependencies,
  });return {...module.useTripSocialStore,getSocialSessionScope:module.getSocialSessionScope};
}
test('social store keeps POST failure distinct from refresh failure after a committed comment',async()=>{
  let posts=0,gets=0;const store=socialStore({addTripComment:async()=>{posts++;return {_id:'saved'};},getTripComments:async()=>{gets++;throw Error('offline');}});
  const result=await store.getState().addComment('trip','Text');assert.equal(result.comment._id,'saved');assert.equal(result.refreshError,'offline');assert.equal(posts,1);assert.equal(gets,1);
  const failure=socialStore({addTripComment:async()=>{throw Error('POST failed');},getTripComments:async()=>{gets++;}});
  await assert.rejects(failure.getState().addComment('trip','Text'),/POST failed/);assert.equal(gets,1);
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('social sheet loader settles errors, coalesces retry, and never reloads from new wrapper identities alone',async()=>{
  let calls=0;let fail=true;const pending=deferred();
  const props={tripId:'trip',visible:true,load:()=>{calls++;if(fail)throw Error('offline');return pending.promise;}};
  const loader=lifecycle('src/hooks/useSocialSheetLoader.js','useSocialSheetLoader',props);
  assert.equal(loader.render().loading,true);loader.effects();await tick();
  assert.equal(loader.render().loading,false);assert.match(loader.render().error,/offline/);
  for(let i=0;i<4;i++){props.load=()=>{calls++;return pending.promise;};loader.render();loader.effects();await tick();}assert.equal(calls,1);
  fail=false;const request=loader.render().retry();assert.equal(loader.render().retry(),request);await tick();assert.equal(calls,2);assert.equal(loader.render().loading,true);
  pending.resolve([]);await request;assert.equal(loader.render().loading,false);assert.equal(loader.render().error,null);
  loader.render();loader.effects();await tick();assert.equal(calls,2);
});

test('social loader isolates trip/session/visibility changes and ignores old completion',async()=>{
  let token='a';const requests=[];const props={tripId:'trip-a',visible:true,load:()=>{const p=deferred();requests.push(p);return p.promise;}};
  const loader=lifecycle('src/hooks/useSocialSheetLoader.js','useSocialSheetLoader',props,{useAuthStore:()=>({token})});
  const firstIdentity=loader.render().identity;loader.effects();await tick();
  props.tripId='trip-b';const secondIdentity=loader.render().identity;assert.notEqual(firstIdentity,secondIdentity);loader.effects();await tick();
  requests[0].reject(Error('old failure'));await tick();assert.equal(loader.render().error,null);assert.equal(loader.render().loading,true);
  requests[1].resolve([]);await tick();assert.equal(loader.render().loading,false);
  token='b';assert.notEqual(loader.render().identity,secondIdentity);loader.effects();await tick();assert.equal(requests.length,3);
  props.visible=false;loader.render();loader.effects();requests[2].reject(Error('closed'));await tick();assert.equal(loader.render().error,null);assert.equal(loader.render().loading,false);
  props.visible=true;loader.render();loader.effects();await tick();assert.equal(requests.length,4);loader.unmount();requests[3].resolve([]);await tick();
});

test('all social sheets render retryable load errors without an endless initial spinner',()=>{
  for(const [name,list] of [['CommentsSheet','comments'],['LikersSheet','likers'],['RecommendationsSheet','recommendations']]) {
    let retries=0;const state={identity:{},loading:false,error:'fixture offline',retry:()=>retries++};
    const props={visible:true,trip:{_id:'trip'},onClose(){}};
    const sheet=lifecycle(`src/components/sheets/${name}.js`,name,props,{useTripSocial:()=>({[list]:undefined,loadComments:async()=>{},loadLikers:async()=>{},loadRecommendations:async()=>{}}),useSocialSheetLoader:()=>state,RecommendationDetailModal:'RecommendationDetailModal',RecommendationCard:'RecommendationCard',lineStringToCoords:()=>[]});
    const tree=sheet.render();assert.equal(nodes(tree,'ActivityIndicator').length,0);
    const status=nodes(tree,'ProfileListStatus')[0];assert.equal(status.props.error,'fixture offline');status.props.onRetry();assert.equal(retries,1);
  }
});

test('comment avatar navigation closes its source sheet first and does not navigate during send',async()=>{
  const events=[],pending=deferred();const comment={_id:'comment',user:{_id:'author',username:'Fixture'},text:'Text'};
  const sheet=lifecycle('src/components/sheets/CommentsSheet.js','CommentsSheet',{visible:true,trip:{_id:'trip'},onClose:()=>events.push('close')},{useTripSocial:()=>({comments:[comment],loadComments:async()=>{},addComment:()=>pending.promise}),useRouter:()=>({push:path=>events.push(path)})});
  sheet.render();sheet.effects();let tree=sheet.render();const row=nodes(tree,'FlatList')[0].props.renderItem({item:comment});nodes(row,'Avatar')[0].props.onPress();assert.deepEqual(events,['close','/user/author']);
  input(tree).props.onChangeText('Draft');const saving=button(sheet.render(),'comments-send').props.onPress();nodes(row,'Avatar')[0].props.onPress();assert.equal(events.length,2);pending.resolve();await saving;
});

test('recommendation detail Back returns to list; navigation closes both and changed identity hides old detail',()=>{
  let identity={},closes=0;const props={visible:true,trip:{_id:'trip'},onClose:()=>closes++};const rec={_id:'rec'};
  const sheet=lifecycle('src/components/sheets/RecommendationsSheet.js','RecommendationsSheet',props,{useTripSocial:()=>({recommendations:[rec],loadRecommendations:async()=>{}}),useSocialSheetLoader:()=>({identity,loading:false,error:null}),RecommendationDetailModal:'RecommendationDetailModal',RecommendationCard:'RecommendationCard',lineStringToCoords:()=>[]});
  sheet.render();sheet.effects();let tree=sheet.render();const open=()=>nodes(tree,'FlatList')[0].props.renderItem({item:rec}).props.onPress();open();tree=sheet.render();let detail=nodes(tree,'RecommendationDetailModal')[0];assert.equal(detail.props.isVisible,true);
  detail.props.onClose();tree=sheet.render();assert.equal(closes,0);assert.equal(nodes(tree,'BaseSheet')[0].props.visible,true);assert.equal(nodes(tree,'RecommendationDetailModal')[0].props.isVisible,false);
  open();tree=sheet.render();nodes(tree,'RecommendationDetailModal')[0].props.onNavigateClose();assert.equal(closes,1);
  tree=sheet.render();open();identity={};tree=sheet.render();assert.equal(nodes(tree,'RecommendationDetailModal')[0].props.isVisible,false);assert.equal(nodes(tree,'RecommendationDetailModal')[0].props.recommendation,null);
});

test('recommendation destination handlers close their source once; stale handlers cannot navigate after Back',()=>{
  const events=[];
  const create=()=>lifecycle('src/components/modals/RecommendationDetailModal.js','RecommendationDetailModal',{isVisible:true,onClose:()=>events.push('detail-close'),onNavigateClose:()=>events.push('all-close'),recommendation:{_id:'rec',user:{_id:'author',username:'Fixture'},associatedTrip:'trip',photos:[]}},
    {Ionicons:'Ionicons',InteractiveTripMap:'InteractiveTripMap',PhotoGallery:'PhotoGallery',useProfileContext:()=>({isCurrent:()=>true}),usePhotoManager:()=>({photos:[],isDeleting:()=>false}),useRouter:()=>({push:path=>events.push(path)})});
  const tree=create().render();nodes(tree,'ModalHeader')[0].props.onClose();
  const staleLinks=nodes(tree,'Pressable');staleLinks[0].props.onPress();staleLinks[1].props.onPress();assert.deepEqual(events,['detail-close']);
  nodes(create().render(),'Pressable')[0].props.onPress();nodes(create().render(),'Pressable')[1].props.onPress();
  assert.deepEqual(events,['detail-close','all-close','/user/author','all-close','/trip/trip']);
});

test('social pending GETs, like rollback, and post-send refresh cannot repopulate reset cache',async()=>{
  for(const method of ['loadComments','loadLikers','loadRecommendations']) {
    const pending=deferred();const store=socialStore({getTripComments:()=>pending.promise,getTripLikers:()=>pending.promise,getTripJsonById:()=>pending.promise});
    const request=store.getState()[method]('trip');store.getState().reset();pending.resolve(method==='loadRecommendations'?{recommendations:[{_id:'old'}]}:[{_id:'old'}]);await request;
    assert.equal(Object.keys(store.getState().trips).length,0);
  }
  const like=deferred();const store=socialStore({likeTrip:()=>like.promise});const liking=store.getState().toggleLike('trip');store.getState().reset();like.reject(Error('old'));await liking;assert.equal(Object.keys(store.getState().trips).length,0);
  let gets=0;const post=deferred();const posting=socialStore({addTripComment:()=>post.promise,getTripComments:async()=>{gets++;return [];}});const sending=posting.getState().addComment('trip','Text');posting.getState().reset();post.resolve({_id:'posted'});const result=await sending;assert.equal(gets,0);assert.ok(result.refreshError);
});

test('older overlapping social GET cannot replace the newer post-mutation list',async()=>{
  const requests=[];const store=socialStore({getTripComments:()=>{const p=deferred();requests.push(p);return p.promise;}});
  const first=store.getState().loadComments('trip');const second=store.getState().loadComments('trip');requests[1].resolve([{_id:'new'}]);await second;requests[0].resolve([{_id:'old'}]);await first;assert.equal(store.getState().trips.trip.comments[0]._id,'new');
});

test('direct account/token change immediately hides cached lists and blocks late GET/like/comment writes',async()=>{
  const session={token:'a',user:{_id:'user-a'}};const auth={getState:()=>session};const pending=deferred();let nextGet=Promise.resolve([{_id:'private-a'}]);
  const store=socialStore({useAuthStore:auth,getTripComments:()=>nextGet,getTripLikers:async()=>[{_id:'liker-a'}],getTripJsonById:async()=>({recommendations:[{_id:'rec-a'}]})});
  await store.getState().loadComments('trip');await store.getState().loadLikers('trip');await store.getState().loadRecommendations('trip');
  const hook=load('src/hooks/useTripSocial.js','useTripSocial',{useAuthStore:select=>select(session),useTripSocialStore:()=>store.getState(),getSocialSessionScope:store.getSocialSessionScope,React:{useEffect(){}}});
  assert.equal(hook({_id:'trip'}).comments[0]._id,'private-a');
  nextGet=pending.promise;const request=store.getState().loadComments('trip');session.token='b';session.user={_id:'user-b'};
  const current=hook({_id:'trip'});assert.equal(current.comments,undefined);assert.equal(current.likers,undefined);assert.equal(current.recommendations,undefined);
  // Priming a count in the new session must not relabel old rows as current.
  store.getState().primeCounts({_id:'trip',commentsCount:2});assert.equal(hook({_id:'trip'}).comments,undefined);
  pending.resolve([{_id:'late-private-a'}]);await request;assert.equal(hook({_id:'trip'}).comments,undefined);
  const like=deferred(),post=deferred();let gets=0;
  const mutations=socialStore({useAuthStore:auth,likeTrip:()=>like.promise,addTripComment:()=>post.promise,getTripComments:async()=>{gets++;return [];}});
  const liking=mutations.getState().toggleLike('trip');const posting=mutations.getState().addComment('trip','Text');session.token='c';session.user={_id:'user-c'};
  mutations.getState().primeCounts({_id:'trip',likesCount:9});like.reject(Error('old'));post.resolve({_id:'saved-b'});await liking;await posting;
  assert.equal(mutations.getState().trips.trip.likesCount,9);assert.equal(gets,0);
});

test('trip-detail comment completion cannot update a different route/session or an unmounted screen',async()=>{
  const source=read('app/(tabs)/trip/[id].js');
  assert.match(source,/<AddCommentModal\s+key=\{screenContext.current.key\}/);
  const start=source.indexOf('const handleAddCommentSubmit = '),end=source.indexOf('\n\tconst handleDeleteComment',start);
  for(const change of ['trip','session','unmount','none']) {
    const pending=deferred();const session={token:'a',user:{_id:'owner'}};const original={tripId:'trip-a',token:'a',userId:'owner'};
    const screenContext={current:original},screenMounted={current:true};const calls=[];
    const handler=require('node:vm').runInNewContext(source.slice(source.indexOf('const isCurrentContext = '),source.indexOf('\n\tuseEffect',source.indexOf('const isCurrentContext = ')))+'\n'+source.slice(start,end)+';handleAddCommentSubmit',{
      tripDataContext:{current:original},tripId:'trip-a',isAuthenticated:true,trip:{_id:'trip-a',commentsCount:0},renderContext:original,screenContext,screenMounted,useAuthStore:{getState:()=>session},
      addTripComment:()=>pending.promise,setComments:update=>{calls.push('comments');assert.equal(update([]).length,1);},setTrip:update=>{calls.push('trip');assert.equal(update({_id:'trip-a',commentsCount:0}).commentsCount,1);},setCommentCount:()=>calls.push('count'),setIsCommentListExpanded:()=>calls.push('expand'),setIsCommentsSectionVisible:()=>calls.push('visible'),isCommentListExpanded:false,isCommentsSectionVisible:false,Alert:{alert:()=>calls.push('alert')},
    });
    const request=handler('Text');if(change==='trip')screenContext.current={...original,tripId:'trip-b'};if(change==='session')session.token='b';if(change==='unmount')screenMounted.current=false;
    pending.resolve({_id:'posted'});await request;assert.equal(calls.length,change==='none'?5:0);
  }
});

function tripDetailCallbacks(overrides={}) {
  const source=read('app/(tabs)/trip/[id].js');
  const section=(name,end)=>source.slice(source.indexOf(`const ${name} = `),source.indexOf(end,source.indexOf(`const ${name} = `)));
  const context={tripId:'trip-a',userId:'owner',token:'session-a',key:1};
  const screenContext={current:context},screenMounted={current:true};const session={token:context.token,user:{_id:context.userId}};
  const calls=[],requests=[];const record=name=>(...args)=>calls.push({name,args});
  const api=name=>(...args)=>{requests.push({name,args});return Promise.resolve(name==='trip'?{_id:'trip-a',likes:[],comments:[]}:{_id:'saved'});};
  const dependencies={
    latestTripPhotoRequest:{current:overrides.trip === null ? null : {context,hasData:true}},tripPhotoRefreshIdentity:{current:null},tripDataContext:{current:context},errorContext:{current:context},likeRevision:{current:0},
    renderContext:context,screenContext,screenMounted,commentsRequest:{current:null},useAuthStore:{getState:()=>session},tripId:context.tripId,isAuthenticated:true,currentUser:session.user,trip:{_id:'trip-a',recommendations:[{_id:'existing'}],commentsCount:0},
    comments:[],commentsLoading:false,isCommentListExpanded:false,isCommentsSectionVisible:false,
    getTripJsonById:api('trip'),getTripComments:api('comments'),addRecommendation:api('create'),updateRecommendation:api('update'),
    setLikeState(){},setLoading:record('loading'),setError:record('error'),setRefreshError:record('refresh-error'),setTrip:record('trip'),setOptimisticLikesCount:record('likes-count'),setIsLikedByCurrentUser:record('liked'),setComments:record('comments'),setCommentsLoading:record('comments-loading'),setCommentsError:record('comments-error'),setRecCount:record('rec-count'),Alert:{alert:record('alert')},...overrides,
  };
  const code=[section('isCurrentContext','\n\tuseEffect'),section('fetchTripDetails','\n\tuseEffect'),section('fetchCommentsData','\n\tconst handleToggleCommentsSection'),section('handleRecommendationSubmit','\n\tconst handleShare')].join('\n');
  const methods=require('node:vm').runInNewContext(code+';({fetchTripDetails,fetchCommentsData,handleRecommendationSubmit})',dependencies);
  return {...methods,calls,requests,context,change(kind){if(kind==='trip')screenContext.current={...context,tripId:'trip-b',key:2};if(kind==='session')session.token='session-b';if(kind==='unmount')screenMounted.current=false;return screenContext.current;}};
}

test('trip recommendation create/update suppress late refresh/count/alerts after route, session or unmount changes',async()=>{
  for(const editing of [false,true])for(const change of ['trip','session','unmount'])for(const fails of [false,true]) {
    const pending=deferred();let mutations=0;
    const fixture=tripDetailCallbacks({addRecommendation:()=>{mutations++;return pending.promise;},updateRecommendation:()=>{mutations++;return pending.promise;}});
    const save=fixture.handleRecommendationSubmit({_id:'rec',name:'Fixture'},editing,true);fixture.change(change);
    if(fails){pending.reject(Error('old save failure'));await assert.rejects(save,/old save failure/);}else{pending.resolve({_id:'saved'});await save;}
    assert.equal(mutations,1);assert.equal(fixture.requests.length,0);assert.deepEqual(fixture.calls,[]);
  }
  for(const editing of [false,true]) {
    let mutations=0;const fixture=tripDetailCallbacks({addRecommendation:()=>mutations++,updateRecommendation:()=>mutations++});fixture.change('trip');
    await assert.rejects(fixture.handleRecommendationSubmit({_id:'rec'},editing),/trip or account changed/);assert.equal(mutations,0);assert.deepEqual(fixture.calls,[]);
  }
});

test('successful recommendation callbacks refresh in background and retained callbacks cannot refresh a later screen',async()=>{
  for(const editing of [false,true]) {
    const get=deferred();let reads=0;
    const fixture=tripDetailCallbacks({getTripJsonById:()=>{reads++;return get.promise;}});
    const saved=await fixture.handleRecommendationSubmit({_id:'rec',name:'Fixture'},editing,true);
    assert.equal(saved._id,'saved');assert.equal(reads,1);assert.ok(!fixture.calls.some(call=>call.name==='loading'));
    const count=fixture.calls.find(call=>call.name==='rec-count');if(editing)assert.equal(count,undefined);else assert.deepEqual(count.args,['trip-a',2]);
    fixture.change('trip');const before=fixture.calls.length;get.resolve({_id:'trip-a',likes:[],comments:[]});await tick();await saved.refreshCallback();assert.equal(reads,1);assert.equal(fixture.calls.length,before);
  }
  const source=read('app/(tabs)/trip/[id].js');assert.match(source,/<AddRecommendationModal key=\{screenContext.current.key\}/);
});

test('trip refresh guards result, failure and loading completion after route/session/unmount change',async()=>{
  for(const change of ['trip','session','unmount'])for(const fails of [false,true]) {
    const pending=deferred();let reads=0;const fixture=tripDetailCallbacks({getTripJsonById:()=>{reads++;return pending.promise;}});
    const request=fixture.fetchTripDetails(false);assert.equal(reads,1);fixture.change(change);const before=fixture.calls.length;
    if(fails)pending.reject(Error('old read'));else pending.resolve({_id:'old-private-trip',likes:['owner'],comments:[]});await request;
    assert.equal(fixture.calls.length,before);
    await fixture.fetchTripDetails(true,fixture.context);assert.equal(reads,1);
  }
  const active=tripDetailCallbacks();await active.fetchTripDetails();assert.ok(active.calls.some(call=>call.name==='trip'));assert.equal(active.calls.at(-1).name,'loading');assert.equal(active.calls.at(-1).args[0],false);
});

test('follow-on comment reload from a recommendation refresh cannot paint after identity changes',async()=>{
  for(const fails of [false,true]) {
    const pending=deferred();let commentReads=0;
    const fixture=tripDetailCallbacks({isCommentListExpanded:true,getTripComments:()=>{commentReads++;return pending.promise;}});
    const refresh=fixture.fetchTripDetails(true);await tick();assert.equal(commentReads,1);fixture.change('session');const before=fixture.calls.length;
    if(fails)pending.reject(Error('old comments'));else pending.resolve([{_id:'old-private-comment'}]);await refresh;assert.equal(fixture.calls.length,before);
  }
});


test('trip comments deduplicate per context but a prior context cannot block or release a newer request',async()=>{
  const pending=[],requestRef={current:null};
  const screen=tripDetailCallbacks({commentsRequest:requestRef,getTripComments:()=>{const next=deferred();pending.push(next);return next.promise;}});
  const first=screen.fetchCommentsData();assert.equal(screen.fetchCommentsData(),first);assert.equal(pending.length,1);
  const current=screen.change('trip');const second=screen.fetchCommentsData(current);
  assert.notEqual(second,first);assert.equal(screen.fetchCommentsData(current),second);assert.equal(pending.length,2);
  const before=screen.calls.length;pending[0].resolve([{_id:'old'}]);await first;
  assert.equal(screen.calls.length,before);assert.equal(requestRef.current.promise,second);
  pending[1].resolve([]);await second;assert.equal(requestRef.current,null);
  assert.equal(screen.calls.at(-1).name,'comments-loading');assert.equal(screen.calls.at(-1).args[0],false);
});

function tripDetailScreen(overrides={}) {
  const session={user:{_id:'owner'},token:'session-a',isAuthenticated:true};
  const useAuthStore=Object.assign(()=>session,{getState:()=>session});
  const components=Object.fromEntries(['CommentList','RecommendationCard','TransportIcon','TripMapThumbnail','AddCommentModal','AddRecommendationModal','LikersModal','MapModal','RecommendationDetailModal','IconStatDisplay','PhotoGallery','Section','SocialButton'].map(name=>[name,name]));
  let focus,priming=false;const params={id:'trip-a'};
  const screen=fixture('app/(tabs)/trip/[id].js','TripDetailScreen',{}, {
    ...defaults,...components,useAuthStore,useNavigation:()=>({getState:()=>({index:0,routes:[{name:'(tabs)'}]})}),useLocalSearchParams:()=>params,
    useTripSocialStore:()=>({setRecCount(){},setLikeState(){},setCommentCount(){}}),
    useCallback:fn=>fn,useFocusEffect:callback=>{focus=callback;},
    calcAvgSpeed:()=>1,kmOrMiles:()=> '1 km',msToDuration:()=>'',lineStringToCoords:()=>[],
    addRecommendation:async()=>({_id:'saved'}),updateRecommendation:async()=>({_id:'saved'}),
    Alert:{alert(){}},...overrides,
    getTripJsonById:()=>priming || !overrides.getTripJsonById ? Promise.resolve({_id:params.id,user:{_id:'owner'},recommendations:[],likes:[],comments:[]}) : overrides.getTripJsonById(),
  });
  screen.setState(0,{_id:'trip-a',user:{_id:'owner'},recommendations:[],commentsCount:0});screen.setState(1,false);
  return {...screen,session,params,useAuthStore,focus:()=>focus(),async prime(){priming=true;screen.render();focus();await tick();priming=false;screen.render();}};
}

test('failed immediate and retained recommendation refresh keep the same form mounted with bounded retry',async()=>{
  const reads=[];const screen=tripDetailScreen({getTripJsonById:()=>{const request=deferred();reads.push(request);return request.promise;}});
  await screen.prime();const original=nodes(screen.render(),'AddRecommendationModal')[0];
  const saved=await original.props.onSubmit({_id:'saved'},true,true);assert.equal(reads.length,1);
  reads[0].reject(Error('Immediate refresh offline'));await tick();
  let tree=screen.render();let editor=nodes(tree,'AddRecommendationModal')[0];
  assert.ok(editor);assert.equal(editor.props.key,original.props.key);assert.match(alertText(tree),/Immediate refresh offline/);
  const refresh=saved.refreshCallback();reads[1].reject(Error('Partial-photo refresh offline'));await refresh;
  tree=screen.render();editor=nodes(tree,'AddRecommendationModal')[0];
  assert.ok(editor);assert.equal(editor.props.key,original.props.key);assert.match(alertText(tree),/Partial-photo refresh offline/);
  const retry=button(tree,'trip-refresh-retry').props.onPress();reads[2].resolve({_id:'trip-a',likes:[],comments:[]});await retry;
  tree=screen.render();assert.equal(alertText(tree),'');assert.equal(nodes(tree,'AddRecommendationModal')[0].props.key,original.props.key);
  assert.equal(reads.length,3);
});

test('partial-photo draft survives its actual parent refresh failure without a new recommendation create',async()=>{
  const read=deferred();let creates=0,photos=[];
  const screen=tripDetailScreen({getTripJsonById:()=>read.promise,addRecommendation:async()=>{creates++;return {_id:'created-rec'};}});
  await screen.prime();const original=nodes(screen.render(),'AddRecommendationModal')[0];
  const editor=fixture('src/components/modals/AddRecommendationModal.js','AddRecommendationModal',original.props,{
    ...defaults,useAuthStore:screen.useAuthStore,TripPhotoThumb:'TripPhotoThumb',Ionicons:'Ionicons',MapView:'MapView',Marker:'Marker',StarRating:'StarRating',
    RECOMMENDATION_CATEGORIES:[{value:'nature',label:'Nature'}],RECOMMENDATION_TAGS:[{value:'quiet',label:'Quiet'}],
    Alert:{alert(){}},console:{error(){}},usePhotoManager:()=>({photos,getPhotos:()=>photos,uploading:false,setPhotos:value=>{photos=value;},uploadPendingPhotos:async()=>{throw Error('Photo upload offline');}}),
  });
  editor.render();editor.ref.current.open({lat:1,lon:2},'trip-a');let form=editor.render();
  nodes(form,'TextInput')[0].props.onChangeText('Retained title');nodes(form,'TextInput')[1].props.onChangeText('Retained description');
  nodes(form,'StarRating')[0].props.onRatingChange(4);nodes(form).find(node=>node.props.onCategoryChange).props.onCategoryChange('nature');nodes(form).find(node=>node.props.onTagsChange).props.onTagsChange(['quiet']);photos=['file://failed-photo'];
  await button(editor.render(),'recommendation-save').props.onPress();read.reject(Error('Refresh offline'));await tick();
  const tree=screen.render();const current=nodes(tree,'AddRecommendationModal')[0];
  assert.ok(current);assert.equal(current.props.key,original.props.key);assert.match(alertText(tree),/Refresh offline/);
  form=editor.render();assert.equal(form.props.visible,true);assert.equal(nodes(form,'TextInput')[0].props.value,'Retained title');assert.equal(nodes(form,'TextInput')[1].props.value,'Retained description');
  assert.match(alertText(form),/already exists.*Photo upload offline/);assert.deepEqual(photos,['file://failed-photo']);assert.equal(creates,1);
});

test('initial-load error remains blocking but current successful focus refresh recovers it',async()=>{
  const get=deferred();const screen=tripDetailScreen({getTripJsonById:()=>get.promise});
  await screen.prime();screen.setState(2,'Initial request failed');let tree=screen.render();assert.equal(nodes(tree,'AddRecommendationModal').length,0);
  assert.ok(nodes(tree,'Text').some(node=>node.children.includes('Initial request failed')));
  screen.focus();get.resolve({_id:'trip-a',likes:[],comments:[]});await tick();tree=screen.render();assert.equal(nodes(tree,'AddRecommendationModal').length,1);
  // A different route cannot inherit an old route's background error banner.
  const failure=deferred();const changed=tripDetailScreen({getTripJsonById:()=>failure.promise});
  await changed.prime();const saved=await nodes(changed.render(),'AddRecommendationModal')[0].props.onSubmit({_id:'rec'},true);
  failure.reject(Error('Old route refresh failed'));await tick();assert.match(alertText(changed.render()),/Old route refresh failed/);
  changed.params.id='trip-b';assert.equal(alertText(changed.render()),'');await saved.refreshCallback();
});

test('trip detail newest request alone publishes data, thumbnail retry identity, errors and loading',async()=>{
  for(const oldFails of [false,true])for(const newFails of [false,true]) {
    const reads=[],identity={current:null};
    const screen=tripDetailCallbacks({tripPhotoRefreshIdentity:identity,getTripJsonById:()=>{const p=deferred();reads.push(p);return p.promise;}});
    const old=screen.fetchTripDetails(true),fresh=screen.fetchTripDetails(true);
    if(newFails)reads[1].reject(Error('new failure'));else reads[1].resolve({_id:'trip-a',title:'new',likes:['owner'],comments:[]});await fresh;
    const before=screen.calls.length,newIdentity=identity.current;
    if(oldFails)reads[0].reject(Error('old failure'));else reads[0].resolve({_id:'trip-a',title:'old',likes:[],comments:[]});await old;
    assert.equal(screen.calls.length,before);assert.equal(identity.current,newIdentity);
    assert.equal(screen.calls.at(-1).name,'loading');assert.equal(screen.calls.at(-1).args[0],false);
    if(newFails)assert.equal(screen.calls.find(call=>call.name==='refresh-error'&&call.args[0])?.args[0].message,'new failure');
    else assert.equal(screen.calls.find(call=>call.name==='trip').args[0].title,'new');
  }
});
test('mount focus superseding initial detail read owns spinner and initial error recovery',async()=>{
  for(const newFails of [false,true])for(const olderFirst of [false,true]) {
    const reads=[];const screen=tripDetailCallbacks({trip:null,getTripJsonById:()=>{const p=deferred();reads.push(p);return p.promise;}});
    const initial=screen.fetchTripDetails(),focus=screen.fetchTripDetails(true);
    if(olderFirst){const before=screen.calls.length;reads[0].resolve({_id:'old',likes:[],comments:[]});await initial;assert.equal(screen.calls.length,before);}
    if(newFails)reads[1].reject(Error('current initial failure'));else reads[1].resolve({_id:'trip-a',title:'new',likes:[],comments:[]});await focus;
    assert.equal(screen.calls.at(-1).name,'loading');assert.equal(screen.calls.at(-1).args[0],false);
    if(newFails)assert.equal(screen.calls.find(call=>call.name==='error'&&call.args[0])?.args[0],'current initial failure');
    else assert.equal(screen.calls.find(call=>call.name==='trip').args[0].title,'new');
    if(!olderFirst){const before=screen.calls.length;reads[0].reject(Error('obsolete initial failure'));await initial;assert.equal(screen.calls.length,before);}
  }
});

test('retained initial focus callback keeps loaded trip and shows retry banner on later failure',async()=>{
  const {hooksFixture}=require('./helpers/hooks-fixture.cjs');const host=hooksFixture();const reads=[];
  const screen=tripDetailScreen({...host.hooks,BackHandler:{addEventListener:()=>({remove(){}})},getTripJsonById:()=>{const p=deferred();reads.push(p);return p.promise;}});
  // Start as a real mount, not this older fixture's pre-seeded loaded screen.
  // Hook state comes from host, so setState on the fixture does not pre-seed it.
  const render=()=>host.render(()=>screen.render());render();assert.equal(reads.length,2);
  reads[1].resolve({_id:'trip-a',user:{_id:'owner'},recommendations:[],likes:[],comments:[]});await tick();
  reads[0].resolve({_id:'old',likes:[],comments:[]});await tick();
  assert.ok(nodes(render(),'AddRecommendationModal').length);
  host.blur();host.focus();assert.equal(reads.length,3);reads[2].reject(Error('Focus offline'));await tick();
  const tree=render();assert.ok(nodes(tree,'AddRecommendationModal').length);assert.match(alertText(tree),/Focus offline/);
  assert.ok(button(tree,'trip-refresh-retry'));
});


test('sheet thumbnail retry identity advances only on current successful loads',async()=>{
  let result=Promise.resolve();const props={tripId:'trip',visible:true,load:()=>result};
  const loader=lifecycle('src/hooks/useSocialSheetLoader.js','useSocialSheetLoader',props);
  loader.render();loader.effects();await tick();const accepted=loader.render().refreshIdentity;assert.ok(accepted);
  const pending=deferred();result=pending.promise;const retry=loader.render().retry();assert.equal(loader.render().refreshIdentity,accepted);
  pending.reject(Error('offline'));await retry;assert.equal(loader.render().refreshIdentity,accepted);
  result=Promise.resolve();await loader.render().retry();const next=loader.render().refreshIdentity;assert.notEqual(next,accepted);
  const old=deferred();result=old.promise;const stale=loader.render().retry();await tick();props.tripId='new';loader.render();loader.effects();
  old.resolve();await stale;await tick();assert.notEqual(loader.render().refreshIdentity,next);
});
test('sheet passes accepted photo retry identity to shared cards and stays read-only with list/detail navigation',()=>{
  const refreshIdentity={},rec={_id:'rec',photos:['a'.repeat(24)]};let closes=0;
  const sheet=lifecycle('src/components/sheets/RecommendationsSheet.js','RecommendationsSheet',{visible:true,trip:{_id:'trip'},onClose:()=>closes++},
    {useTripSocial:()=>({recommendations:[rec],loadRecommendations:async()=>{}}),useSocialSheetLoader:()=>({...initialLoader,refreshIdentity}),RecommendationDetailModal:'RecommendationDetailModal',RecommendationCard:'RecommendationCard',lineStringToCoords:()=>[]});
  sheet.render();sheet.effects();let tree=sheet.render();const row=nodes(tree,'FlatList')[0].props.renderItem({item:rec});
  assert.equal(row.type,'RecommendationCard');assert.equal(row.props.photoRefreshIdentity,refreshIdentity);assert.equal(row.props.onLongPress,undefined);
  row.props.onPress();tree=sheet.render();const detail=nodes(tree,'RecommendationDetailModal')[0];assert.equal(detail.props.readOnly,true);assert.equal(detail.props.recommendation,rec);
  detail.props.onClose();assert.equal(closes,0);row.props.onPress();nodes(sheet.render(),'RecommendationDetailModal')[0].props.onNavigateClose();assert.equal(closes,1);
});

test('trip detail keeps shared-card tap, owner deletion, optional-photo updates and non-owner read actions',async()=>{
  const alerts=[];let deletes=0;
  const screen=tripDetailScreen({TripRecommendationCard:'TripRecommendationCard',Alert:{alert:(...args)=>alerts.push(args)},deleteRecommendation:async()=>deletes++});
  await screen.prime();
  const base={_id:'trip-a',user:{_id:'owner'},commentsCount:0};
  const rec={_id:'rec',name:'Place',photos:[]};
  screen.setState(0,{...base,recommendations:[rec]});let tree=screen.render();let row=nodes(tree,'TripRecommendationCard')[0];
  assert.equal(row.props.rec,rec);assert.ok(row.props.photoRefreshIdentity);
  row.props.onPress();assert.equal(nodes(screen.render(),'RecommendationDetailModal')[0].props.recommendation,rec);
  for(const photos of [['a'.repeat(24)],[]]) {
    screen.setState(0,{...base,recommendations:[{...rec,photos}]});row=nodes(screen.render(),'TripRecommendationCard')[0];assert.deepEqual(row.props.rec.photos,photos);
  }
  row.props.onLongPress();await alerts.at(-1)[2].find(item=>item.text==='Delete').onPress();
  assert.equal(deletes,1);assert.equal(nodes(screen.render(),'TripRecommendationCard').length,0);
  screen.setState(0,{...base,user:{_id:'other'},recommendations:[rec]});row=nodes(screen.render(),'TripRecommendationCard')[0];
  assert.equal(row.props.onLongPress,undefined);assert.equal(typeof row.props.onPress,'function');
});
