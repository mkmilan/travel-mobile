const test = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {sqliteFixture} = require('./helpers/sqlite-fixture.cjs');
const {read,load} = require('./helpers/component-fixture.cjs');
const metadata = {endTime:'2026-01-02T03:04:05.000Z', title:'Synthetic route', description:'Recorded safely',startName:'A',endName:'B',defaultTransportMode:'walking',defaultTripVisibility:'private'};
const end = metadata.endTime;

test('actual SQLite: unsaved new trip requires confirmed metadata, keeps owner defaults and exact route payload',async()=>{
  const f=await sqliteFixture();try {
    const id=await f.dao.startTrip('owner',{defaultTripVisibility:'private',defaultTravelMode:'walking'});
    const point={lat:0,lon:1,timestamp:'2026-01-02T01:00:00.000Z',speed:2,accuracy:3};
    await f.dao.insertTrackPoint(id,'segment',point);
    await assert.rejects(f.dao.buildTripJsonForUpload(id,{},'owner'),/Stop/);
    await f.dao.stopTrip(id,end,'owner');
    await assert.rejects(f.dao.buildTripJsonForUpload(id,{defaultTripVisibility:'public'},'owner'),e=>e.code==='TRIP_METADATA_REQUIRED');
    assert.equal((await f.dao.getLocalTrip(id,'owner')).default_trip_visibility,'private');
    await f.dao.finishTrip(id,metadata,'owner');
    const payload=await f.dao.buildTripJsonForUpload(id,{defaultTripVisibility:'public',defaultTravelMode:'car'},'owner');
    assert.equal(payload.defaultTripVisibility,'private');assert.equal(payload.defaultTravelMode,'walking');
    assert.deepEqual(JSON.parse(JSON.stringify(payload.segments)),[{startTime:point.timestamp,endTime:point.timestamp,track:[{lat:0,lon:1,t:point.timestamp,spd:2,acc:3}]}]);
    await f.dao.finishTrip(id,{...metadata,defaultTripVisibility:'public',defaultTransportMode:'bicycle'},'owner');
    assert.equal((await f.dao.buildTripJsonForUpload(id,{defaultTripVisibility:'private'},'owner')).defaultTripVisibility,'public');
    await assert.rejects(f.dao.finishTrip(id,metadata,'other'),/not found/);
    assert.equal((await f.dao.getLocalTrip(id,'owner')).default_trip_visibility,'public');
  } finally {f.close();}
});

test('actual SQLite: additive migration preserves legacy saved public metadata and never confirms legacy unsaved defaults',async()=>{
  const f=await sqliteFixture();try {
    await f.db.runAsync(`INSERT INTO trips(id,user_id,start_time,status,end_time,title,default_trip_visibility,default_transport_mode) VALUES(?,?,?,?,?,?,?,?)`,['old-saved','owner',end,'stopped',end,'Old public','public','car']);
    await f.db.runAsync(`INSERT INTO trips(id,user_id,start_time,status) VALUES(?,?,?,?)`,['old-unsaved','owner',end,'recording']);
    const before=JSON.stringify(await f.db.getAllAsync('SELECT * FROM trips ORDER BY id'));await f.migrate();
    assert.equal(JSON.stringify(await f.db.getAllAsync('SELECT * FROM trips ORDER BY id')),before);
    const saved=await f.dao.buildTripJsonForUpload('old-saved',{defaultTripVisibility:'private'},'owner');
    assert.equal(saved.defaultTripVisibility,'public');
    const raw=await f.dao.getLocalTrip('old-unsaved','owner');
    assert.equal(f.dao.tripMetadataDefaults(raw,{defaultTripVisibility:'private',defaultTravelMode:'walking'}).visibility,'private');
    await f.dao.stopTrip('old-unsaved',end,'owner');
    // Stop without Save must never turn an unknown legacy row into confirmed data.
    await assert.rejects(f.dao.buildTripJsonForUpload('old-unsaved',{},'owner'),e=>e.code==='TRIP_METADATA_REQUIRED');
  } finally {f.close();}
});

test('actual SQLite: confirmation, original stop time and metadata survive close/reopen',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'travel-synthetic-'));let f;
  try {
    const file=path.join(dir,'trips.db');f=await sqliteFixture(file);const id=await f.dao.startTrip('owner');
    await f.dao.stopTrip(id,end,'owner');await f.dao.finishTrip(id,metadata,'owner');f.close();
    f=await sqliteFixture(file);await f.dao.stopTrip(id,'2099-01-01','owner');
    const restored=await f.dao.getLocalTrip(id,'owner');assert.equal(restored.end_time,end);assert.equal(restored.metadata_confirmed,1);
    assert.equal((await f.dao.buildTripJsonForUpload(id,{},'owner')).defaultTripVisibility,'private');
  } finally {f?.close();rmSync(dir,{recursive:true,force:true});}
});

