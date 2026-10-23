const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,load,nodes,theme,native}=require('./helpers/component-fixture.cjs');
const {sqliteFixture}=require('./helpers/sqlite-fixture.cjs');
const {recordingFixture}=require('./helpers/recording-fixture.cjs');
const tick=()=>new Promise(setImmediate);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const original={tripId:'old-trip',segmentId:'old-segment',userId:'owner'};
const session=()=>({user:{_id:'owner'},token:'token',sessionEpoch:1,isSessionChanging:false});
function harness({db,active={},running=true,fail=true,sessionState=session(),extra={},markerExtra={}}={}) {
  const state={active,running,fail,stops:0,watcherRemovals:0};
  db?.setActive(active);
  const markers=recordingFixture(()=>state.active,value=>{state.active=value;db?.setActive(value);},markerExtra);
  const location={Accuracy:{High:1},hasStartedLocationUpdatesAsync:async()=>state.running,
    stopLocationUpdatesAsync:async()=>{state.stops++;if(state.fail)throw Error('Native stop failed');state.running=false;},
    watchPositionAsync:async()=>({remove:()=>state.watcherRemovals++})};
  function mount(overrides={}) {
    const effects=[],notices=[];
    const screen=fixture('app/(tabs)/record/index.js','RecordScreen',{}, {
      ...native,theme,StyleSheet:{create:x=>x,absoluteFillObject:{}},useEffect:fn=>effects.push(fn),
      useAuthStore:Object.assign(select=>select(sessionState),{getState:()=>sessionState}),
      runMigrations:db?.migrate||(async()=>{}),getPendingTrips:db?.dao.getPendingTrips||(async()=>[]),
      getLocalTrip:db?.dao.getLocalTrip||(async()=>{throw Error('missing');}),ownsLocalTrip:db?.dao.ownsLocalTrip||(async()=>false),
      ...markers,Location:location,TASK_NAME:'task',toast:n=>notices.push(n),
      CircleButton:'CircleButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal',
      ...extra,...overrides,
    });
    screen.render();const cleanup=effects[0]();
    const tree=()=>screen.render();
    return {screen,tree,cleanup,notices,retry:()=>nodes(tree(),'TouchableOpacity').find(n=>n.props.accessibilityLabel==='Retry Stop'),
      status:()=>nodes(tree(),'Text').map(n=>n.children.join('')).find(t=>t.startsWith('Status:'))};
  }
  return {state,markers,location,session:sessionState,mount};
}
async function savedFixture(){
  const f=await sqliteFixture();const id=await f.dao.startTrip('owner');
  await f.dao.insertTrackPoint(id,'segment',{lat:1,lon:2,timestamp:'2026-01-01T00:00:00Z',speed:0,accuracy:1});
  await f.dao.stopTrip(id,'2026-01-01T01:00:00Z','owner');
  await f.dao.finishTrip(id,{endTime:'2026-01-01T01:00:00Z',title:'Saved',description:'Keep',startName:'A',endName:'B',defaultTransportMode:'walking',defaultTripVisibility:'private'},'owner');
  await f.dao.markTripUploaded(id,'owner');return {f,id};
}
const snapshot=async f=>JSON.stringify(await Promise.all(['trips','track_points','pois','recommendations'].map(table=>f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`))));

test('failed legacy cleanup survives remount with Retry Stop, blocks Start and preserves every historical row',async()=>{
  const {f,id}=await savedFixture();try {
    const before=await snapshot(f),h=harness({db:f,active:{...original,tripId:id}});
    let screen=h.mount();await tick();
    assert.equal(screen.status(),'Status: CLEANUP_REQUIRED');assert.ok(screen.retry());assert.equal(screen.retry().props.disabled,false);
    assert.equal(nodes(screen.tree(),'CircleButton').some(n=>n.props.icon==='play'),false);
    assert.equal(h.state.active.tripId,undefined);assert.ok(h.state.active.cleanupId);assert.equal(h.state.running,true);
    await assert.rejects(h.markers.setActiveTrip('new','new-s','owner'),/Stop/);
    screen.cleanup();screen=h.mount();await tick();assert.equal(h.state.stops,2);assert.ok(screen.retry());
    h.state.fail=false;await screen.retry().props.onPress();
    assert.equal(h.state.stops,3);assert.equal(h.state.running,false);assert.deepEqual(h.state.active,{});
    assert.equal(screen.status(),'Status: IDLE');assert.equal(screen.notices.at(-1).title,'Stale recording stopped');
    assert.equal(await snapshot(f),before);screen.cleanup();
  }finally{f.close();}
});

test('build-4 missing local row still stops its exact old collector without recreating or modifying history',async()=>{
  for(const running of [true,false]) {
    const f=await sqliteFixture();try {
      const id=await f.dao.startTrip('owner');await f.db.runAsync('DELETE FROM trips WHERE id=?',[id]);
      const before=await snapshot(f);const h=harness({db:f,active:{...original,tripId:id},fail:false,running});
      const screen=h.mount();await tick();assert.equal(h.state.stops,running?1:0);assert.equal(h.state.running,false);
      assert.deepEqual(h.state.active,{});assert.equal(screen.status(),'Status: IDLE');assert.equal(await snapshot(f),before);screen.cleanup();
    }finally{f.close();}
  }
});

test('markerless running collector has the same visible fail/retry path; truly inactive startup remains idle',async()=>{
  const h=harness();const screen=h.mount();await tick();
  assert.ok(screen.retry());assert.ok(h.state.active.cleanupId);assert.equal(h.state.active.tripId,undefined);
  h.state.fail=false;await screen.retry().props.onPress();assert.equal(screen.status(),'Status: IDLE');assert.equal(h.state.stops,2);screen.cleanup();
  const inactive=harness({running:false,fail:false}),other=inactive.mount();await tick();assert.equal(other.status(),'Status: IDLE');assert.equal(inactive.state.stops,0);assert.equal(other.notices.length,0);other.cleanup();
});

test('different-owner marker is not stopped or cleared and does not expose trip details',async()=>{
  const h=harness({active:{...original,userId:'other'},extra:{getLocalTrip:async()=>{throw Error('must not read');}}});
  const screen=h.mount();await tick();assert.equal(h.state.stops,0);assert.deepEqual(h.state.active,{...original,userId:'other'});
  assert.equal(screen.status(),'Status: CLEANUP_REQUIRED');assert.match(screen.notices.at(-1).msg,/different account/);screen.cleanup();
});

test('cleanup never replaces an already-newer recording or an asynchronously replaced marker',async()=>{
  const h=harness({active:{tripId:'new',segmentId:'new-s',userId:'other'},fail:false});
  assert.equal(await h.markers.stopAbandonedRecording({...original,location:h.location,taskName:'task'}),'superseded');
  assert.equal(h.state.stops,0);assert.equal(h.state.active.tripId,'new');
  const wait=deferred();const old=harness({active:{...original},fail:false});
  old.location.hasStartedLocationUpdatesAsync=async()=>{await wait.promise;return true;};
  const work=old.markers.stopAbandonedRecording({...original,location:old.location,taskName:'task'});await tick();
  old.state.active={tripId:'new',segmentId:'new-s',userId:'other'};wait.resolve();
  assert.equal(await work,'superseded');assert.equal(old.state.stops,0);assert.equal(old.state.active.tripId,'new');
});

test('logout or same-token session epoch change while cleanup checks native state prevents a stale stop',async()=>{
  for(const change of [s=>{s.user=null;s.token=null;},s=>{s.sessionEpoch++;s.isSessionChanging=true;}]) {
    const wait=deferred(),h=harness({active:{...original},fail:false});let checks=0;
    h.location.hasStartedLocationUpdatesAsync=async()=>{checks++;if(checks===2)await wait.promise;return true;};
    const screen=h.mount();await tick();assert.ok(h.state.active.cleanupId);change(h.session);wait.resolve();await tick();
    assert.equal(h.state.stops,0);assert.ok(h.state.active.cleanupId);assert.equal(screen.notices.length,0);screen.cleanup();
  }
});

test('unmount before native cleanup dispatch suppresses stop and leaves a retryable marker for next mount',async()=>{
  const wait=deferred(),h=harness({active:{...original},fail:false});let checks=0;
  h.location.hasStartedLocationUpdatesAsync=async()=>{checks++;if(checks===2)await wait.promise;return h.state.running;};
  const screen=h.mount();await tick();screen.cleanup();wait.resolve();await tick();assert.equal(h.state.stops,0);assert.ok(h.state.active.cleanupId);
  const next=h.mount();await tick();assert.equal(h.state.stops,1);assert.equal(next.status(),'Status: IDLE');next.cleanup();
});

test('hung native Stop is bounded, retained and deduplicated across retries; Start and ordinary clear cannot bypass it',async()=>{
  const timers=[];const wait=deferred();const h=harness({active:{...original},fail:false,markerExtra:{setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}}});
  h.location.stopLocationUpdatesAsync=async()=>{h.state.stops++;await wait.promise;h.state.running=false;};
  const call=()=>h.markers.stopAbandonedRecording({...original,location:h.location,taskName:'task'});
  const first=call();await tick();timers.shift()();await assert.rejects(first,/still pending/);
  assert.ok(h.state.active.cleanupId);await h.markers.clearActiveTrip();assert.ok(h.state.active.cleanupId);
  await assert.rejects(h.markers.setActiveTrip('new','new-s','owner'),/Stop/);
  const retry=call();await tick();timers.shift()();await assert.rejects(retry,/still pending/);assert.equal(h.state.stops,1);
  wait.resolve();await tick();assert.equal(h.state.running,false);assert.deepEqual(h.state.active,{});
});

test('resolved native Stop is not reported inactive if the task still reports running',async()=>{
  const h=harness({active:{...original},fail:false});h.location.stopLocationUpdatesAsync=async()=>{h.state.stops++;};
  const screen=h.mount();await tick();assert.equal(screen.status(),'Status: CLEANUP_REQUIRED');assert.ok(h.state.active.cleanupId);
  assert.match(screen.notices.at(-1).msg,/still running/);assert.equal(screen.notices.some(n=>n.title==='Stale recording stopped'),false);screen.cleanup();
});

test('unreadable marker and rejected native inspection stay visibly blocked rather than treating unknown as inactive',async()=>{
  for(const overrides of [{getActiveTrip:async()=>{throw Error('Storage unavailable');}},{readRecordingTaskState:async()=>{throw Error('Native unavailable');}}]) {
    const h=harness({active:{...original}}),screen=h.mount(overrides);await tick();assert.equal(screen.status(),'Status: CLEANUP_REQUIRED');
    assert.equal(h.state.stops,0);assert.deepEqual(h.state.active,original);assert.ok(screen.retry());screen.cleanup();
  }
});

test('storage mutations compare the exact marker and serialize cleanup against a queued newer Start',async()=>{
  let marker={...original};const m=recordingFixture(()=>marker,value=>{marker=value;});
  const old={...marker};await m.clearActiveTrip(old);await m.setActiveTrip('new','new-s','owner');
  assert.equal(await m.claimRecordingCleanup(old),null);assert.equal(marker.tripId,'new');
  assert.equal(await m.clearActiveTrip(old),false);assert.equal(marker.tripId,'new');
  const claim=m.claimRecordingCleanup({...marker});const start=m.setActiveTrip('another','another-s','owner');
  const cleanup=await claim;await assert.rejects(start,/Stop/);assert.equal(marker.cleanupId,cleanup.cleanupId);
  assert.equal(await m.finishRecordingCleanup({cleanupId:'older'}),false);assert.equal(marker.cleanupId,cleanup.cleanupId);
});

test('cleanup-only marker disables initial and already-in-flight background batches',async()=>{
  const h=harness({active:{...original}});let callback,writes=0;
  load('src/background/TripLocationTask.js','TASK_NAME',{
    TaskManager:{defineTask:(_name,fn)=>{callback=fn;}},getActiveTrip:h.markers.getActiveTrip,
    SecureStore:{getItemAsync:async()=>JSON.stringify({_id:'owner'})},
    insertTrackPoint:async()=>{writes++;await h.markers.claimRecordingCleanup({...original});},
  });
  const event={data:{locations:[1,2,3].map(i=>({coords:{latitude:i,longitude:i,speed:1,accuracy:1},timestamp:i}))}};
  await callback(event);assert.equal(writes,1);assert.ok(h.state.active.cleanupId);
  await callback(event);assert.equal(writes,1);
});

test('failed Start plus failed shutdown removes foreground watcher, exposes Retry Stop and stale Start cannot create another row',async()=>{
  const f=await sqliteFixture();try {
    const h=harness({db:f,running:false,fail:true,extra:{startTrip:f.dao.startTrip,startSegment:()=> 'segment',ensureRecordingPermissions:async()=>true}});
    h.location.startLocationUpdatesAsync=async()=>{h.state.running=true;throw Error('Start failed after native launch');};
    const screen=h.mount();await tick();const start=nodes(screen.tree(),'CircleButton').find(n=>n.props.icon==='play').props.onPress;
    await start();assert.equal(screen.status(),'Status: CLEANUP_REQUIRED');assert.equal(h.state.watcherRemovals,1);assert.ok(h.state.active.cleanupId);
    await start();assert.equal((await f.db.getAllAsync('SELECT * FROM trips')).length,1);assert.equal(h.state.stops,1);
    const before=await snapshot(f);h.state.fail=false;await screen.retry().props.onPress();assert.equal(screen.status(),'Status: IDLE');assert.equal(await snapshot(f),before);screen.cleanup();
  }finally{f.close();}
});

test('failed row lookup is not treated as a deleted legacy row when ownership still exists',async()=>{
  const f=await sqliteFixture();try {
    const id=await f.dao.startTrip('owner');const h=harness({db:f,active:{...original,tripId:id}});
    const screen=h.mount({getLocalTrip:async()=>{throw Error('SQLite read failed');}});await tick();
    assert.equal(h.state.stops,0);assert.equal(h.state.active.tripId,id);assert.equal(screen.status(),'Status: CLEANUP_REQUIRED');
    assert.equal(screen.notices.at(-1).msg,'SQLite read failed');screen.cleanup();
  }finally{f.close();}
});

test('native inspection timeout exposes Retry Stop without accepting a late unknown-state result',async()=>{
  const timers=[],wait=deferred();const h=harness({markerExtra:{setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}}});
  h.location.hasStartedLocationUpdatesAsync=()=>wait.promise;
  const screen=h.mount();await tick();timers.shift()();await tick();
  assert.equal(screen.status(),'Status: CLEANUP_REQUIRED');assert.equal(screen.retry().props.disabled,false);assert.equal(h.state.stops,0);
  wait.resolve(false);await tick();assert.equal(screen.status(),'Status: CLEANUP_REQUIRED');screen.cleanup();
});

test('logout takes over cancelled screen cleanup but never retries against a newer owner marker',async()=>{
  const wait=deferred();const h=harness({active:{...original},fail:false});let checks=0;
  h.location.hasStartedLocationUpdatesAsync=async()=>{if(++checks===2)await wait.promise;return h.state.running;};
  const screen=h.mount({TASK_NAME:'trip-location-task'});await tick();h.session.sessionEpoch++;h.session.isSessionChanging=true;
  const stop=load('src/utils/stopActiveRecording.js','stopActiveRecording',{...h.markers,Location:h.location});
  const logout=stop();wait.resolve();await logout;assert.equal(h.state.stops,1);assert.equal(h.state.running,false);assert.deepEqual(h.state.active,{});screen.cleanup();
  let attempts=0,reads=0;const old={...original},newer={tripId:'new',segmentId:'new',userId:'new-owner'};
  const guarded=load('src/utils/stopActiveRecording.js','stopActiveRecording',{
    getActiveTrip:async()=>++reads===1?old:newer,stopAbandonedRecording:async()=>{attempts++;return 'superseded';},Location:{},
  });
  await assert.rejects(guarded(),/Recording changed/);assert.equal(attempts,1);
});
