const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture,nodes,theme,native} = require('./helpers/component-fixture.cjs');
const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const json = value => JSON.parse(JSON.stringify(value));
const photoContext={valid:true,token:'fixture-session',userId:'fixture-owner',isCurrent:()=>true};
const manager = ({initial=[],context='trip',upload=async(id,uri)=>({photoIds:[`saved-${uri.split('/').at(-1)}`]}),extra={}}={}) => fixture('src/hooks/usePhotoManager.js','usePhotoManager',{initial,context,id:'fixture-item'}, {
  useProfileContext:()=>photoContext,uploadTripPhoto:upload,uploadRecommendationPhoto:upload,uploadProfilePhoto:async uri=>({profilePictureUrl:(await upload('profile',uri)).photoIds[0]}),...extra,
});

test('photo upload success replaces every local URI with confirmed IDs and never reuploads server photos',async()=>{
  const calls=[];const hook=manager({initial:['server-existing','file://a','file://b'],upload:async(id,uri)=>{calls.push({id,uri});return {photoIds:[`server-${uri.at(-1)}`]};}});
  const api=hook.render();const result=await api.uploadPendingPhotos('fixture-item');
  assert.deepEqual(json(result),{photoIds:['server-existing','server-a','server-b'],uploadedCount:2});
  assert.deepEqual(json(hook.render().photos),result.photoIds);assert.equal(hook.render().uploading,false);
  await api.uploadPendingPhotos('fixture-item');assert.equal(calls.length,2);
});

test('partial photo failure retains failed files; same-render retry sends only unconfirmed files',async()=>{
  let fail=true;const calls=[];const hook=manager({initial:['server-existing','file://a','file://b'],upload:async(id,uri)=>{calls.push(uri);if(uri==='file://b'&&fail)throw Error('synthetic unavailable');return {photoIds:[`server-${uri.at(-1)}`]};}});
  const original=hook.render();
  await assert.rejects(original.uploadPendingPhotos('fixture-item'),/1 photo could not be uploaded/);
  assert.deepEqual(json(hook.render().photos),['server-existing','server-a','file://b']);
  assert.deepEqual(json(original.getPhotos()),['server-existing','server-a','file://b']);
  assert.equal(hook.render().uploading,false);fail=false;
  // Intentionally reuse the old render's callback. Ref-backed IDs must still win.
  await original.uploadPendingPhotos('fixture-item');
  assert.deepEqual(calls,['file://a','file://b','file://b']);
  assert.deepEqual(json(hook.render().photos),['server-existing','server-a','server-b']);
});

test('all failures and malformed upload success replies remain retryable rather than reporting success',async()=>{
  const hook=manager({context:'recommendation',initial:['file://a','file://b'],upload:async(id,uri)=>{if(uri==='file://a')throw null;return {photoIds:[]};}});
  await assert.rejects(hook.render().uploadPendingPhotos('fixture-item'),/2 photos could not be uploaded/);
  assert.deepEqual(json(hook.render().photos),['file://a','file://b']);assert.equal(hook.render().uploading,false);
});

test('pending uploads are single-flight per target and missing targets cannot silently drop local photos',async()=>{
  const pending=deferred();let calls=0;const hook=manager({initial:['file://a'],upload:()=>{calls++;return pending.promise;}});
  const api=hook.render();
  for(const invalid of [null,undefined,'new',''])await assert.rejects(api.uploadPendingPhotos(invalid),/Save the item/);
  assert.equal(calls,0);
  const first=api.uploadPendingPhotos('fixture-item');assert.equal(api.uploadPendingPhotos('fixture-item'),first);
  await assert.rejects(api.uploadPendingPhotos('other-item'),/Another photo upload/);
  assert.equal(calls,1);assert.equal(hook.render().uploading,true);
  pending.resolve({photoIds:['server-a']});await first;assert.equal(hook.render().uploading,false);
});

test('replacing the photo draft during an older upload does not overwrite the newer draft',async()=>{
  const pending=deferred();const hook=manager({initial:['file://a'],upload:()=>pending.promise});const api=hook.render();
  const saving=api.uploadPendingPhotos('fixture-item');api.setPhotos(['file://new-draft']);
  pending.resolve({photoIds:['server-a']});await assert.rejects(saving,/selection changed/);
  assert.deepEqual(json(hook.render().photos),['file://new-draft']);assert.equal(hook.render().uploading,false);
});

