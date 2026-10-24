const test = require('node:test');
const assert = require('node:assert/strict');
const {read,load,fixture,nodes,theme,native} = require('./helpers/component-fixture.cjs');
const noteTools = load('src/utils/poiNote.js', '({POI_NOTE_MAX_LENGTH,validatePoiNote,getPoiNote})');
const tripTools = load('src/db/tripDao.js','({tripMetadataDefaults})');
const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tripForm = onConfirm => fixture('src/components/modals/TripSaveModal.js','TripSaveModal',{onConfirm},{...native,theme,TransportIcon:'TransportIcon',RecordingFormModal:'RecordingFormModal',useAuthStore:select=>select({user:{settings:{defaultTravelMode:'walking'}}})});
const saveButton = tree => nodes(tree,'Pressable').find(node=>node.props.testID==='trip-save');

test('recording presentation has sibling backdrop, safe-area footer and one keyboard layer, not a swipe responder',()=>{
  for (const OS of ['android','ios']) {
    let closed=0;
    const render=(visible,busy=false)=>fixture('src/components/modals/RecordingFormModal.js','RecordingFormModal',{visible,busy,title:'Save trip',onClose:()=>closed++,children:'form'}, {...native,theme,Platform:{OS},StyleSheet:{create:styles=>styles,absoluteFillObject:{position:'absolute'}}}).render();
    assert.equal(render(false),null);
    const tree=render(true);
    assert.equal(tree.type,'Modal'); assert.equal(tree.props.navigationBarTranslucent,true);
    const provider=nodes(tree,'SafeAreaProvider')[0];
    assert.equal(provider.children[0].props.testID,'recording-form-backdrop');
    assert.equal(provider.children[1].props.pointerEvents,'box-none');
    const keyboard=nodes(tree,'KeyboardAvoidingView'); assert.equal(keyboard.length,1);
    assert.equal(keyboard[0].props.pointerEvents,'box-none');
    assert.equal(keyboard[0].props.behavior,OS==='ios'?'padding':undefined);
    assert.ok(nodes(tree,'SafeAreaView').some(node=>JSON.stringify(node.props.edges)==='["bottom"]' && node.props.style.padding>0));
    tree.props.onRequestClose(); provider.children[0].props.onPress(); nodes(tree,'Pressable').find(node=>node.props.accessibilityRole==='button').props.onPress();
    assert.equal(closed,3);
    const busy=render(true,true); busy.props.onRequestClose(); nodes(busy,'Pressable')[0].props.onPress(); assert.equal(closed,3);
  }
  assert.doesNotMatch(read('src/components/modals/TripSaveModal.js'),/react-native-modal|swipeDirection|KeyboardAvoidingView/);
});

test('trip save waits, ignores double taps, preserves all metadata and closes only on success',async()=>{
  const pending=deferred();const submissions=[];
  const form=tripForm(data=>{submissions.push(data);return pending.promise;});
  assert.equal(form.render().props.visible,false);
  form.ref.current.open('Fixture title','walking','private','Fixture description');
  let tree=form.render(); assert.equal(tree.props.visible,true);
  const save=saveButton(tree).props.onPress;
  const result=save(); await save();
  tree=form.render();assert.equal(tree.props.busy,true);assert.equal(tree.props.visible,true);assert.equal(saveButton(tree).props.disabled,true);assert.equal(submissions.length,1);
  assert.equal(JSON.stringify(submissions[0]),JSON.stringify({title:'Fixture title',description:'Fixture description',mode:'walking',visibility:'private'}));
  pending.resolve();await result;assert.equal(form.render().props.visible,false);
  form.ref.current.open('Reopened');tree=form.render();assert.equal(tree.props.visible,true);assert.equal(nodes(tree,'TextInput')[0].props.value,'Reopened');
  tree.props.onClose();assert.equal(form.render().props.visible,false);
});

