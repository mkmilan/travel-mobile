const test=require('node:test');
const assert=require('node:assert/strict');
const {load,fixture,nodes,native,theme}=require('./helpers/component-fixture.cjs');
const {hooksFixture,authFixture}=require('./helpers/hooks-fixture.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const json=value=>JSON.parse(JSON.stringify(value));
function photoEnvironment(extra={}){
  const host=hooksFixture(),auth=authFixture();
  const useProfileContext=load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.store});
  const usePhotoManager=load('src/hooks/usePhotoManager.js','usePhotoManager',{...host.hooks,useProfileContext,...extra});
  return {host,auth,usePhotoManager};
}
function manager(props={initial:['photo'],context:'trip',id:'item'},extra={}){
  const env=photoEnvironment(extra);
  return {...env,props,render:()=>env.host.render(()=>env.usePhotoManager(props))};
}

test('MOB-028 failed existing trip/recommendation DELETE retains thumbnail, exposes retry, and successful repeat never deletes twice',async()=>{
  for(const context of ['trip','recommendation']) {
    let fail=true;const calls=[];
    const remove=async(id,photo)=>{calls.push([id,photo]);if(fail)throw Error('offline');};
    const hook=manager({initial:['photo','file://local'],context,id:'item'},{deleteTripPhoto:remove,deleteRecommendationPhoto:remove});
    let api=hook.render();assert.equal(await api.removePhoto('photo'),false);api=hook.render();
    assert.deepEqual(json(api.photos),['photo','file://local']);assert.match(api.deleteError,/Photo removal was not confirmed.*offline/);assert.equal(api.deleting,false);
    fail=false;assert.equal(await api.retryRemovePhoto(),true);api=hook.render();assert.deepEqual(json(api.photos),['file://local']);assert.equal(api.deleteError,null);
    await api.removePhoto('photo');assert.equal(calls.length,2);assert.equal(await api.removePhoto('file://local'),true);assert.deepEqual(json(hook.render().photos),[]);assert.equal(calls.length,2);
  }
});

test('MOB-028 repeated DELETE is single-flight, blocks save upload/picker, and upload in progress blocks deletion',async()=>{
  const pending=deferred();let calls=0,uploads=0,picks=0;
  const hook=manager(undefined,{deleteTripPhoto:()=>{calls++;return pending.promise;},uploadTripPhoto:async()=>{uploads++;return {photoIds:['uploaded']};},ImagePicker:{launchImageLibraryAsync:async()=>{picks++;return {canceled:true};}}});
  const api=hook.render();const first=api.removePhoto('photo');assert.equal(api.removePhoto('photo'),first);assert.equal(api.isDeleting(),true);await tick();
  await assert.rejects(api.uploadPendingPhotos('item'),/removal to finish/);await api.addPhotos();assert.equal(calls,1);assert.equal(uploads,0);assert.equal(picks,0);
  pending.resolve();await first;assert.equal(hook.render().deleting,false);
  const upload=deferred();const other=manager({initial:['photo','file://a'],context:'trip',id:'item'},{uploadTripPhoto:()=>upload.promise,deleteTripPhoto:()=>{throw Error('must not delete');}});
  const otherApi=other.render();const saving=otherApi.uploadPendingPhotos('item');assert.equal(await otherApi.removePhoto('photo'),false);upload.resolve({photoIds:['uploaded']});await saving;
  assert.deepEqual(json(other.render().photos),['photo','uploaded']);
});