test('an old image picker or resize result cannot append photos to a newer draft',async()=>{
  for(const stage of ['picker','resize']) {
    const pending=deferred(),started=deferred();let resized=0;
    const hook=manager({initial:['server-original'],extra:{
      ImagePicker:{launchImageLibraryAsync:()=>stage==='picker'?pending.promise:Promise.resolve({assets:[{uri:'file://selected'}]})},
      copyAndResizeAsync:()=>{resized++;started.resolve();return stage==='resize'?pending.promise:Promise.resolve('file://resized');},
    }});
    const api=hook.render();const selecting=api.addPhotos();
    if(stage==='resize')await started.promise;
    api.setPhotos(['server-new-draft']);
    pending.resolve(stage==='picker'?{assets:[{uri:'file://selected'}]}:'file://resized');await selecting;
    assert.deepEqual(json(api.getPhotos()),['server-new-draft']);
    assert.equal(resized,stage==='resize'?1:0);
  }
});

function tripEditor(uploadPendingPhotos,update=async()=>{}) {
  const alerts=[],routes=[],updates=[];
  const route={id:'fixture-trip'},session={user:{_id:'fixture-owner'},token:'fixture-session'};
  const auth=()=>session;auth.getState=()=>session;let cleanup;
  const form=fixture('app/(tabs)/trip/[id]/edit.js','EditTripForm',{}, {
    ...native,theme,StyleSheet:{create:value=>value},Feather:'Feather',TransportIcon:'TransportIcon',TripPhotoThumb:'TripPhotoThumb',
    useMemo:fn=>fn(),useLocalSearchParams:()=>route,useRouter:()=>({replace:route=>routes.push(route),back(){}}),
    useAuthStore:auth,useEffect:(callback,deps)=>{if(deps.length===0&&!cleanup)cleanup=callback();},travelModeOptions:[],tripVisibilityOptions:[],
    usePhotoManager:()=>({photos:['file://a'],uploading:false,uploadPendingPhotos,setPhotos(){},addPhotos(){},removePhoto(){}}),
    updateTripJson:async(id,data)=>{updates.push({id,data});return update(id,data);},Alert:{alert:(...args)=>alerts.push(args)},console:{error(){}},
  });
  form.setState(0,{_id:'fixture-trip'});form.setState(1,'  Edited title  ');form.setState(2,'  Edited description  ');form.setState(3,'private');form.setState(4,'walking');form.setState(5,false);
  return {form,alerts,routes,updates,route,session,unmount:()=>cleanup?.(),save:()=>nodes(form.render(),'Pressable').find(node=>node.props.testID==='trip-edit-save')};
}

test('trip edit photo failure retains metadata and does not PATCH, announce success or navigate',async()=>{
  let fail=true;const pending=deferred();let calls=0;
  const editor=tripEditor(()=>{calls++;return fail?pending.promise:Promise.resolve();});
  const callback=editor.save().props.onPress;const saving=callback();await callback();
  assert.equal(calls,1);assert.equal(editor.save().props.disabled,true);
  assert.ok(nodes(editor.form.render(),'TextInput').every(input=>input.props.editable===false));
  pending.reject(Error('Photo failed; retry remaining photo.'));await saving;
  const tree=editor.form.render();assert.equal(editor.save().props.disabled,false);
  assert.deepEqual(nodes(tree,'TextInput').map(input=>input.props.value),['  Edited title  ','  Edited description  ']);
  assert.ok(nodes(tree,'Text').some(node=>node.props.accessibilityRole==='alert'));
  assert.equal(editor.updates.length,0);assert.equal(editor.routes.length,0);assert.equal(editor.alerts.some(([title])=>title==='Success'),false);
  fail=false;await editor.save().props.onPress();
  assert.deepEqual(json(editor.updates),[{id:'fixture-trip',data:{title:'Edited title',description:'Edited description',defaultTripVisibility:'private',defaultTravelMode:'walking'}}]);
  assert.deepEqual(editor.routes,['/(tabs)/trip/fixture-trip']);assert.equal(editor.alerts.at(-1)[0],'Success');
});

test('trip metadata failure after photo success leaves retry available and does not navigate',async()=>{
  const editor=tripEditor(async()=>{},async()=>{throw Error('Synthetic metadata failure');});
  await editor.save().props.onPress();assert.equal(editor.updates.length,1);assert.equal(editor.routes.length,0);
  assert.equal(editor.save().props.disabled,false);assert.equal(editor.alerts.at(-1)[0],'Error');
});

