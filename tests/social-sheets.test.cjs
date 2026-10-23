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

test('recommendation destination handlers use source close callback, retaining ordinary Back semantics',()=>{
  const events=[];const props={isVisible:true,onClose:()=>events.push('detail-close'),onNavigateClose:()=>events.push('all-close'),recommendation:{_id:'rec',user:{_id:'author',username:'Fixture'},associatedTrip:'trip',photos:[]}};
  const form=lifecycle('src/components/modals/RecommendationDetailModal.js','RecommendationDetailModal',props,{Ionicons:'Ionicons',InteractiveTripMap:'InteractiveTripMap',PhotoGallery:'PhotoGallery',useRouter:()=>({push:path=>events.push(path)})});
  const tree=form.render();nodes(tree,'ModalHeader')[0].props.onClose();assert.deepEqual(events,['detail-close']);
  const links=nodes(tree,'Pressable');links[0].props.onPress();links[1].props.onPress();assert.deepEqual(events,['detail-close','all-close','/user/author','all-close','/trip/trip']);
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
  assert.match(source,/<AddCommentModal\s+key=\{commentContext.current.key\}/);
  const start=source.indexOf('const handleAddCommentSubmit = '),end=source.indexOf('\n\tconst handleDeleteComment',start);
  for(const change of ['trip','session','unmount','none']) {
    const pending=deferred();const session={token:'a',user:{_id:'owner'}};const original={tripId:'trip-a',token:'a',userId:'owner'};
    const commentContext={current:original},commentMounted={current:true};const calls=[];
    const handler=require('node:vm').runInNewContext(source.slice(start,end)+';handleAddCommentSubmit',{
      tripId:'trip-a',isAuthenticated:true,trip:{_id:'trip-a',commentsCount:0},commentContext,commentMounted,useAuthStore:{getState:()=>session},
      addTripComment:()=>pending.promise,setComments:update=>{calls.push('comments');assert.equal(update([]).length,1);},setTrip:update=>{calls.push('trip');assert.equal(update({_id:'trip-a',commentsCount:0}).commentsCount,1);},setCommentCount:()=>calls.push('count'),setIsCommentListExpanded:()=>calls.push('expand'),setIsCommentsSectionVisible:()=>calls.push('visible'),isCommentListExpanded:false,isCommentsSectionVisible:false,Alert:{alert:()=>calls.push('alert')},
    });
    const request=handler('Text');if(change==='trip')commentContext.current={...original,tripId:'trip-b'};if(change==='session')session.token='b';if(change==='unmount')commentMounted.current=false;
    pending.resolve({_id:'posted'});await request;assert.equal(calls.length,change==='none'?5:0);
  }
});