test('trip save failure retains typed fields, exposes retry, and chips/fields retain their handlers',async()=>{
  let fail=true;const form=tripForm(async()=>{if(fail)throw Error('fixture');});form.render();form.ref.current.open('Original');
  let tree=form.render();nodes(tree,'TextInput')[0].props.onChangeText('Edited');
  const chip=nodes(tree).find(node=>node.props.label==='bicycle');chip.props.onPress();
  tree=form.render();await saveButton(tree).props.onPress();tree=form.render();
  assert.equal(tree.props.visible,true);assert.equal(tree.props.busy,false);assert.equal(nodes(tree,'TextInput')[0].props.value,'Edited');
  assert.ok(nodes(tree,'Text').some(node=>node.props.accessibilityRole==='alert'));
  assert.equal(nodes(tree).find(node=>node.props.label==='bicycle').props.selected,true);
  fail=false;await saveButton(tree).props.onPress();assert.equal(form.render().props.visible,false);
});

test('screen saves selected transport key and DAO retains metadata in SQL and upload payload',async()=>{
  // Exercise the actual caller function without running native recording/GPS effects.
  const source=read('app/(tabs)/record/index.js');
  const start=source.indexOf('const handleSaveMeta = '),end=source.indexOf('\n\tconst handleUpload',start);
  let saved;
  const vm=require('node:vm');
  const handler=vm.runInNewContext(source.slice(start,end)+';handleSaveMeta',{
    metadataDraft:{current:{tripId:'fixture-trip',userId:'owner',token:'token',endTime:'2026-01-01T00:00:00.000Z',startName:'A',endName:'B'}},useAuthStore:{getState:()=>({user:{_id:'owner'},token:'token'})},finishTrip:async(id,data)=>{saved={id,data};},setStatus(){},toast(){},refreshPending:async()=>{},
  });
  await handler({title:'Title',mode:'walking',visibility:'private',description:'Description'});
  assert.equal(saved.data.endTime,'2026-01-01T00:00:00.000Z');assert.equal(saved.data.defaultTransportMode,'walking');assert.equal(saved.data.defaultTravelMode,undefined);
  let sql,params;
  const dao=load('src/db/tripDao.js','({finishTrip,createTripPayload})',{getActiveTrip:async()=>({}),openDatabase:async()=>({getAllAsync:async()=>[{status:'stopped'}],runAsync:async(query,values)=>{sql=query;params=values;}})});
  await dao.finishTrip(saved.id,saved.data,'owner');
  assert.match(sql,/UPDATE trips/); assert.equal(JSON.stringify(params.slice(1)),JSON.stringify(['Title','Description','A','B','walking','private','fixture-trip','owner']));
  const payload=dao.createTripPayload({title:params[1],description:params[2],start_name:params[3],end_name:params[4],default_transport_mode:params[5],default_trip_visibility:params[6]},[]);
  assert.equal(payload.defaultTravelMode,'walking');assert.equal(payload.defaultTripVisibility,'private');assert.equal(payload.description,'Description');assert.equal(payload.startLocationName,'A');assert.equal(payload.endLocationName,'B');
});

const poiForm = onSubmit => fixture('src/components/modals/AddPoiModal.js','AddPoiModal',{onSubmit},{...native,theme,...noteTools,RecordingFormModal:'RecordingFormModal'});
const poiButton = tree => nodes(tree,'Pressable').find(node=>node.props.testID==='poi-save');
test('POI form awaits persistence, deduplicates taps, retains failed note and supports retry/cancel/reopen',async()=>{
  const pending=deferred();let calls=0;let result=pending.promise;
  const form=poiForm(({note})=>{calls++;assert.equal(note,'Fixture note');return result;});
  form.render();form.ref.current.open();let tree=form.render();nodes(tree,'TextInput')[0].props.onChangeText('Fixture note');
  const save=poiButton(form.render()).props.onPress;const saving=save();await save();
  tree=form.render();assert.equal(calls,1);assert.equal(tree.props.visible,true);assert.equal(tree.props.busy,true);
  pending.reject(Error('fixture'));await saving;tree=form.render();
  assert.equal(tree.props.visible,true);assert.equal(tree.props.busy,false);assert.equal(nodes(tree,'TextInput')[0].props.value,'Fixture note');
  assert.ok(nodes(tree,'Text').some(node=>node.props.accessibilityRole==='alert'));
  result=Promise.resolve();await poiButton(tree).props.onPress();assert.equal(form.render().props.visible,false);
  form.ref.current.open();tree=form.render();assert.equal(nodes(tree,'TextInput')[0].props.value,'');tree.props.onClose();assert.equal(form.render().props.visible,false);
});