function handlers(dependencies,first,last,expression) {
  const source=read('app/(tabs)/record/index.js');return vm.runInNewContext(source.slice(source.indexOf(first),source.indexOf(last,source.indexOf(first)))+';'+expression,dependencies);
}
test('metadata handler refuses changed owner/token and preserves cancelled draft on upload review',async()=>{
  let writes=0;const session={user:{_id:'owner'},token:'token'};
  const draft={tripId:'trip',userId:'owner',token:'token',endTime:end,startName:'A',endName:'B'};
  const deps={metadataDraft:{current:draft},useAuthStore:{getState:()=>session},finishTrip:async()=>writes++,toast(){},refreshPending:async()=>{}};
  const save=handlers(deps,'const handleSaveMeta = ','\n\tconst handleUpload','handleSaveMeta');
  await save({title:'Public',mode:'car',visibility:'public'});assert.equal(writes,1);
  session.token='different';await assert.rejects(save({}),/Account changed/);assert.equal(writes,1);
  session.token='token';session.user={_id:'other'};await assert.rejects(save({}),/Account changed/);assert.equal(writes,1);
  session.user={_id:'owner'};let reopened=0,opened=0;
  const edit=handlers({...deps,user:session.user,tripId:'trip',getLocalTrip:async()=>({status:'stopped'}),sheetRef:{current:{reopen:()=>reopened++,open:()=>opened++}}},'const handleEditDetails = ','\n\tconst handleStop','handleEditDetails');
  await edit();assert.equal(reopened,1);assert.equal(opened,0);
});

test('actual SQLite: active/paused/restored records cannot upload, delete or become uploaded; late points cannot enter stopped/uploaded/deleted trips',async()=>{
  const f=await sqliteFixture();try {
    const id=await f.dao.startTrip('owner');const point={lat:1,lon:2,timestamp:end,speed:3,accuracy:4};
    await f.dao.insertTrackPoint(id,'s',point);f.setActive({tripId:id,userId:'owner'});
    for(const action of [()=>f.dao.buildTripJsonForUpload(id,{},'owner'),()=>f.dao.deleteTrip(id,'owner'),()=>f.dao.markTripUploaded(id,'owner'),()=>f.dao.setTripRecordingStatus(id,'paused','owner')]) await assert.rejects(action(),/Stop/);
    assert.equal((await f.db.getAllAsync('SELECT * FROM track_points')).length,1);
    f.setActive({});await f.dao.setTripRecordingStatus(id,'paused','owner');
    await assert.rejects(f.dao.buildTripJsonForUpload(id,{},'owner'),/Stop/);await assert.rejects(f.dao.deleteTrip(id,'owner'),/Stop/);
    await f.dao.insertTrackPoint(id,'s',point);assert.equal((await f.db.getAllAsync('SELECT * FROM track_points')).length,1);
    await f.dao.setTripRecordingStatus(id,'recording','owner');await f.dao.insertTrackPoint(id,'s2',point);
    await f.dao.stopTrip(id,end,'owner');await f.dao.finishTrip(id,metadata,'owner');
    // A stale restored marker must block even a superficially stopped row.
    f.setActive({tripId:id,userId:'owner'});await assert.rejects(f.dao.deleteTrip(id,'owner'),/Stop/);await assert.rejects(f.dao.buildTripJsonForUpload(id,{},'owner'),/Stop/);
    f.setActive({});await f.dao.insertTrackPoint(id,'s',point);await f.dao.markTripUploaded(id,'owner');await f.dao.insertTrackPoint(id,'s',point);
    assert.equal((await f.db.getAllAsync('SELECT * FROM track_points')).length,2);
    await assert.rejects(f.dao.setTripRecordingStatus(id,'recording','owner'),/already stopped/);
    const deleted=await f.dao.startTrip('owner');await f.dao.stopTrip(deleted,end,'owner');await f.dao.deleteTrip(deleted,'owner');await f.dao.insertTrackPoint(deleted,'s',point);
    assert.equal((await f.db.getAllAsync('SELECT * FROM track_points WHERE trip_id = ?',[deleted])).length,0);
  } finally {f.close();}
});

