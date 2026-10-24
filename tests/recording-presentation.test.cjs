const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {read, fixture, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const file = 'app/(tabs)/record/index.js';
const session = {user:{_id:'owner'},token:'session'};
const dependencies = {...native,theme,Ionicons:'Ionicons',StyleSheet:{create:s=>s,absoluteFillObject:{}},
  useAuthStore:Object.assign(select=>select(session),{getState:()=>session}),
  RecordingButton:'RecordingButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal'};
const screen = (status, restoring=false) => {
  const f=fixture(file,'RecordScreen',{},dependencies);f.setState(0,status);f.setState(7,restoring);return f;
};
const texts = tree => nodes(tree,'Text').flatMap(n=>n.children).join(' ');
const flatten = styles => Object.assign({}, ...[styles].flat(Infinity).filter(Boolean));

// Baseline includes 410 tombstone handling (trip-delete.test.cjs), plus bounded
// endpoint naming and stale-draft/session guards (recording-forms.test.cjs), plus
// reviewed optional endpoint persistence (recording-name-persistence.test.cjs).
test('recording logic matches reviewed lifecycle and terminal-deletion-response baseline', () => {
  const source=read(file),logic=source.slice(source.indexOf('//5000,'),source.indexOf('// ─────── UI'));
  assert.equal(createHash('sha256').update(logic).digest('hex'),'3428794a461cd222dacc4f46895b557711b844aaa250e0cc6d3acce4abdd58b9');
});

test('all recording states have clear labeled controls and a single scrolling surface', () => {
  const expected={idle:['Start recording'],recording:['Pause recording','Stop recording','Add recommendation'],
    paused:['Resume recording','Stop recording','Add recommendation'],stopped:['Upload trip'],cleanup_required:[]};
  for(const [status,labels] of Object.entries(expected)) {
    const tree=screen(status).render();
    assert.deepEqual(nodes(tree,'RecordingButton').map(n=>n.props.label),labels);
    assert.equal(nodes(tree,'ScrollView').length,0);
    assert.equal(nodes(tree,'FlatList').length,1);
    assert.equal(nodes(tree,'FlatList')[0].props.keyboardShouldPersistTaps,'handled');
    assert.equal(nodes(tree,'Image')[0].props.accessible,false);
    assert.equal(flatten(nodes(tree,'Image')[0].props.style).height,status==='idle'?180:112);
    assert.equal(nodes(tree,'TripSaveModal').length,1);
    assert.equal(nodes(tree,'AddPoiModal').length,1);
    assert.equal(nodes(tree,'AddRecommendationModal').length,1);
    assert.doesNotMatch(texts(tree),/timeline|Upload all/i);
  }
  assert.equal(nodes(screen('idle',true).render(),'RecordingButton').length,0);
  assert.match(texts(screen('idle',true).render()),/Checking for an unfinished/);
  assert.equal(nodes(screen('cleanup_required',true).render(),'TouchableOpacity').find(n=>n.props.accessibilityLabel==='Retry Stop').props.disabled,true);
});

test('multiple local rows keep their individual callbacks and older rows gain no edit control', () => {
  const f=screen('stopped');
  f.setState(3,[{id:'first',status:'stopped'},{id:'second',status:'paused'}]);
  const tree=f.render();
  const list=nodes(tree,'FlatList')[0];
  const rows=list.props.data.map(item=>list.props.renderItem({item}));
  assert.equal(rows.length,2);
  for(const row of rows) {
    for(const action of ['onUpload','onDelete','onRecover'])assert.equal(typeof row.props[action],'function');
    assert.equal(row.props.onEdit,undefined);
  }
  assert.match(texts(tree),/Trips on this device/);
  assert.match(texts(tree),/New trip/);
  assert.equal(nodes(tree,'TouchableOpacity').filter(n=>n.props.accessibilityLabel==='Edit trip details').length,1);
});

test('pending row upload/delete/recovery guards remain visible and single-trip while uploading', () => {
  for(const unfinished of [true,false]) for(const active of [true,false]) for(const uploading of [null,'this','other']) {
    const onUpload=()=>{},onDelete=()=>{},onRecover=()=>{};
    const tree=fixture(file,'PendingRow',{item:{id:'this',title:'A saved trip',status:unfinished?'paused':'stopped',start_time:0,pointsCount:12},
      isActive:active,canRecover:true,isUploading:!!uploading,uploadingTripId:uploading,onUpload,onDelete,onRecover},dependencies).render();
    const buttons=nodes(tree,'TouchableOpacity'),get=label=>buttons.find(n=>n.props.accessibilityLabel===label);
    assert.equal(!!get('Recover recording'),unfinished&&!active&&!uploading);
    assert.equal(get('Delete local trip').props.disabled,!!uploading||active||unfinished);
    if(uploading==='this')assert.equal(get('Upload trip'),undefined);
    else assert.equal(get('Upload trip').props.disabled,uploading==='other'||active||unfinished);
    for(const b of buttons)assert.ok(flatten(b.props.style).minHeight>=48);
    assert.match(texts(tree),/A saved trip/);
    assert.doesNotMatch(texts(tree),/Edit/);
  }
});

test('recording buttons use app colors, accessible labels and expanding touch targets', () => {
  for(const extra of [{},{secondary:true},{danger:true}]) {
    const onPress=()=>{};
    const tree=fixture('src/components/RecordingButton.js','RecordingButton',{label:'Resume recording',icon:'play',onPress,...extra},dependencies).render();
    assert.equal(tree.props.onPress,onPress);
    assert.equal(tree.props.accessibilityRole,'button');
    assert.equal(tree.props.accessibilityLabel,'Resume recording');
    assert.ok(flatten(tree.props.style).minHeight>=48);
    assert.equal(flatten(nodes(tree,'Text')[0].props.style).flexShrink,1);
  }
});

test('New trip only resets the current view and leaves saved trips available', () => {
  const f=screen('stopped');
  f.setState(1,'saved');f.setState(3,[{id:'saved',status:'stopped'}]);
  const reset=nodes(f.render(),'TouchableOpacity').find(n=>texts(n)==='New trip');
  assert.equal(reset.props.disabled,false);
  reset.props.onPress();
  const tree=f.render();
  assert.deepEqual(nodes(tree,'RecordingButton').map(n=>n.props.label),['Start recording']);
  assert.equal(nodes(tree,'FlatList')[0].props.data[0].id,'saved');
  assert.equal(nodes(tree,'TouchableOpacity').some(n=>n.props.accessibilityLabel==='Edit trip details'),false);
});