function poiHandlers({status='recording',tripId='fixture-trip',point={lat:0,lon:0},owns=async()=>true}={}) {
  const source=read('app/(tabs)/record/index.js');
  const start=source.indexOf('const handleAddPoi = '),end=source.indexOf('\n\t// Handle recommendation submission',start);
  const session={user:{_id:'fixture-owner'},token:'fixture-session'};
  const saved=[];const notices=[];let opened=0;const pendingPoi={current:null};const lastPoint={current:point};
  const handlers=require('node:vm').runInNewContext(source.slice(start,end)+';({handleAddPoi,handlePoiSubmit})',{
    ENABLE_POI_UI:true,user:session.user,useAuthStore:{getState:()=>session},tripId,status,lastPoint,pendingPoi,
    poiModalRef:{current:{open:()=>opened++}},toast:notice=>notices.push(notice),ownsLocalTrip:owns,
    addPoi:async(id,data)=>saved.push({id,...data}),
  });
  return {...handlers,session,saved,notices,pendingPoi,lastPoint,opened:()=>opened};
}
test('recording screen wires POI persistence and captures point before the user types',async()=>{
  assert.match(read('app/(tabs)/record/index.js'),/<AddPoiModal[^>]*ref=\{poiModalRef\} onSubmit=\{handlePoiSubmit\}/);
  for(const status of ['recording','paused']) {
    const form=poiHandlers({status});form.handleAddPoi();assert.equal(form.opened(),1);
    form.lastPoint.current={lat:1,lon:1};await form.handlePoiSubmit({note:'Fixture note'});
    assert.equal(JSON.stringify(form.saved),JSON.stringify([{id:'fixture-trip',lat:0,lon:0,note:'Fixture note'}]));
    assert.equal(form.notices.at(-1).title,'POI saved');
  }
});
test('POI refuses absent GPS/inactive trip and stale or unowned sessions without writing',async()=>{
  for(const options of [{point:null},{point:{lat:NaN,lon:0}},{status:'stopped'},{tripId:null}]) {
    const form=poiHandlers(options);form.handleAddPoi();assert.equal(form.opened(),0);assert.equal(form.saved.length,0);assert.equal(form.notices.length,1);
  }
  const stale=poiHandlers();stale.handleAddPoi();stale.session.token='different';await assert.rejects(stale.handlePoiSubmit({note:'Fixture'}));assert.equal(stale.saved.length,0);
  const unowned=poiHandlers({owns:async()=>false});unowned.handleAddPoi();await assert.rejects(unowned.handlePoiSubmit({note:'Fixture'}));assert.equal(unowned.saved.length,0);
  const ownership=deferred();const switched=poiHandlers({owns:()=>ownership.promise});switched.handleAddPoi();
  const submit=switched.handlePoiSubmit({note:'Fixture'});switched.session.user={_id:'other'};ownership.resolve(true);await assert.rejects(submit);assert.equal(switched.saved.length,0);
});
test('existing POI DAO appends note/point and upload payload includes it without altering track data',async()=>{
  let sql,values;
  const dao=load('src/db/tripDao.js','({addPoi,createTripPayload})',{...noteTools,openDatabase:async()=>({runAsync:async(query,params)=>{sql=query;values=params;}})});
  await dao.addPoi('fixture-trip',{lat:0,lon:0,note:'Fixture'});
  assert.match(sql,/INSERT INTO pois/);assert.equal(values[0],'fixture-trip');assert.equal(values[4],'Fixture');
  const segments=[{track:[{lat:1,lon:1}]}];const payload=dao.createTripPayload({},segments,[{lat:values[1],lon:values[2],timestamp:values[3],note:values[4]}]);
  assert.equal(payload.segments,segments);assert.equal(payload.pois[0].note,'Fixture');assert.equal(payload.pois[0].lat,0);
});