const {fixture,nodes,theme,native} = require('./helpers/component-fixture.cjs');
test('pending UI blocks recording/paused/restored upload and delete, while inactive recovery remains reachable',()=>{
  for(const status of ['recording','paused','stopped']) {
    for(const isActive of [false,true]) {
      const tree=fixture('app/(tabs)/record/index.js','PendingRow',{item:{id:'trip',status,start_time:end,pointsCount:1},isActive,canRecover:true,onUpload(){},onDelete(){},onRecover(){}},{...native,theme,Ionicons:'Ionicons',StyleSheet:{create:x=>x,absoluteFillObject:{}}}).render();
      const buttons=nodes(tree,'Ionicons');assert.equal(typeof buttons.find(n=>n.props.name==='cloud-upload').props.onPress==='function',status==='stopped'&&!isActive);
      assert.equal(typeof buttons.find(n=>n.props.name==='trash').props.onPress==='function',status==='stopped'&&!isActive);
      assert.equal(nodes(tree,'TouchableOpacity').length,status!=='stopped'&&!isActive?1:0);
    }
  }
});

test('active/paused screen handlers refuse upload/delete even when invoked outside disabled UI',async()=>{
  for(const status of ['recording','paused']) {
    let actions=0;
    const base={tripId:'trip',status,isRestoring:false,lifecycleRequest:{current:false},uploadRequest:{current:false},buildTripJsonForUpload:async()=>actions++,deleteTrip:async()=>actions++};
    const upload=handlers(base,'const handleUpload = ','\n\tconst resetState','handleUpload');
    const del=handlers(base,'const handleDelete = ','\n\tconst handleEditDetails','handleDelete');
    await upload();await del('trip');assert.equal(actions,0);
  }
});

test('recovery retains trip as paused with all data and reaches Stop without starting GPS or needing permissions',async()=>{
  const f=await sqliteFixture();try {
    const id=await f.dao.startTrip('owner');let selected,status;
    const session={user:{_id:'owner'},token:'token'};
    const recover=handlers({isRestoring:false,status:'idle',lifecycleRequest:{current:false},uploadRequest:{current:false},useAuthStore:{getState:()=>session},user:session.user,
      setTripRecordingStatus:f.dao.setTripRecordingStatus,metadataDraft:{current:null},firstPoint:{current:null},lastPoint:{current:null},tripEndTime:{current:null},setTripId:id=>selected=id,setSegment(){},setStatus:x=>status=x,refreshPending:async()=>{},toast(){}},'const handleRecover = ','\n\tconst handleDelete','handleRecover');
    await recover(id);assert.equal(selected,id);assert.equal(status,'paused');assert.equal((await f.dao.getLocalTrip(id,'owner')).status,'paused');
    await f.dao.stopTrip(id,end,'owner');await f.dao.finishTrip(id,metadata,'owner');assert.equal((await f.dao.buildTripJsonForUpload(id,{},'owner')).title,metadata.title);
  } finally {f.close();}
});

