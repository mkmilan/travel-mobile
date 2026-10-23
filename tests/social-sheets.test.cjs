const test = require('node:test');
const assert = require('node:assert/strict');
const {read,load,fixture,nodes,theme,native} = require('./helpers/component-fixture.cjs');
const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const defaults={...native,theme,StyleSheet:{create:value=>value},BottomModal:'BottomModal',ModalHeader:'ModalHeader',BaseSheet:'BaseSheet',Avatar:'Avatar',Feather:'Feather',isoToDate:()=>'',useRouter:()=>({push(){}}),useAuthStore:()=>({user:{_id:'fixture-user'},token:'fixture-session'})};
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
  await button(tree,'comments-refresh-posted').props.onPress();tree=form.render();assert.equal(sends,1);assert.equal(loads,2);assert.equal(alertText(tree),'');
});

test('comment sheet ignores an old save response after trip identity changes',async()=>{
  const pending=deferred();const props={visible:true,trip:{_id:'trip-a'},onClose(){}};
  const form=lifecycle('src/components/sheets/CommentsSheet.js','CommentsSheet',props,{useTripSocial:()=>({comments:[],loadComments:async()=>{},addComment:()=>pending.promise})});
  form.render();form.effects();input(form.render()).props.onChangeText('Old');const saving=button(form.render(),'comments-send').props.onPress();
  props.trip={_id:'trip-b'};form.render();form.effects();input(form.render()).props.onChangeText('New');pending.resolve({refreshError:'fixture'});await saving;
  assert.equal(input(form.render()).props.value,'New');assert.equal(alertText(form.render()),'');
});

function socialStore(dependencies={}) {
  let state;const store=load('src/stores/tripSocialStore.js','useTripSocialStore',{
    create:initialize=>{state=initialize(patch=>{state={...state,...(typeof patch==='function'?patch(state):patch)};},()=>state);return {getState:()=>state};},
    getTripComments:async()=>[],getTripLikers:async()=>[],getTripJsonById:async()=>({}),addTripComment:async()=>({_id:'fixture'}),likeTrip:async()=>{},unlikeTrip:async()=>{},...dependencies,
  });return store;
}
test('social store keeps POST failure distinct from refresh failure after a committed comment',async()=>{
  let posts=0,gets=0;const store=socialStore({addTripComment:async()=>{posts++;return {_id:'saved'};},getTripComments:async()=>{gets++;throw Error('offline');}});
  const result=await store.getState().addComment('trip','Text');assert.equal(result.comment._id,'saved');assert.equal(result.refreshError,'offline');assert.equal(posts,1);assert.equal(gets,1);
  const failure=socialStore({addTripComment:async()=>{throw Error('POST failed');},getTripComments:async()=>{gets++;}});
  await assert.rejects(failure.getState().addComment('trip','Text'),/POST failed/);assert.equal(gets,1);
});