test('MOB-028 late success/failure and old delete callbacks cannot modify a replaced draft, item, login or unmounted hook',async()=>{
  for(const change of ['draft','item','session','same-token-login','unmount'])for(const reject of [false,true]) {
    const pending=deferred();let calls=0;
    const hook=manager(undefined,{deleteTripPhoto:()=>{calls++;return pending.promise;}});const api=hook.render();const removing=api.removePhoto('photo');await tick();
    if(change==='draft')api.setPhotos(['photo','new-draft']);
    if(change==='item'){hook.props.id='new-item';hook.props.initial=['new-photo'];hook.render();}
    if(change==='session'||change==='same-token-login'){hook.auth.set({token:null,user:null});hook.auth.set({token:change==='session'?'new-token':'session-one',user:{_id:'actor'}});const transition=hook.render();assert.deepEqual(json(transition.photos),[]);assert.equal(transition.deleteError,null);}
    if(change==='unmount')hook.host.unmount();
    reject?pending.reject(Error('late failure')):pending.resolve();assert.equal(await removing,false);
    if(change==='unmount'){assert.equal(await api.removePhoto('photo'),false);assert.equal(calls,1);continue;}
    const next=hook.render();assert.equal(next.deleteError,null);assert.equal(next.deleting,false);
    if(change==='draft')assert.deepEqual(json(next.photos),['photo','new-draft']);
    if(change==='item')assert.deepEqual(json(next.photos),['new-photo']);
    if(change==='session'||change==='same-token-login')assert.deepEqual(json(next.photos),[]);
    if(change!=='draft'){assert.equal(await api.removePhoto('photo'),false);assert.equal(calls,1);}
  }
});

test('MOB-028 missing target fails visibly; created recommendation ID survives partial upload and old-render delete callback',async()=>{
  let calls=0;const deleted=[];const hook=manager({initial:['photo'],context:'recommendation',id:null},{deleteRecommendationPhoto:async(id,photo)=>deleted.push([id,photo]),uploadRecommendationPhoto:async(id,uri)=>{calls++;if(uri==='file://b')throw Error('partial');return {photoIds:['saved-a']};}});
  const api=hook.render();assert.equal(await api.removePhoto('photo'),false);assert.match(hook.render().deleteError,/Reopen the saved item/);assert.equal(deleted.length,0);
  api.setPhotos(['file://a','file://b']);await assert.rejects(api.uploadPendingPhotos('created-id'),/1 photo could not be uploaded/);
  assert.deepEqual(json(hook.render().photos),['saved-a','file://b']);assert.equal(await api.removePhoto('saved-a'),true);
  assert.deepEqual(deleted,[['created-id','saved-a']]);assert.deepEqual(json(hook.render().photos),['file://b']);assert.equal(calls,2);
});

function tripEditor(remove){
  const alerts=[],updates=[],routes=[];const env=photoEnvironment({deleteTripPhoto:remove});
  const form=fixture('app/(tabs)/trip/[id]/edit.js','EditTripScreen',{}, {...native,theme,...env.host.hooks,usePhotoManager:env.usePhotoManager,useAuthStore:env.auth.store,StyleSheet:{create:x=>x},Feather:'Feather',TransportIcon:'TransportIcon',TripPhotoThumb:'TripPhotoThumb',
    useLocalSearchParams:()=>({id:'item'}),useRouter:()=>({replace:path=>routes.push(path),back(){}}),travelModeOptions:[],tripVisibilityOptions:[],
    getTripJsonById:async()=>({_id:'item',user:{_id:'actor'},title:'Kept title',description:'Kept description',photos:['photo']}),updateTripJson:async(...args)=>updates.push(args),Alert:{alert:(...args)=>alerts.push(args)},
  });
  const render=()=>env.host.render(()=>form.render());
  return {...env,alerts,updates,routes,render,save:()=>nodes(render(),'Pressable').find(n=>n.props.testID==='trip-edit-save')};
}

test('MOB-028 actual trip editor confirmation keeps failed thumbnail and metadata with visible retry; stale same-render save is blocked during deletion',async()=>{
  const pending=deferred();let calls=0;const screen=tripEditor(()=>{calls++;return calls===1?pending.promise:Promise.resolve();});
  screen.render();await tick();let tree=screen.render();const save=screen.save().props.onPress;
  nodes(tree,'TripPhotoThumb')[0].props.onPress();const confirm=screen.alerts.at(-1)[2].find(button=>button.text==='Delete').onPress;confirm();confirm();await save();await tick();
  assert.equal(calls,1);assert.equal(screen.updates.length,0);assert.equal(screen.save().props.disabled,true);
  pending.reject(Error('offline'));await tick();tree=screen.render();assert.equal(nodes(tree,'TripPhotoThumb').length,1);assert.ok(nodes(tree,'Text').some(n=>n.props.accessibilityRole==='alert'&&n.children.join('').includes('Photo removal was not confirmed')));
  assert.deepEqual(nodes(tree,'TextInput').map(n=>n.props.value),['Kept title','Kept description']);assert.equal(screen.routes.length,0);
  nodes(tree,'Pressable').find(n=>nodes(n,'Text').some(t=>t.children.includes('Retry remove photo'))).props.onPress();await tick();tree=screen.render();assert.equal(nodes(tree,'TripPhotoThumb').length,0);assert.equal(calls,2);
});