test('pause/resume persists lifecycle, denied permission stays paused and failed native resume rolls back without deleting data',async()=>{
  const f=await sqliteFixture();try {
    const id=await f.dao.startTrip('owner');let state='recording',nativeRunning=true,allow=true,fail=false;
    const session={user:{_id:'owner'},token:'token'},messages=[];
    const make=()=>handlers({tripId:id,status:state,isRestoring:false,lifecycleRequest:{current:false},stopRequest:{current:null},useAuthStore:{getState:()=>session},user:session.user,
      stopLocationWatcher:async()=>{},startLocationWatcher:async()=>{},clearActiveTrip:async()=>f.setActive({}),setActiveTrip:async(tid)=>f.setActive({tripId:tid}),setTripRecordingStatus:f.dao.setTripRecordingStatus,startSegment:()=> 's2',setSegment(){},setStatus:s=>state=s,requestRecordingAccess:async()=>allow,refreshPending:async()=>{},toast:x=>messages.push(x),TASK_NAME:'task',TIME_INTERVAL:5000,DISTANCE_INTERVAL:10,
      Location:{Accuracy:{High:1},hasStartedLocationUpdatesAsync:async()=>nativeRunning,stopLocationUpdatesAsync:async()=>{nativeRunning=false;},startLocationUpdatesAsync:async()=>{if(fail)throw Error('synthetic failure');nativeRunning=true;}}},'const handlePauseResume = ','\n\tconst handleRecover','handlePauseResume');
    f.setActive({tripId:id});await make()();assert.equal(state,'paused');assert.equal((await f.dao.getLocalTrip(id,'owner')).status,'paused');
    allow=false;await make()();assert.equal(state,'paused');allow=true;fail=true;await make()();assert.equal(state,'paused');assert.equal((await f.dao.getLocalTrip(id,'owner')).status,'paused');assert.equal(messages.at(-1).type,'danger');
    fail=false;await make()();assert.equal(state,'recording');assert.equal((await f.dao.getLocalTrip(id,'owner')).status,'recording');
  } finally {f.close();}
});

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const stopAbandonedRecording=load('src/utils/recordingAttempt.js','stopAbandonedRecording');
test('native start settling after logout is cleaned up; a newer recording marker is never stopped',async()=>{
  for(const newer of [false,true]) {
    const waiting=deferred();let active={},running=false,stopped=0,uiUpdates=0;
    const session={user:{_id:'owner'},token:'old'};const lifecycleRequest={current:false};
    const Location={Accuracy:{High:1},hasStartedLocationUpdatesAsync:async()=>running,stopLocationUpdatesAsync:async()=>{stopped++;running=false;},startLocationUpdatesAsync:async()=>{await waiting.promise;running=true;}};
    const resume=handlers({tripId:'trip',status:'paused',isRestoring:false,lifecycleRequest,stopRequest:{current:null},useAuthStore:{getState:()=>session},user:session.user,requestRecordingAccess:async()=>true,setTripRecordingStatus:async()=>{},startSegment:()=> 's',setActiveTrip:async()=>{active={tripId:'trip',segmentId:'s',userId:'owner'};},getActiveTrip:async()=>active,clearActiveTrip:async()=>{active={};},stopAbandonedRecording,Location,TASK_NAME:'task',TIME_INTERVAL:5000,DISTANCE_INTERVAL:10,startLocationWatcher:async()=>{},setSegment(){},setStatus(){uiUpdates++;},toast(){},refreshPending:async()=>{}},'const handlePauseResume = ','\n\tconst handleRecover','handlePauseResume');
    const work=resume();await new Promise(setImmediate);session.user={_id:'other'};session.token='new';active=newer?{tripId:'new-trip',segmentId:'new-s',userId:'other'}:{};waiting.resolve();await work;
    assert.equal(stopped,newer?0:1);assert.equal(uiUpdates,0);assert.equal(lifecycleRequest.current,false);
  }
});

test('Start lock deduplicates delayed DAO creation and cleans native startup after logout',async()=>{
  const created=deferred(),started=deferred();let rows=0,starts=0,active={},running=false,stops=0;
  const session={user:{_id:'owner',settings:{defaultTripVisibility:'private'}},token:'token'};const lifecycleRequest={current:false};
  const Location={Accuracy:{High:1},startLocationUpdatesAsync:async()=>{starts++;await started.promise;running=true;},hasStartedLocationUpdatesAsync:async()=>running,stopLocationUpdatesAsync:async()=>{running=false;stops++;}};
  const start=handlers({isRestoring:false,status:'idle',lifecycleRequest,uploadRequest:{current:false},user:session.user,useAuthStore:{getState:()=>session},requestRecordingAccess:async()=>true,startTrip:async()=>{rows++;await created.promise;return 'trip';},startSegment:()=> 's',metadataDraft:{current:null},tripEndTime:{current:null},setActiveTrip:async()=>{active={tripId:'trip',segmentId:'s',userId:'owner'};},getActiveTrip:async()=>active,clearActiveTrip:async()=>{active={};},startLocationWatcher:async()=>{},stopAbandonedRecording,Location,TASK_NAME:'task',TIME_INTERVAL:5000,DISTANCE_INTERVAL:10},'const handleStart = ','\n\tconst handlePauseResume','handleStart');
  const work=start();await new Promise(setImmediate);await start();assert.equal(rows,1);created.resolve();await new Promise(setImmediate);assert.equal(starts,1);
  session.token=null;session.user=null;active={};started.resolve();await work;assert.equal(stops,1);assert.equal(lifecycleRequest.current,false);
});

