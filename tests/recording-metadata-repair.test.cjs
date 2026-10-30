const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture, load, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const {hooksFixture, authFixture} = require('./helpers/hooks-fixture.cjs');
const {sqliteFixture} = require('./helpers/sqlite-fixture.cjs');
const metadataTools = load('src/utils/tripMetadata.js','({validateTripMetadata})');
const file = 'app/(tabs)/record/index.js';
const tick = () => new Promise(setImmediate);
const deferred = () => {let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const details = {endTime:'2026-10-29T08:00:00Z',title:'Saved walk',description:'Journal',startName:'A',endName:'B',defaultTransportMode:'walking',defaultTripVisibility:'private'};
const nativeDeps = {...native,theme,StyleSheet:{create:x=>x,absoluteFillObject:{}},Ionicons:'Ionicons'};
const input = (form, index) => nodes(form.render(),'TextInput')[index];
const save = form => nodes(form.render(),'Pressable').find(n=>n.props.testID==='trip-save').props.onPress();
function modal(onConfirm, auth=select=>select({user:{}})) {
  const form=fixture('src/components/modals/TripSaveModal.js','TripSaveModal',{onConfirm},{...nativeDeps,...metadataTools,useAuthStore:auth,TransportIcon:'TransportIcon',RecordingFormModal:'RecordingFormModal'});
  form.render();return form;
}
async function seed(f) {
  const id=await f.dao.startTrip('owner');
  for(const lat of [1,2])await f.dao.insertTrackPoint(id,'segment',{lat,lon:3,timestamp:details.endTime,speed:1,accuracy:2});
  await f.dao.addPoi(id,{lat:1,lon:3,note:'Keep my note'});
  await f.dao.stopTrip(id,details.endTime,'owner');await f.dao.finishTrip(id,details,'owner');
  return id;
}
// Actual RecordScreen, row controls, save modal, migrations and SQL. Only native
// hosts/React scheduling/auth and transport are synthetic; no live service used.
async function harness() {
  const db=await sqliteFixture(),id=await seed(db),host=hooksFixture(),auth=authFixture();
  auth.set({user:{_id:'owner',settings:{}},token:'owner-token'});
  let active={},beforeRead=async()=>{},transport=async payload=>({uploadProtocol:1,uploadId:payload.uploadId,trip:{_id:'a'.repeat(24)},uploadComplete:true,recommendationsOutcome:[]});
  const notices=[],requests=[];
  const screen=fixture(file,'RecordScreen',{}, {...nativeDeps,...host.hooks,...db.dao,useAuthStore:auth.store,
    runMigrations:db.migrate,getActiveTrip:async()=>active,readRecordingTaskState:async()=>false,acquireRecordingTransition:async()=>()=>{},
    getLocalTrip:async(...args)=>{await beforeRead(...args);return db.dao.getLocalTrip(...args);},
    uploadTripJson:async payload=>{requests.push(payload);return transport(payload);},
    TASK_NAME:'fixture',Location:{},toast:notice=>notices.push(notice),console:{...console,error(){}},
    RecordingButton:'RecordingButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal'});
  let currentModal;
  const form=modal(data=>currentModal.props.onConfirm(data),auth.store);
  const tree=()=>{const tree=host.render(()=>screen.render());currentModal=nodes(tree,'TripSaveModal')[0];currentModal.props.ref.current=form.ref.current;return tree;};
  tree();await tick();tree();
  const row=(target=id)=>{const list=nodes(tree(),'FlatList')[0],item=list.props.data.find(t=>t.id===target);assert.ok(item);const row=list.props.renderItem({item});return row.type(row.props);};
  const button=(label,target=id)=>nodes(row(target),'TouchableOpacity').find(n=>n.props.accessibilityLabel===label);
  const press=(label,target=id)=>{const b=button(label,target);assert.equal(b.props.disabled,false);return b.props.onPress();};
  return {db,id,auth,notices,requests,form,tree,row,button,press,
    holdRead:fn=>{beforeRead=fn;},setActive:value=>{active=value;db.setActive(value);},transport:fn=>{transport=fn;},unmount:()=>host.unmount(),
    data:async()=>JSON.stringify(await Promise.all(['track_points','pois','recommendations'].map(t=>db.db.getAllAsync(`SELECT * FROM ${t}`)))),
    close(){host.unmount();db.close();}};
}

for(const [field,index,limit] of [['title',0,100],['description',1,2000]])test(`Save rejects over-limit ${field} without truncating it; boundary correction succeeds`,async()=>{
  const writes=[],form=modal(data=>writes.push(data));form.ref.current.open('Valid','walking','private','Description');
  input(form,index).props.onChangeText('x'.repeat(limit+1));await save(form);
  assert.equal(writes.length,0);assert.equal(form.render().props.visible,true);assert.equal(input(form,index).props.value.length,limit+1);
  assert.ok(nodes(form.render(),'Text').some(n=>n.props.accessibilityRole==='alert' && n.children.join('').includes(`${limit} characters`)));
  input(form,index).props.onChangeText('x'.repeat(limit));await save(form);assert.equal(writes.length,1);assert.equal(writes[0][field].length,limit);assert.equal(form.render().props.visible,false);
});

test('validation matches trimmed server limits and retains empty-title fallback without accepting whitespace-only title',()=>{
  metadataTools.validateTripMetadata({title:' '+'x'.repeat(100)+' ',description:' '+'d'.repeat(2000)+' '});
  metadataTools.validateTripMetadata({title:'',description:''});
  assert.throws(()=>metadataTools.validateTripMetadata({title:'   '}),{code:'TRIP_METADATA_INVALID'});
  assert.throws(()=>metadataTools.validateTripMetadata({title:5}),{code:'TRIP_METADATA_INVALID'});
});

test('older stopped row Edit repairs original metadata, then uploads the same recording and route identity',async()=>{
  const h=await harness();try {
    await h.db.db.runAsync('UPDATE trips SET title=?, description=? WHERE id=?',['t'.repeat(101),'d'.repeat(2001),h.id]);
    // Focus refresh is unnecessary: Edit reads persisted values, not stale row text.
    const before=await h.data();await h.press('Edit trip details');
    assert.equal(h.form.render().props.visible,true);assert.equal(input(h.form,0).props.value.length,101);assert.equal(input(h.form,1).props.value.length,2001);
    await save(h.form);assert.equal((await h.db.dao.getLocalTrip(h.id,'owner')).title.length,101);
    input(h.form,0).props.onChangeText('Repaired title');input(h.form,1).props.onChangeText('Repaired journal');await save(h.form);
    assert.equal(h.form.render().props.visible,false);assert.equal((await h.db.dao.getLocalTrip(h.id,'owner')).end_time,details.endTime);assert.equal(await h.data(),before);
    await h.press('Upload trip');assert.equal(h.requests.length,1);assert.equal(h.requests[0].uploadId,h.id);assert.equal(h.requests[0].title,'Repaired title');
    assert.equal(h.requests[0].segments[0].track.length,2);assert.equal(h.requests[0].pois[0].note,'Keep my note');assert.equal(await h.data(),before);
    assert.equal((await h.db.dao.getLocalTrip(h.id,'owner')).status,'uploaded');
  }finally{h.close();}
});

test('old invalid metadata fails upload locally and opens repair without freezing or dispatching a doomed request',async()=>{
  const h=await harness();try {
    await h.db.db.runAsync('UPDATE trips SET description=? WHERE id=?',['d'.repeat(2001),h.id]);const before=await h.data();
    await h.press('Upload trip');assert.equal(h.requests.length,0);assert.equal(h.form.render().props.visible,true);assert.equal(input(h.form,1).props.value.length,2001);
    assert.equal((await h.db.dao.getLocalTrip(h.id,'owner')).upload_payload,null);assert.equal(await h.data(),before);
  }finally{h.close();}
});

for(const rejected of [true,false])test(`${rejected?'verified rejected':'ambiguous'} frozen upload ${rejected?'becomes editable':'stays immutable'} without changing its retry contents`,async()=>{
  const h=await harness();try {
    const frozen=await h.db.dao.buildTripJsonForUpload(h.id,{},'owner',true);frozen.title='t'.repeat(101);
    await h.db.db.runAsync('UPDATE trips SET title=?,upload_payload=? WHERE id=?',[frozen.title,JSON.stringify(frozen),h.id]);
    h.transport(async()=>{throw Object.assign(Error('synthetic failure'),rejected?{data:{uploadRejected:true,uploadId:h.id}}:{});});
    await h.press('Edit trip details');assert.equal(h.form.render().props.visible,false);
    await h.press('Upload trip');assert.equal(h.requests.length,1);assert.equal(JSON.stringify(h.requests[0]),JSON.stringify(frozen));
    await h.press('Edit trip details');assert.equal(h.form.render().props.visible,rejected);
    const row=await h.db.dao.getLocalTrip(h.id,'owner');assert.equal(row.upload_payload,rejected?null:JSON.stringify(frozen));
    if(!rejected)await assert.rejects(h.db.dao.finishTrip(h.id,details,'owner'),/Upload already started/);
  }finally{h.close();}
});

test('pending upload disables every row Edit and blocks an already captured edit callback',async()=>{
  const h=await harness();try {
    const stale=h.button('Edit trip details').props.onPress,wait=deferred();h.transport(()=>wait.promise);
    const uploading=h.press('Upload trip');await tick();assert.equal(h.button('Edit trip details').props.disabled,true);
    await stale();assert.equal(h.form.render().props.visible,false);wait.resolve({});await uploading;
  }finally{h.close();}
});

for(const change of ['owner','same-token-session','session-changing','unmount'])test(`${change} during pending Edit cannot open another lifetime's draft`,async()=>{
  const h=await harness();try {
    const wait=deferred();h.holdRead(()=>wait.promise);const opening=h.press('Edit trip details');
    const auth=h.auth.store.getState();if(change==='unmount')h.unmount();else h.auth.set({...auth,...(change==='owner'?{user:{_id:'other'}}:change==='same-token-session'?{sessionEpoch:auth.sessionEpoch+1}:{isSessionChanging:true})});
    wait.resolve();await opening;assert.equal(h.form.render().props.visible,false);
  }finally{h.close();}
});

test('an older delayed row Edit cannot replace a newer row choice',async()=>{
  const h=await harness();try {
    const second=await seed(h.db);await h.db.db.runAsync('UPDATE trips SET title=? WHERE id=?',['Second trip',second]);
    // Re-mount is not needed for DAO lifetime test: inject the second row through a successful Save's pending refresh.
    await h.press('Edit trip details');await save(h.form);
    const wait=deferred();h.holdRead(id=>id===h.id?wait.promise:Promise.resolve());
    const old=h.press('Edit trip details');await h.press('Edit trip details',second);wait.resolve();await old;
    assert.equal(input(h.form,0).props.value,'Second trip');
  }finally{h.close();}
});

for(const change of ['owner','same-token-session','session-changing','unmount'])test(`${change} after Edit prevents Save of stale form`,async()=>{
  const h=await harness();try {
    await h.press('Edit trip details');input(h.form,0).props.onChangeText('Do not save');const auth=h.auth.store.getState();
    if(change==='unmount')h.unmount();else h.auth.set({...auth,...(change==='owner'?{user:{_id:'other'}}:change==='same-token-session'?{sessionEpoch:auth.sessionEpoch+1}:{isSessionChanging:true})});
    await save(h.form);assert.equal((await h.db.dao.getLocalTrip(h.id,'owner')).title,details.title);assert.equal(h.form.render().props.visible,true);
  }finally{h.close();}
});

test('DAO rejects invalid, active, foreign and newly frozen metadata without changing route or snapshot',async()=>{
  const f=await sqliteFixture();try {
    const id=await seed(f),before=JSON.stringify(await f.db.getAllAsync('SELECT * FROM track_points'));
    await assert.rejects(f.dao.finishTrip(id,{...details,title:'x'.repeat(101)},'owner'),{code:'TRIP_METADATA_INVALID'});
    await assert.rejects(f.dao.finishTrip(id,details,'other'),/not found/);
    f.setActive({tripId:id});await assert.rejects(f.dao.finishTrip(id,details,'owner'),/Stop/);f.setActive({});
    const frozen=await f.dao.buildTripJsonForUpload(id,{},'owner',true);await f.db.runAsync('UPDATE trips SET upload_payload=NULL WHERE id=?',[id]);
    const racing=load('src/db/tripDao.js','finishTrip',{...metadataTools,getActiveTrip:async()=>({}),openDatabase:async()=>({...f.db,runAsync:async(sql,args)=>{
      await f.db.runAsync('UPDATE trips SET upload_payload=? WHERE id=?',[JSON.stringify(frozen),id]);return f.db.runAsync(sql,args);
    }})});
    await assert.rejects(racing(id,{...details,title:'Must not replace'},'owner'),/changed while saving/);
    const row=await f.dao.getLocalTrip(id,'owner');assert.equal(row.title,details.title);assert.equal(row.upload_payload,JSON.stringify(frozen));assert.equal(JSON.stringify(await f.db.getAllAsync('SELECT * FROM track_points')),before);
  }finally{f.close();}
});

test('DAO rechecks caller lifetime after awaited reads and before writing metadata',async()=>{
  const f=await sqliteFixture();try {
    const id=await seed(f);let current=true;
    const guarded=load('src/db/tripDao.js','finishTrip',{...metadataTools,openDatabase:async()=>f.db,getActiveTrip:async()=>{current=false;return {};}});
    await assert.rejects(guarded(id,{...details,title:'Do not save'},'owner',()=>current),/changed/);assert.equal((await f.dao.getLocalTrip(id,'owner')).title,details.title);
  }finally{f.close();}
});

for(const active of [{tripId:'target'},{cleanupId:'unfinished-cleanup'}])test('Edit refuses an active target or unresolved native cleanup marker',async()=>{
  const h=await harness();try {
    h.setActive(active.tripId?{tripId:h.id}:active);await h.press('Edit trip details');
    assert.equal(h.form.render().props.visible,false);assert.match(h.notices.at(-1).msg,/Stop/);
  }finally{h.close();}
});
