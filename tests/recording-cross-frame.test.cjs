const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture, load, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const {hooksFixture} = require('./helpers/hooks-fixture.cjs');
const {sqliteFixture} = require('./helpers/sqlite-fixture.cjs');
const {recordingFixture} = require('./helpers/recording-fixture.cjs');
const preferences = require('../src/constants/presentationPreferences');
const {createStore} = require('zustand/vanilla');
const tick = () => new Promise(setImmediate);
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve=yes;reject=no;});return {promise,resolve,reject};};
const granted = () => ({status:'granted',canAskAgain:true});
const account = (id='owner', token=`token-${id}`) => ({_id:id,username:`User ${id}`,token,settings:{defaultTripVisibility:'private',defaultTravelMode:'walking'}});
const tables = ['trips','track_points','pois','recommendations'];

// Actual auth store/Zustand + permissions helper + marker/cleanup helpers + screen +
// SQLite. Only React scheduling, native APIs and SecureStore are synthetic.
async function harness() {
  const db=await sqliteFixture(), storage=new Map();
  const state={active:{},running:false,calls:[],notices:[],alerts:[],watchers:[],starts:0,stops:0,rows:0,markerWrites:0};
  let beforeWrite=async()=>{}, beforeDelete=async()=>{};
  const markers=recordingFixture(()=>state.active,value=>{state.markerWrites++;state.active=value;db.setActive(value);});
  const Location={Accuracy:{High:1}};
  for (const method of ['getForegroundPermissionsAsync','requestForegroundPermissionsAsync','getBackgroundPermissionsAsync','requestBackgroundPermissionsAsync']) {
    Location[method]=async()=>{state.calls.push(method);return granted();};
  }
  Object.assign(Location,{
    hasStartedLocationUpdatesAsync:async()=>state.running,
    startLocationUpdatesAsync:async()=>{state.starts++;state.running=true;},
    stopLocationUpdatesAsync:async()=>{state.stops++;state.running=false;},
    watchPositionAsync:async(_options, callback)=>{const watcher={callback,removed:0,remove(){this.removed++;}};state.watchers.push(watcher);return watcher;},
  });
  const stopActiveRecording=load('src/utils/stopActiveRecording.js','stopActiveRecording',{...markers,Location});
  const useAuthStore=load('src/stores/auth.js','useAuthStore',{
    ...preferences,stopActiveRecording,
    SecureStore:{getItemAsync:async key=>storage.get(key),setItemAsync:async(key,value)=>{await beforeWrite(key,value);storage.set(key,value);},deleteItemAsync:async key=>{await beforeDelete(key);storage.delete(key);}},
    require:()=>({useTripSocialStore:{getState:()=>({reset(){}})}}),
    create:initialize=>{
      const store=createStore(initialize);
      return Object.assign(select=>select(store.getState()),store);
    },
  });
  const ensureRecordingPermissions=load('src/utils/recordingPermissions.js','ensureRecordingPermissions');
  await useAuthStore.getState().login(account());
  function mount(overrides={}) {
    const host=hooksFixture(), refs=[];
    // Node SQLite's lastInsertRowid uses a different casing than Expo SQLite.
    const expoDb={...db.db,runAsync:async(...args)=>{const result=await db.db.runAsync(...args);return {...result,lastInsertRowId:result.lastInsertRowid};}};
    const endpointDao=load('src/db/tripDao.js','({getTripEndpoints,rememberTripLocationNames,addRecommendation})',{openDatabase:async()=>expoDb,getActiveTrip:markers.getActiveTrip});
    const screen=fixture('app/(tabs)/record/index.js','RecordScreen',{}, {
      ...native,...host.hooks,theme,StyleSheet:{create:x=>x,absoluteFillObject:{}},useAuthStore,
      ...markers,...db.dao,...endpointDao,getTripLocationNames:async()=>({}),
      useRef:initial=>{const ref=host.hooks.useRef(initial);if(!refs.includes(ref))refs.push(ref);return ref;},runMigrations:db.migrate,ensureRecordingPermissions,Location,TASK_NAME:'trip-location-task',
      startTrip:async(...args)=>{state.rows++;return db.dao.startTrip(...args);},startSegment:()=>`segment-${state.rows}-${state.starts}`,
      toast:notice=>state.notices.push(notice),Alert:{alert:(...args)=>state.alerts.push(args)},
      RecordingButton:'RecordingButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal',
      ...overrides,
    });
    const tree=()=>host.render(()=>screen.render());tree();
    const button=icon=>nodes(tree(),'RecordingButton').find(node=>node.props.icon===icon);
    return {tree,button,refs,blur:()=>host.blur(),focus:()=>host.focus(),press:icon=>button(icon).props.onPress(),unmount:()=>host.unmount(),
      status:()=>nodes(tree(),'Text').map(node=>node.children.join('')).find(text=>text.startsWith('Status:'))};
  }
  const snapshot=async()=>JSON.stringify(await Promise.all(tables.map(table=>db.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`))));
  return {db,state,Location,markers,useAuthStore,mount,snapshot,auth:()=>useAuthStore.getState(),
    holdWrites:callback=>{beforeWrite=callback;},holdDeletes:callback=>{beforeDelete=callback;},close:()=>db.close()};
}
function holdPermission(h, method='getForegroundPermissionsAsync') {
  const wait=deferred();h.Location[method]=async()=>{h.state.calls.push(method);return wait.promise;};return wait;
}
function assertNotStarted(h) {
  assert.equal(h.state.rows,0);assert.equal(h.state.starts,0);assert.equal(h.state.watchers.length,0);
  assert.deepEqual(h.state.active,{});assert.equal(h.state.running,false);assert.equal(h.state.notices.length,0);
}

async function confirmStop(h, screen) {
  await screen.press('stop');const alert=h.state.alerts.at(-1);assert.equal(alert[0],'Stop recording?');
  return alert[2].find(button=>button.text==='Stop').onPress();
}
function newTrip(screen) {
  const button=nodes(screen.tree(),'TouchableOpacity').find(node=>nodes(node,'Text').some(text=>text.children.join('')==='New trip'));
  assert.ok(button);button.props.onPress();
}
async function point(h, lat=1) {
  return h.db.dao.insertTrackPoint(h.state.active.tripId,h.state.active.segmentId,{lat,lon:2,timestamp:'2026-10-24T10:00:00Z',speed:2,accuracy:3});
}

test('focus reconciles another frame Pause without marker/SQLite writes or clearing same-trip draft, POI, or coordinates',async()=>{
  const h=await harness();let original,second;try {
    original=h.mount({ENABLE_POI_UI:true});await tick();await original.press('play');await point(h);original.tree();
    const first={lat:1,lon:2},last={lat:3,lon:4},draft={tripId:h.state.active.tripId,title:'Unsubmitted title'},poi={tripId:h.state.active.tripId,note:'Draft POI'};
    // Named refs are initialized once in RecordScreen: first/last 2/3, pendingPoi 6, metadataDraft 11.
    original.refs[2].current=first;original.refs[3].current=last;original.refs[6].current=poi;original.refs[11].current=draft;
    original.blur();second=h.mount();await tick();await second.press('pause');second.unmount();second=null;
    const before=await h.snapshot(),writes=h.state.markerWrites,stops=h.state.stops,starts=h.state.starts;
    original.focus();await tick();assert.equal(original.status(),'Status: Paused');assert.ok(original.button('play'));
    assert.equal(h.state.running,false);assert.equal(await h.snapshot(),before);assert.equal(h.state.markerWrites,writes);
    assert.equal(h.state.stops,stops);assert.equal(h.state.starts,starts);
    assert.equal(original.refs[2].current,first);assert.equal(original.refs[3].current,last);assert.equal(original.refs[6].current,poi);assert.equal(original.refs[11].current,draft);
  }finally{second?.unmount();original?.unmount();h.close();}
});

test('stopped A stale Pause and confirmed Stop cannot stop newer B; focus adopts B then intentional B Pause works',async()=>{
  const h=await harness();let original,second;try {
    original=h.mount();await tick();await original.press('play');await point(h);const a=h.state.active.tripId;
    const stalePause=original.button('pause').props.onPress;await original.press('stop');const staleConfirm=h.state.alerts.at(-1)[2].find(button=>button.text==='Stop').onPress;
    original.blur();second=h.mount();await tick();await confirmStop(h,second);newTrip(second);await second.press('play');await point(h,3);const b=h.state.active.tripId;
    assert.notEqual(a,b);const marker=JSON.stringify(h.state.active),before=await h.snapshot(),stops=h.state.stops;
    await stalePause();await staleConfirm();assert.equal(h.state.running,true);assert.equal(h.state.stops,stops);
    assert.equal(JSON.stringify(h.state.active),marker);assert.equal(await h.snapshot(),before);
    second.unmount();second=null;original.focus();await tick();assert.equal(original.status(),'Status: Recording');
    assert.equal(JSON.stringify(h.state.active),marker);assert.equal(await h.snapshot(),before);
    await original.press('pause');assert.equal(h.state.running,false);assert.equal((await h.db.dao.getLocalTrip(b,'owner')).status,'paused');
    assert.equal((await h.db.dao.getLocalTrip(a,'owner')).status,'stopped');assert.equal((await h.db.db.getAllAsync('SELECT * FROM track_points')).length,2);
  }finally{second?.unmount();original?.unmount();h.close();}
});

test('stale paused A Resume cannot overwrite B marker, row status, or collector',async()=>{
  const h=await harness();let original,second;try {
    original=h.mount();await tick();await original.press('play');const a=h.state.active.tripId;await original.press('pause');
    const resume=original.button('play').props.onPress;original.blur();second=h.mount();await tick();await second.press('play');const b=h.state.active.tripId;
    const marker=JSON.stringify(h.state.active),before=await h.snapshot(),starts=h.state.starts,stops=h.state.stops;
    await resume();assert.equal((await h.db.dao.getLocalTrip(a,'owner')).status,'paused');assert.notEqual(a,b);
    assert.equal(JSON.stringify(h.state.active),marker);assert.equal(await h.snapshot(),before);assert.equal(h.state.starts,starts);assert.equal(h.state.stops,stops);assert.equal(h.state.running,true);
  }finally{second?.unmount();original?.unmount();h.close();}
});

test('Stop confirmation for A segment 1 cannot stop the same trip resumed as segment 2',async()=>{
  const h=await harness();let original,second;try {
    original=h.mount();await tick();await original.press('play');const segment=h.state.active.segmentId;
    await original.press('stop');const confirm=h.state.alerts.at(-1)[2].find(button=>button.text==='Stop').onPress;
    original.blur();second=h.mount();await tick();await second.press('pause');await second.press('play');assert.notEqual(h.state.active.segmentId,segment);
    const marker=JSON.stringify(h.state.active),before=await h.snapshot(),stops=h.state.stops;await confirm();
    assert.equal(JSON.stringify(h.state.active),marker);assert.equal(await h.snapshot(),before);assert.equal(h.state.stops,stops);assert.equal(h.state.running,true);
  }finally{second?.unmount();original?.unmount();h.close();}
});

test('Stop confirmation captured before same-token logout/login does not adopt the replacement session',async()=>{
  const h=await harness();let original,current;try {
    original=h.mount();await tick();await original.press('play');await original.press('stop');const confirm=h.state.alerts.at(-1)[2].find(button=>button.text==='Stop').onPress;
    await h.auth().logout();original.unmount();original=null;await h.auth().login(account());current=h.mount();await tick();await current.press('play');
    const marker=JSON.stringify(h.state.active),before=await h.snapshot(),stops=h.state.stops,notices=h.state.notices.length;await confirm();
    assert.equal(JSON.stringify(h.state.active),marker);assert.equal(await h.snapshot(),before);assert.equal(h.state.stops,stops);assert.equal(h.state.notices.length,notices);assert.equal(h.state.running,true);
  }finally{current?.unmount();original?.unmount();h.close();}
});

test('two initially idle Record frames racing Start create only one local trip and one collector',async()=>{
  const h=await harness();let first,second;try {
    first=h.mount();second=h.mount();await tick();const one=first.button('play').props.onPress,two=second.button('play').props.onPress;
    await Promise.all([one(),two()]);assert.equal(h.state.rows,1);assert.equal(h.state.starts,1);assert.equal(h.state.stops,0);assert.equal(h.state.running,true);
    assert.equal((await h.db.db.getAllAsync('SELECT * FROM trips')).length,1);
    second.blur();second.focus();await tick();assert.equal(second.status(),'Status: Recording');assert.equal(h.state.stops,0);
  }finally{second?.unmount();first?.unmount();h.close();}
});

test('second frame mounting during a native Start waits rather than treating its not-yet-started marker as interrupted',async()=>{
  const h=await harness();let first,second;try {
    first=h.mount();await tick();const wait=deferred();h.Location.startLocationUpdatesAsync=async()=>{h.state.starts++;await wait.promise;h.state.running=true;};
    const start=first.press('play');await tick();second=h.mount();await tick();assert.equal(second.button('play'),undefined);assert.equal(h.state.stops,0);
    wait.resolve();await start;await tick();assert.equal(second.status(),'Status: Recording');assert.equal(h.state.running,true);assert.equal(h.state.stops,0);
    assert.equal((await h.db.dao.getLocalTrip(h.state.active.tripId,'owner')).status,'recording');
  }finally{second?.unmount();first?.unmount();h.close();}
});

test('paused no-marker recovery still resumes and stops without losing route points',async()=>{
  const h=await harness();let first;try {
    first=h.mount();await tick();await first.press('play');await point(h);const tid=h.state.active.tripId;await first.press('pause');
    assert.deepEqual(h.state.active,{});await first.press('play');await point(h,3);await confirmStop(h,first);
    assert.equal(first.status(),'Status: Saved locally');assert.equal(h.state.running,false);assert.deepEqual(h.state.active,{});
    assert.equal((await h.db.dao.getLocalTrip(tid,'owner')).status,'stopped');assert.equal((await h.db.db.getAllAsync('SELECT * FROM track_points')).length,2);
  }finally{first?.unmount();h.close();}
});

test('focus restores a missing local observer for B using B persisted endpoints, never A coordinates or a new background collector',async()=>{
  const h=await harness();let original,second;try {
    original=h.mount({ENABLE_POI_UI:true});await tick();await original.press('play');await point(h,1);await original.press('pause');original.tree();
    original.refs[2].current={lat:91,lon:92};original.refs[3].current={lat:93,lon:94};original.blur();
    second=h.mount();await tick();await second.press('play');await point(h,5);const b=h.state.active.tripId;second.unmount();second=null;
    const marker=JSON.stringify(h.state.active),before=await h.snapshot(),starts=h.state.starts,stops=h.state.stops,writes=h.state.markerWrites,watchers=h.state.watchers.length;
    original.focus();await tick();assert.equal(original.status(),'Status: Recording');assert.equal(h.state.watchers.length,watchers+1);
    assert.equal(JSON.stringify(original.refs[2].current),JSON.stringify({lat:5,lon:2}));
    assert.equal(original.refs[3].current,null,'persisted endpoint is not a fresh POI location');
    let opened=0;original.refs[5].current={open(){opened++;}};await original.press('location-sharp');assert.equal(opened,0);
    h.state.watchers.at(-1).callback({coords:{latitude:6,longitude:7}});
    assert.equal(JSON.stringify(original.refs[2].current),JSON.stringify({lat:5,lon:2}),'live preview must not replace B actual start');
    assert.equal(JSON.stringify(original.refs[3].current),JSON.stringify({lat:6,lon:7}));
    await original.press('location-sharp');assert.equal(opened,1);
    assert.equal(original.refs[6].current.tripId,b);assert.equal(original.refs[6].current.lat,6);
    assert.equal(JSON.stringify(h.state.active),marker);assert.equal(await h.snapshot(),before);assert.equal(h.state.starts,starts);assert.equal(h.state.stops,stops);assert.equal(h.state.markerWrites,writes);
  }finally{second?.unmount();original?.unmount();h.close();}
});

test('observer failure on focus does not clear a recording marker, stop collector, or downgrade the active trip',async()=>{
  const h=await harness();let first,second;try {
    first=h.mount();await tick();await first.press('play');await first.press('pause');first.blur();
    second=h.mount();await tick();await second.press('play');second.unmount();second=null;
    const before=await h.snapshot(),marker=JSON.stringify(h.state.active),stops=h.state.stops;h.Location.watchPositionAsync=async()=>{throw Error('synthetic observer error');};
    first.focus();await tick();assert.equal(first.status(),'Status: Recording');assert.equal(JSON.stringify(h.state.active),marker);
    assert.equal(await h.snapshot(),before);assert.equal(h.state.running,true);assert.equal(h.state.stops,stops);assert.equal(h.state.notices.at(-1).title,'Current location unavailable');
  }finally{second?.unmount();first?.unmount();h.close();}
});

for (const action of ['pause','stop']) test(`failed native ${action} exposes owned cleanup Retry Stop and keeps every recorded point`,async()=>{
  const h=await harness();let screen;try {
    screen=h.mount();await tick();await screen.press('play');await point(h);const tid=h.state.active.tripId,points=JSON.stringify(await h.db.db.getAllAsync('SELECT * FROM track_points'));
    const nativeStop=h.Location.stopLocationUpdatesAsync;h.Location.stopLocationUpdatesAsync=async()=>{throw Error('synthetic GPS shutdown failed');};
    if(action==='pause') await screen.press('pause');else await confirmStop(h,screen);
    assert.ok(h.state.active.cleanupId);assert.equal(screen.status(),'Status: GPS cleanup needed');assert.equal(screen.button('play'),undefined);
    const retry=nodes(screen.tree(),'TouchableOpacity').find(node=>node.props.accessibilityLabel==='Retry Stop');assert.ok(retry);assert.equal(retry.props.disabled,false);
    h.Location.stopLocationUpdatesAsync=nativeStop;await retry.props.onPress();await tick();assert.equal(h.state.running,false);assert.deepEqual(h.state.active,{});
    assert.equal(screen.status(),'Status: Not recording');assert.equal(JSON.stringify(await h.db.db.getAllAsync('SELECT * FROM track_points')),points);
    assert.equal((await h.db.dao.getLocalTrip(tid,'owner')).status,'recording','unfinished row remains recoverable rather than auto-stopped/uploaded');
  }finally{screen?.unmount();h.close();}
});

test('late A endpoint naming cannot open its Save sheet after focus adopts B',async()=>{
  const h=await harness();let original,second;try {
    const wait=deferred();original=h.mount({getTripLocationNames:()=>wait.promise});await tick();await original.press('play');let opened=0;original.refs[4].current={open(){opened++;}};
    const stopping=confirmStop(h,original);await tick();assert.equal(original.status(),'Status: Saved locally');original.blur();
    second=h.mount();await tick();await second.press('play');const marker=JSON.stringify(h.state.active);original.focus();await tick();assert.equal(original.status(),'Status: Recording');
    wait.resolve({startName:'A start',endName:'A end'});await stopping;
    assert.equal(opened,0,'old metadata must not open on the newly selected recording');assert.equal(JSON.stringify(h.state.active),marker);assert.equal(h.state.running,true);
  }finally{second?.unmount();original?.unmount();h.close();}
});

test('recommendation modal opened for A cannot write into B after focus changes recording identity',async()=>{
  const h=await harness();let original,second;try {
    original=h.mount();await tick();await original.press('play');h.state.watchers.at(-1).callback({coords:{latitude:1,longitude:2}});
    let opened=0;original.refs[7].current={open(){opened++;}};await original.press('star');assert.equal(opened,1);original.blur();
    second=h.mount();await tick();await confirmStop(h,second);newTrip(second);await second.press('play');const b=h.state.active.tripId;
    original.focus();await tick();const before=await h.snapshot();
    await assert.rejects(nodes(original.tree(),'AddRecommendationModal')[0].props.onSubmit({latitude:1,longitude:2,primaryCategory:'sight',attributeTags:[],rating:5,name:'A draft',description:'Opened during A'}),/recording changed/);
    assert.equal(await h.snapshot(),before,'stale A form must not create a B recommendation');assert.equal(h.state.active.tripId,b);assert.equal(h.state.running,true);
  }finally{second?.unmount();original?.unmount();h.close();}
});

test('same-trip focus keeps an open recommendation draft and saves it to its original paused trip',async()=>{
  const h=await harness();let original,second;try {
    original=h.mount();await tick();await original.press('play');const a=h.state.active.tripId;h.state.watchers.at(-1).callback({coords:{latitude:1,longitude:2}});
    original.refs[7].current={open(){}};await original.press('star');original.blur();second=h.mount();await tick();await second.press('pause');original.focus();await tick();
    const result=await nodes(original.tree(),'AddRecommendationModal')[0].props.onSubmit({latitude:1,longitude:2,primaryCategory:'sight',attributeTags:['view'],rating:5,name:'Same-trip draft',description:'Preserved while paused'});
    assert.ok(result._id);const rows=await h.db.db.getAllAsync('SELECT * FROM recommendations');assert.equal(rows.length,1);assert.equal(rows[0].trip_id,a);assert.equal(rows[0].name,'Same-trip draft');
  }finally{second?.unmount();original?.unmount();h.close();}
});

test('old Stop confirmation queued behind delayed native Resume cannot stop the newer segment after it starts',async()=>{
  const h=await harness();let first,second;try {
    first=h.mount();await tick();await first.press('play');await first.press('stop');const confirm=h.state.alerts.at(-1)[2].find(button=>button.text==='Stop').onPress;
    first.blur();second=h.mount();await tick();await second.press('pause');const wait=deferred();h.Location.startLocationUpdatesAsync=async()=>{h.state.starts++;await wait.promise;h.state.running=true;};
    const resume=second.press('play');await tick();const stopping=confirm();await tick();assert.equal(h.state.stops,1);
    wait.resolve();await resume;await stopping;assert.equal(h.state.running,true);assert.equal(h.state.stops,1);assert.ok(h.state.active.tripId);
    assert.equal((await h.db.dao.getLocalTrip(h.state.active.tripId,'owner')).status,'recording');
  }finally{second?.unmount();first?.unmount();h.close();}
});

test('a delayed optional focus observer never blocks Pause and is removed if it arrives after Pause',async()=>{
  const h=await harness();let first,second;try {
    first=h.mount();await tick();await first.press('play');await first.press('pause');first.blur();
    second=h.mount();await tick();await second.press('play');second.unmount();second=null;
    const wait=deferred(),watcher={removed:0,remove(){this.removed++;}};h.Location.watchPositionAsync=()=>wait.promise;
    first.focus();await tick();assert.equal(first.status(),'Status: Recording');const pause=first.press('pause');await tick();
    assert.equal(h.state.running,false,'local preview must not hold the singleton transition');await pause;assert.equal(first.status(),'Status: Paused');
    wait.resolve(watcher);await tick();assert.equal(watcher.removed,1);assert.deepEqual(h.state.active,{});assert.equal(first.refs[0].current,null);
  }finally{second?.unmount();first?.unmount();h.close();}
});
