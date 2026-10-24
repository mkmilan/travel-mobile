const test = require('node:test');
const assert = require('node:assert/strict');
const {load,fixture,nodes,theme,native} = require('./helpers/component-fixture.cjs');

const noteTools = load('src/utils/poiNote.js', '({POI_NOTE_MAX_LENGTH,validatePoiNote,getPoiNote})');
const formFixture = onSubmit => fixture('src/components/modals/AddPoiModal.js','AddPoiModal',{onSubmit},{
  ...native,theme,...noteTools,RecordingFormModal:'RecordingFormModal',
});
const input = tree => nodes(tree,'TextInput')[0];
const saveButton = tree => nodes(tree,'Pressable').find(node=>node.props.testID==='poi-save');
const alerts = tree => nodes(tree,'Text').filter(node=>node.props.accessibilityRole==='alert').map(node=>node.children.join('')).join(' ');

test('POI validator matches the 500-code-unit API limit without trimming or truncating valid text',()=>{
  assert.equal(noteTools.POI_NOTE_MAX_LENGTH,500);
  for (const value of ['', ' padded note ', 'x'.repeat(500), '😀'.repeat(250)]) {
    assert.equal(noteTools.validatePoiNote(value),value);
  }
  for (const value of ['x'.repeat(501), '😀'.repeat(251)]) {
    assert.throws(()=>noteTools.validatePoiNote(value),/500 characters or fewer/);
  }
  assert.throws(()=>noteTools.validatePoiNote({note:'invalid'}),/text note/);
});

test('POI form rejects oversized text before persistence and saves the exact 500-character repair',async()=>{
  const saved=[];const form=formFixture(async data=>saved.push(data));
  form.render();form.ref.current.open();
  input(form.render()).props.onChangeText('x'.repeat(501));
  let tree=form.render();
  assert.equal(saveButton(tree).props.disabled,true);
  assert.match(alerts(tree),/500 characters or fewer/);
  await saveButton(tree).props.onPress(); // Handler also guards a queued/programmatic tap.
  assert.equal(saved.length,0);assert.equal(form.render().props.visible,true);
  const repaired='x'.repeat(500);input(form.render()).props.onChangeText(repaired);
  tree=form.render();assert.equal(saveButton(tree).props.disabled,false);assert.equal(alerts(tree),'');
  await saveButton(tree).props.onPress();
  assert.equal(saved.length,1);assert.equal(saved[0].note,repaired);assert.equal(form.render().props.visible,false);
});

test('legacy POI repair keeps all original text on open, cancellation, reopen and failed save',async()=>{
  const legacy='original '.repeat(70);let fail=true;const saved=[];
  const form=formFixture(async data=>{if(fail)throw Error('fixture');saved.push(data);});
  form.render();form.ref.current.open(legacy,{title:'Edit POI note'});
  let tree=form.render();assert.equal(tree.props.title,'Edit POI note');assert.equal(input(tree).props.value,legacy);
  assert.equal(input(tree).props.maxLength,undefined);assert.equal(saveButton(tree).props.disabled,true);
  tree.props.onClose();assert.equal(form.render().props.visible,false);assert.equal(saved.length,0);
  form.ref.current.open(legacy,{title:'Edit POI note'});tree=form.render();assert.equal(input(tree).props.value,legacy);
  input(tree).props.onChangeText('Owner-chosen shortened text');await saveButton(form.render()).props.onPress();
  tree=form.render();assert.equal(tree.props.visible,true);assert.equal(input(tree).props.value,'Owner-chosen shortened text');
  assert.match(alerts(tree),/note is still here/);assert.equal(saved.length,0);
  fail=false;await saveButton(tree).props.onPress();assert.equal(saved[0].note,'Owner-chosen shortened text');
  form.ref.current.open();tree=form.render();assert.equal(tree.props.title,'Add POI');assert.equal(input(tree).props.value,'');
});

test('POI display supports server description and legacy note, preserving the explicit note when present',()=>{
  assert.equal(noteTools.getPoiNote({description:'Server description'}),'Server description');
  assert.equal(noteTools.getPoiNote({note:'Legacy note',description:'Other'}),'Legacy note');
  assert.equal(noteTools.getPoiNote({note:'',description:'Other'}),'');
  assert.equal(noteTools.getPoiNote({note:null,description:'Server description'}),'Server description');
  assert.equal(noteTools.getPoiNote({}),'');
});

test('actual trip detail renders and opens POI text for both API description and legacy note',()=>{
  const session={user:{_id:'owner'},token:'session',isAuthenticated:true};const notices=[];
  const components=Object.fromEntries(['CommentList','RecommendationCard','TransportIcon','TripMapThumbnail','AddCommentModal','AddRecommendationModal','LikersModal','MapModal','RecommendationDetailModal','IconStatDisplay','PhotoGallery','Section','SocialButton','Avatar','Feather'].map(name=>[name,name]));
  const screen=fixture('app/(tabs)/trip/[id].js','TripDetailScreen',{}, {
    ENABLE_POI_UI:true,
    ...native,...components,theme,...noteTools,StyleSheet:{create:value=>value},
    useAuthStore:Object.assign(()=>session,{getState:()=>session}),useRouter:()=>({push(){}}),useLocalSearchParams:()=>({id:'trip-a'}),
    useTripSocialStore:()=>({setRecCount(){},setLikeState(){},setCommentCount(){}}),useCallback:fn=>fn,useFocusEffect(){},
    calcAvgSpeed:()=>1,kmOrMiles:()=> '1 km',msToDuration:()=>'',isoToDate:()=>'',lineStringToCoords:()=>[],
    Alert:{alert:(...args)=>notices.push(args)},
  });
  screen.setState(0,{_id:'trip-a',user:{_id:'owner'},pointsOfInterest:[
    {_id:'server',description:'Server text'}, {_id:'legacy',note:'Legacy text'}, {_id:'empty'},
  ]});screen.setState(1,false);
  const tree=screen.render();const section=nodes(tree,'Section').find(node=>node.props.title==='Points of Interest');
  assert.deepEqual(nodes(section,'Text').map(node=>node.children.join('')),['Server text','Legacy text','POI 3']);
  for(const row of nodes(section,'Pressable'))row.props.onPress();
  assert.deepEqual(notices,[['POI Detail','Server text'],['POI Detail','Legacy text'],['POI Detail','View POI']]);
});