test('an old render save handler cannot start an upload under a newer trip or session',async()=>{
  for(const change of ['trip','token','user']) {
    let uploads=0;const editor=tripEditor(async()=>{uploads++;});const oldSave=editor.save().props.onPress;
    if(change==='trip')editor.route.id='different-trip';
    if(change==='token')editor.session.token='different-session';
    if(change==='user')editor.session.user={_id:'different-owner'};
    editor.form.render();await oldSave();
    assert.equal(uploads,0);assert.equal(editor.updates.length,0);assert.equal(editor.routes.length,0);
  }
});

test('trip edit interrupts post-upload continuation when unmounted or trip/session changes',async()=>{
  for(const change of ['unmount','trip','token','user']) {
    for(const rejects of [false,true]) {
      const pending=deferred();const editor=tripEditor(()=>pending.promise);
      const saving=editor.save().props.onPress();
      if(change==='unmount')editor.unmount();
      if(change==='trip'){editor.route.id='different-trip';editor.form.render();}
      if(change==='token')editor.session.token='different-session'; // live getter must guard even before a rerender
      if(change==='user')editor.session.user={_id:'different-owner'};
      rejects?pending.reject(Error('Old upload failure')):pending.resolve();await saving;
      assert.equal(editor.updates.length,0,`${change}: no metadata PATCH after lost context`);
      assert.equal(editor.routes.length,0);assert.equal(editor.alerts.length,0);
      assert.equal(nodes(editor.form.render(),'Text').some(node=>node.props.accessibilityRole==='alert'),false);
    }
  }
});

test('an already-started trip PATCH may settle but cannot navigate or announce into a different context',async()=>{
  for(const change of ['unmount','trip','token','user']) {
    for(const rejects of [false,true]) {
      const pending=deferred(),started=deferred();const editor=tripEditor(async()=>{},()=>{started.resolve();return pending.promise;});
      const saving=editor.save().props.onPress();await started.promise;
      if(change==='unmount')editor.unmount();
      if(change==='trip'){editor.route.id='different-trip';editor.form.render();}
      if(change==='token')editor.session.token='different-session';
      if(change==='user')editor.session.user={_id:'different-owner'};
      rejects?pending.reject(Error('Old metadata failure')):pending.resolve();await saving;
      assert.equal(editor.updates.length,1);assert.equal(editor.routes.length,0);assert.equal(editor.alerts.length,0);
      assert.equal(nodes(editor.form.render(),'Text').some(node=>node.props.accessibilityRole==='alert'),false);
    }
  }
});

function recommendationEditor({submit,upload,refresh=()=>{}}) {
  let selected=[];const alerts=[],configs=[];const requests=[],uploads=[],effects=[];
  const session={user:{_id:"fixture-owner"},token:"fixture-token"};const useAuthStore=Object.assign(()=>session,{getState:()=>session});
  const form=fixture('src/components/modals/AddRecommendationModal.js','AddRecommendationModal',{
    onSubmit:async(data,edit)=>{requests.push({data,edit});return submit?submit(data,edit):{_id:'created-rec',refreshCallback:refresh};},
  }, {
    ...native,theme,useAuthStore,useEffect:callback=>effects.push(callback),StyleSheet:{create:value=>value,absoluteFill:{}},BottomModal:'BottomModal',ModalHeader:'ModalHeader',TripPhotoThumb:'TripPhotoThumb',Ionicons:'Ionicons',MapView:'MapView',Marker:'Marker',StarRating:'StarRating',
    RECOMMENDATION_CATEGORIES:[{value:'nature',label:'Nature'}],RECOMMENDATION_TAGS:[{value:'quiet',label:'Quiet'}],
    Alert:{alert:(...args)=>alerts.push(args)},console:{error(){}},
    usePhotoManager:config=>{configs.push(config);return {
      photos:selected,getPhotos:()=>selected,uploading:false,setPhotos:value=>{selected=value;},
      uploadPendingPhotos:async id=>{uploads.push(id);return upload(id,()=>selected,value=>{selected=value;});},
    };},
  });
  form.render();form.ref.current.open({lat:1,lon:2},'fixture-trip');let tree=form.render();
  nodes(tree,'TextInput')[0].props.onChangeText('Recommendation');nodes(tree,'TextInput')[1].props.onChangeText('Description');
  nodes(tree,'StarRating')[0].props.onRatingChange(4);nodes(tree).find(n=>n.props.onCategoryChange).props.onCategoryChange('nature');nodes(tree).find(n=>n.props.onTagsChange).props.onTagsChange(['quiet']);
  selected=['file://a','file://b'];
  return {form,alerts,requests,uploads,configs,session,unmount:()=>effects[0]()(),photos:()=>selected,save:()=>nodes(form.render(),'Pressable').find(n=>n.props.testID==='recommendation-save')};
}

