const test = require('node:test');
const assert = require('node:assert/strict');
const {read,load,fixture,nodes,theme,native} = require('./helpers/component-fixture.cjs');
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
    tripId:'fixture-trip',tripEndTime:{current:'2026-01-01T00:00:00.000Z'},pendingNames:{current:{startName:'A',endName:'B'}},finishTrip:async(id,data)=>{saved={id,data};},setStatus(){},toast(){},refreshPending:async()=>{},
  });
  await handler({title:'Title',mode:'walking',visibility:'private',description:'Description'});
  assert.equal(saved.data.endTime,'2026-01-01T00:00:00.000Z');assert.equal(saved.data.defaultTransportMode,'walking');assert.equal(saved.data.defaultTravelMode,undefined);
  let sql,params;
  const dao=load('src/db/tripDao.js','({finishTrip,createTripPayload})',{openDatabase:async()=>({runAsync:async(query,values)=>{sql=query;params=values;}})});
  await dao.finishTrip(saved.id,saved.data);
  assert.match(sql,/UPDATE trips/); assert.equal(JSON.stringify(params.slice(1)),JSON.stringify(['Title','Description','A','B','walking','private','fixture-trip']));
  const payload=dao.createTripPayload({title:params[1],description:params[2],start_name:params[3],end_name:params[4],default_transport_mode:params[5],default_trip_visibility:params[6]},[]);
  assert.equal(payload.defaultTravelMode,'walking');assert.equal(payload.defaultTripVisibility,'private');assert.equal(payload.description,'Description');assert.equal(payload.startLocationName,'A');assert.equal(payload.endLocationName,'B');
});

test('Cancel returns to a stopped-screen action that reopens the same trip draft',async()=>{
  let saved;const form=tripForm(async data=>{saved=data;});form.render();form.ref.current.open('Initial');
  let tree=form.render();nodes(tree,'TextInput')[0].props.onChangeText('Edited title');nodes(tree,'TextInput')[1].props.onChangeText('Edited description');
  nodes(tree).find(node=>node.props.label==='bicycle').props.onPress();nodes(tree).find(node=>node.props.label==='private').props.onPress();
  tree=form.render();tree.props.onClose();assert.equal(form.render().props.visible,false);
  const screen=fixture('app/(tabs)/record/index.js','RecordScreen',{}, {
    ...native,theme,useAuthStore:select=>select({user:{_id:'fixture'}}),CircleButton:'CircleButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal',Ionicons:'Ionicons',StyleSheet:{create:styles=>styles,absoluteFillObject:{}},
  });
  screen.setState(0,'stopped');const screenTree=screen.render();
  nodes(screenTree,'TripSaveModal')[0].props.ref.current=form.ref.current;
  const edit=nodes(screenTree,'TouchableOpacity').find(node=>node.props.accessibilityLabel==='Edit trip details');
  assert.ok(edit);assert.equal(edit.props.disabled,false);edit.props.onPress();
  tree=form.render();assert.equal(tree.props.visible,true);assert.equal(nodes(tree,'TextInput')[0].props.value,'Edited title');assert.equal(nodes(tree,'TextInput')[1].props.value,'Edited description');
  await saveButton(tree).props.onPress();assert.equal(saved.mode,'bicycle');assert.equal(saved.visibility,'private');assert.equal(saved.description,'Edited description');
});