test('Cancel returns to a stopped-screen action that reopens the same trip draft',async()=>{
  let saved;const form=tripForm(async data=>{saved=data;});form.render();form.ref.current.open('Initial');
  let tree=form.render();nodes(tree,'TextInput')[0].props.onChangeText('Edited title');nodes(tree,'TextInput')[1].props.onChangeText('Edited description');
  nodes(tree).find(node=>node.props.label==='bicycle').props.onPress();nodes(tree).find(node=>node.props.label==='private').props.onPress();
  tree=form.render();tree.props.onClose();assert.equal(form.render().props.visible,false);
  const screen=fixture('app/(tabs)/record/index.js','RecordScreen',{}, {
    ...native,theme,useAuthStore:Object.assign(select=>select({user:{_id:'fixture'}}),{getState:()=>({user:{_id:'fixture'},token:'token'})}),getLocalTrip:async()=>({status:'stopped'}),...tripTools,RecordingButton:'RecordingButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal',Ionicons:'Ionicons',StyleSheet:{create:styles=>styles,absoluteFillObject:{}},
  });
  screen.setState(0,'stopped');screen.setState(1,'trip');screen.setState(19,{current:{tripId:'trip',userId:'fixture',token:'token'}});const screenTree=screen.render();
  nodes(screenTree,'TripSaveModal')[0].props.ref.current=form.ref.current;
  const edit=nodes(screenTree,'TouchableOpacity').find(node=>node.props.accessibilityLabel==='Edit trip details');
  assert.ok(edit);assert.equal(edit.props.disabled,false);await edit.props.onPress();
  tree=form.render();assert.equal(tree.props.visible,true);assert.equal(nodes(tree,'TextInput')[0].props.value,'Edited title');assert.equal(nodes(tree,'TextInput')[1].props.value,'Edited description');
  await saveButton(tree).props.onPress();assert.equal(saved.mode,'bicycle');assert.equal(saved.visibility,'private');assert.equal(saved.description,'Edited description');
});

function stopHandlers({running=true,names=async()=>({startName:null,endName:null}),stopBackground=async()=>{},endpoints=async()=>({start:null,end:null})}={}) {
  const source=read('app/(tabs)/record/index.js');const start=source.indexOf('const handleStop = '),end=source.indexOf('\n\tconst handleSaveMeta',start);
  const session={user:{_id:'fixture-owner'},token:'fixture-token'};const events=[],opened=[],notices=[];let button;
  const stopRequest={current:null},tripEndTime={current:null},pendingNames={current:null},metadataDraft={current:null};
  const handler=require('node:vm').runInNewContext(source.slice(start,end)+';handleStop',{
    lifecycleRequest:{current:false},isRestoring:false,tripId:'fixture-trip',user:{...session.user,settings:{defaultTravelMode:'walking'}},useAuthStore:{getState:()=>session},stopRequest,tripEndTime,pendingNames,firstPoint:{current:null},lastPoint:{current:null},TASK_NAME:'fixture-task',
    Alert:{alert:(_,__,buttons)=>{button=buttons.find(b=>b.text==='Stop');}},stopLocationWatcher:async()=>events.push('foreground-stop'),
    Location:{hasStartedLocationUpdatesAsync:async()=>running,stopLocationUpdatesAsync:async()=>{events.push('background-stop');await stopBackground();}},
    clearActiveTrip:async()=>events.push('clear-active'),stopTrip:async()=>events.push('persist-stop'),refreshPending:async()=>{},getLocalTrip:async()=>({status:'stopped',metadata_confirmed:0,default_transport_mode:'walking',default_trip_visibility:'private'}),metadataDraft,getTripEndpoints:endpoints,...tripTools,getTripLocationNames:names,setStatus:status=>events.push(status),setIsResolvingLocation:busy=>events.push(busy),
    sheetRef:{current:{open:(...args)=>opened.push(args)}},toast:notice=>notices.push(notice),
  });
  return {handler,confirm:()=>button.onPress(),session,events,opened,notices,tripEndTime,pendingNames,stopRequest,metadataDraft};
}

test('Stop without GPS or with failed names still reaches stopped Save form and clears loading',async()=>{
  for(const names of [async()=>({startName:null,endName:null}),async()=>{throw Error('lookup failed');}]) {
    const screen=stopHandlers({names});await screen.handler();await screen.confirm();
    assert.ok(screen.events.includes('stopped'));assert.equal(screen.events.at(-1),false);
    assert.equal(JSON.stringify(screen.opened),JSON.stringify([['Recorded trip','walking','private','']]));
    assert.equal(JSON.stringify(screen.pendingNames.current),JSON.stringify({startName:'Unknown',endName:'Unknown'}));assert.ok(screen.tripEndTime.current);
  }
});