test('foreground watcher completed after stop/session change is removed instead of replacing the current handle',async()=>{
  const waiting=deferred();let callback,removed=0;const session={user:{_id:'owner'},token:'token'},watcherRequest={current:0},locationWatcher={current:null},firstPoint={current:null};
  const start=handlers({watcherRequest,locationWatcher,firstPoint,lastPoint:{current:null},useAuthStore:{getState:()=>session},TIME_INTERVAL:5000,DISTANCE_INTERVAL:10,Location:{Accuracy:{High:1},watchPositionAsync:async(_,cb)=>{callback=cb;await waiting.promise;return {remove:()=>removed++};}}},'const startLocationWatcher = ','\n\t// ─────── actions','startLocationWatcher');
  const work=start();watcherRequest.current++;session.token='new';callback({coords:{latitude:1,longitude:2}});waiting.resolve();await work;
  assert.equal(removed,1);assert.equal(locationWatcher.current,null);assert.equal(firstPoint.current,null);
});

test('actual restoration distinguishes running native collector from interrupted marker and keeps paused recovery data',async()=>{
  for(const running of [true,false]) {
    const f=await sqliteFixture();try {
      const id=await f.dao.startTrip('owner');let active={tripId:id,segmentId:'s',userId:'owner'},effects=[],removed=0;
      f.setActive(active);const session={user:{_id:'owner'},token:'token'};
      const screen=fixture('app/(tabs)/record/index.js','RecordScreen',{}, {...native,theme,StyleSheet:{create:x=>x,absoluteFillObject:{}},useEffect:fn=>effects.push(fn),useAuthStore:Object.assign(select=>select(session),{getState:()=>session}),runMigrations:f.migrate,getPendingTrips:f.dao.getPendingTrips,getLocalTrip:f.dao.getLocalTrip,setTripRecordingStatus:f.dao.setTripRecordingStatus,getActiveTrip:async()=>active,clearActiveTrip:async()=>{active={};f.setActive({});},Location:{Accuracy:{High:1},hasStartedLocationUpdatesAsync:async()=>running,watchPositionAsync:async()=>({remove:()=>removed++})},TASK_NAME:'task',toast(){},CircleButton:'CircleButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal'});
      screen.render();const cleanup=effects[0]();await new Promise(setImmediate);const tree=screen.render();
      assert.ok(nodes(tree,'Text').some(n=>n.children.join('')===`Status: ${running?'RECORDING':'PAUSED'}`));
      assert.equal((await f.dao.getLocalTrip(id,'owner')).status,running?'recording':'paused');
      assert.equal(Boolean(active.tripId),running);cleanup();assert.equal(removed,running?1:0);
    } finally {f.close();}
  }
});

test('legacy uploaded/stopped collector cleanup preserves history and reports native stop failure truthfully',async()=>{
  for(const fail of [false,true]) {
    const f=await sqliteFixture();try {
      const id=await f.dao.startTrip('owner');await f.dao.insertTrackPoint(id,'s',{lat:1,lon:2,timestamp:end,speed:0,accuracy:1});await f.dao.stopTrip(id,end,'owner');await f.dao.finishTrip(id,metadata,'owner');await f.dao.markTripUploaded(id,'owner');
      const before=JSON.stringify(await f.db.getAllAsync('SELECT * FROM trips'));const points=JSON.stringify(await f.db.getAllAsync('SELECT * FROM track_points'));
      let active={tripId:id,segmentId:'s',userId:'owner'},effects=[],stops=0,notices=[];f.setActive(active);const session={user:{_id:'owner'},token:'token'};
      const screen=fixture('app/(tabs)/record/index.js','RecordScreen',{}, {...native,theme,StyleSheet:{create:x=>x,absoluteFillObject:{}},useEffect:fn=>effects.push(fn),useAuthStore:Object.assign(select=>select(session),{getState:()=>session}),runMigrations:f.migrate,getPendingTrips:f.dao.getPendingTrips,getLocalTrip:f.dao.getLocalTrip,getActiveTrip:async()=>active,clearActiveTrip:async()=>{active={};f.setActive({});},stopAbandonedRecording,Location:{hasStartedLocationUpdatesAsync:async()=>true,stopLocationUpdatesAsync:async()=>{stops++;if(fail)throw Error('synthetic native stop failure');}},TASK_NAME:'task',toast:n=>notices.push(n),CircleButton:'CircleButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal'});
      screen.render();effects[0]();await new Promise(setImmediate);assert.equal(stops,1);assert.equal(notices.at(-1).title,fail?'Recording recovery needs attention':'Stale recording stopped');
      assert.equal(JSON.stringify(await f.db.getAllAsync('SELECT * FROM trips')),before);assert.equal(JSON.stringify(await f.db.getAllAsync('SELECT * FROM track_points')),points);
    } finally {f.close();}
  }
});