test('new recommendation photo retry preserves created identity and confirmed photo IDs without a second create',async()=>{
  let fail=true,refreshes=0;
  const editor=recommendationEditor({refresh:()=>{refreshes++;return Promise.reject(Error('List unavailable'));},upload:async(id,get,set)=>{
    assert.equal(id,'created-rec');
    if(fail){set(['server-a','file://b']);throw Error('1 photo could not be uploaded. Retry remaining photos.');}
    assert.deepEqual(get(),['server-a','file://b']);set(['server-a','server-b']);
  }});
  const callback=editor.save().props.onPress;await callback();
  let tree=editor.form.render();assert.equal(tree.props.visible,true);assert.equal(editor.requests.length,1);
  assert.equal(editor.alerts.some(([title])=>title==='Success'),false);
  assert.ok(nodes(tree,'Text').some(n=>n.props.accessibilityRole==='alert' && n.children.join('').includes('already exists')));
  assert.equal(editor.configs.at(-1).id,null); // changing this prop would discard failed local files
  fail=false;await callback(); // old render callback must still use the retained identity/current photo IDs
  assert.equal(editor.form.render().props.visible,false);assert.equal(editor.requests.length,2);
  assert.equal(editor.requests[0].edit,false);assert.equal(editor.requests[1].edit,true);
  assert.equal(editor.requests[1].data._id,'created-rec');assert.deepEqual(json(editor.requests[1].data.photoIds),['server-a']);
  assert.deepEqual(editor.uploads,['created-rec','created-rec']);assert.equal(refreshes,2);
  assert.equal(editor.alerts.at(-1)[0],'Success');assert.deepEqual(editor.photos(),['server-a','server-b']);
});

test('partial recommendation upload can be cancelled without another create and reopening starts a new draft',async()=>{
  const editor=recommendationEditor({upload:async()=>{throw Error('Photos unavailable');}});
  await editor.save().props.onPress();let tree=editor.form.render();tree.props.onClose();assert.equal(editor.form.render().props.visible,false);
  assert.equal(editor.requests.length,1);editor.form.ref.current.open({lat:1,lon:2});tree=editor.form.render();
  assert.equal(nodes(tree,'TextInput')[0].props.value,'');assert.equal(nodes(tree,'Text').filter(n=>n.props.accessibilityRole==='alert').length,0);
  assert.deepEqual(json(editor.photos()),[]);
});

test('interrupted recommendation create/upload cannot continue or close a new session draft',async()=>{
  for(const phase of ['create','upload'])for(const interruption of ['unmount','token'])for(const outcome of ['resolve','reject']) {
    const pending=deferred();let refreshes=0;
    const saved={_id:'created-rec',refreshCallback:()=>refreshes++};
    const editor=recommendationEditor({submit:()=>phase==='create'?pending.promise:Promise.resolve(saved),upload:()=>phase==='upload'?pending.promise:Promise.resolve()});
    const oldSave=editor.save().props.onPress;const work=oldSave();await new Promise(setImmediate);
    if(interruption==='unmount') editor.unmount();
    else {
      editor.session.token='fixture-new-session';editor.form.render();assert.equal(editor.form.render().props.visible,false);
      editor.form.ref.current.open({lat:1,lon:2});assert.equal(editor.form.render().props.visible,true);
    }
    if(outcome==='resolve')pending.resolve(saved);else pending.reject(Error('Synthetic interrupted failure'));
    await work;await oldSave();
    assert.equal(editor.requests.length,1);assert.equal(editor.uploads.length,phase==='create'?0:1);
    assert.equal(editor.alerts.length,0);assert.equal(refreshes,0);
    if(interruption==='token') {
      const tree=editor.form.render();assert.equal(tree.props.visible,true);assert.equal(nodes(tree,'TextInput')[0].props.value,'');
      assert.equal(nodes(tree,'Text').filter(n=>n.props.accessibilityRole==='alert').length,0);
    }
  }
});