test('Stop from paused skips missing background task; collector failure remains retryable rather than false success',async()=>{
  const paused=stopHandlers({running:false,names:async()=>({startName:'A',endName:'B'})});await paused.handler();await paused.confirm();
  assert.equal(paused.events.includes('background-stop'),false);assert.equal(paused.opened[0][0],'From A to B');
  let fail=true;const failed=stopHandlers({stopBackground:async()=>{if(fail)throw Error('Native stop failed');}});
  await failed.handler();await failed.confirm();assert.equal(failed.opened.length,0);assert.equal(failed.events.includes('stopped'),false);assert.equal(failed.events.at(-1),false);assert.equal(failed.notices.length,1);
  fail=false;await failed.handler();await failed.confirm();assert.equal(failed.opened.length,1);
});

test('pending Stop ignores duplicate confirmation and old-session name completion cannot open a form',async()=>{
  const pending=deferred();const screen=stopHandlers({names:()=>pending.promise});await screen.handler();const work=screen.confirm();await screen.confirm();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(screen.events.filter(x=>x==='foreground-stop').length,1);screen.session.token='new-session';
  pending.resolve({startName:'Old',endName:'Session'});await work;assert.equal(screen.opened.length,0);assert.equal(screen.events.at(-1),false);
});

test('location naming accepts zero coordinates, skips missing GPS and bounds hung lookups',async()=>{
  let timeout,cleared=0;const calls=[];
  const helper=load('src/services/locationNames.js','getTripLocationNames',{
    reverseGeocode:async(lat,lon)=>{calls.push([lat,lon]);return 'Fixture place';},setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>cleared++,
  });
  const missing=await helper({start:null,end:{}});assert.equal(missing.startName,null);assert.equal(calls.length,0);
  const zero=await helper({start:{lat:0,lon:0},end:{lat:1,lon:2}});assert.equal(zero.startName,'Fixture place');assert.equal(calls.length,2);assert.equal(cleared,2);
  const hanging=load('src/services/locationNames.js','getTripLocationNames',{
    reverseGeocode:()=>new Promise(()=>{}),setTimeout:(fn,ms)=>{assert.equal(ms,5000);timeout=fn;return 2;},clearTimeout:()=>cleared++,
  });
  const pending=hanging({start:{lat:1,lon:2},end:{lat:3,lon:4}});timeout();const fallback=await pending;
  assert.equal(fallback.startName,null);assert.equal(fallback.endName,null);assert.equal(cleared,3);
});


test('recovered Stop resolves owner-scoped persisted endpoints rather than empty refs',async()=>{
  let received,owner;
  const points={start:{lat:1,lon:2},end:{lat:3,lon:4}};
  const screen=stopHandlers({endpoints:async(...args)=>{owner=args;return points;},names:async value=>{received=value;return {startName:'Start',endName:'End'};}});
  await screen.handler();await screen.confirm();
  assert.deepEqual(owner,['fixture-trip','fixture-owner']);assert.equal(JSON.stringify(received),JSON.stringify(points));
  assert.equal(screen.opened[0][0],'From Start to End');
});

test('slow Stop names cannot reopen and overwrite an independently opened manual draft',async()=>{
  const pending=deferred(),screen=stopHandlers({names:()=>pending.promise});
  await screen.handler();const work=screen.confirm();await new Promise(setImmediate);
  const edited={tripId:'fixture-trip',title:'My manual title',description:'My notes',startName:'Manual start'};
  screen.metadataDraft.current=edited;
  pending.resolve({startName:'Lookup start',endName:'Lookup end'});await work;
  assert.equal(screen.metadataDraft.current,edited);assert.equal(screen.opened.length,0);
});

test('slow Stop names ignore same-token session epoch changes and abandoned trip operations',async()=>{
  for(const change of [screen=>{screen.session.sessionEpoch=1;},screen=>{screen.session.isSessionChanging=true;},screen=>{screen.stopRequest.current=null;}]) {
    const pending=deferred(),screen=stopHandlers({names:()=>pending.promise});
    await screen.handler();const work=screen.confirm();await new Promise(setImmediate);change(screen);
    pending.resolve({startName:'Old',endName:'Session'});await work;assert.equal(screen.opened.length,0);
  }
});