function recommendationEditor(remove){
  const alerts=[],submits=[];const env=photoEnvironment({deleteRecommendationPhoto:remove});
  const form=fixture('src/components/modals/AddRecommendationModal.js','AddRecommendationModal',{onSubmit:async(...args)=>{submits.push(args);return {_id:'item'};}}, {...native,theme,...env.host.hooks,usePhotoManager:env.usePhotoManager,useAuthStore:env.auth.store,StyleSheet:{create:x=>x,absoluteFill:{}},BottomModal:'BottomModal',ModalHeader:'ModalHeader',TripPhotoThumb:'TripPhotoThumb',Ionicons:'Ionicons',MapView:'MapView',Marker:'Marker',StarRating:'StarRating',RECOMMENDATION_CATEGORIES:[],RECOMMENDATION_TAGS:[],Alert:{alert:(...args)=>alerts.push(args)}});
  const render=()=>env.host.render(()=>form.render());
  const photoSection=tree=>{const node=nodes(tree).find(n=>n.type?.name==='PhotoSection');return node.type(node.props);};
  return {...env,form,alerts,submits,render,photoSection,save:()=>nodes(render(),'Pressable').find(n=>n.props.testID==='recommendation-save')};
}

test('MOB-028 actual recommendation editor retains failed photo and retry UI; pending confirmation blocks stale Save, Close and reopen',async()=>{
  const pending=deferred();let calls=0;const screen=recommendationEditor(()=>{calls++;return calls===1?pending.promise:Promise.resolve();});
  screen.render();screen.form.ref.current.openEdit({_id:'item',name:'Kept',description:'Description',photos:['photo'],rating:5,primaryCategory:'nature',attributeTags:['quiet'],location:{coordinates:[2,1]}});screen.render();let tree=screen.render();const save=screen.save().props.onPress;
  nodes(screen.photoSection(tree),'TripPhotoThumb')[0].props.onPress();screen.alerts.at(-1)[2].find(b=>b.text==='Delete').onPress();await save();tree.props.onClose();screen.form.ref.current.open();await tick();
  assert.equal(calls,1);assert.equal(screen.submits.length,0);assert.equal(screen.render().props.visible,true);assert.equal(screen.save().props.disabled,true);
  pending.reject(Error('offline'));await tick();tree=screen.render();let photos=screen.photoSection(tree);assert.equal(nodes(photos,'TripPhotoThumb').length,1);assert.ok(nodes(photos,'Text').some(n=>n.props.accessibilityRole==='alert'));
  assert.equal(nodes(tree,'TextInput')[0].props.value,'Kept');nodes(photos,'Pressable').find(n=>nodes(n,'Text').some(t=>t.children.includes('Retry remove photo'))).props.onPress();await tick();
  assert.equal(nodes(screen.photoSection(screen.render()),'TripPhotoThumb').length,0);assert.equal(calls,2);assert.equal(screen.submits.length,0);
});


test('MOB-028 an Alert confirmation from an older photo draft cannot delete the same ID in a reopened draft',async()=>{
  let calls=0;const hook=manager(undefined,{deleteTripPhoto:async()=>calls++});const api=hook.render();
  const confirm=api.prepareRemovePhoto('photo');api.setPhotos(['photo','new-draft']);
  assert.equal(await confirm(),false);assert.equal(calls,0);assert.deepEqual(json(hook.render().photos),['photo','new-draft']);
});
