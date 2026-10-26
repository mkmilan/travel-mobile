const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {read, load} = require('./helpers/component-fixture.cjs');
const {sqliteFixture} = require('./helpers/sqlite-fixture.cjs');
const owner = 'synthetic-owner';
const labels = {startName:'Synthetic start',endName:'Synthetic finish'};
const details = {title:'My manual title',mode:'walking',visibility:'private',description:'My draft'};
const source = read('app/(tabs)/record/index.js');
const extract = (first,last) => source.slice(source.indexOf(first),source.indexOf(last,source.indexOf(first)));
function nameDao(f, overrides = {}) {
  return load('src/db/tripDao.js','({rememberTripLocationNames,getTripEndpoints})',{
    openDatabase:async()=>f.db,getActiveTrip:async()=>({}),...overrides,
  });
}
function screen(f,id,overrides={}) {
  let confirm;
  const opened=[], notices=[], events=[];
  const session={user:{_id:owner},token:'synthetic',sessionEpoch:1};
  const ctx={...f.dao,...nameDao(f),console,Date,tripId:id,
    displayedRecording:{current:{tripId:id}},pendingRecommendation:{current:null},recordingLifetime:{current:{}},segmentId:'segment',token:session.token,sessionEpoch:session.sessionEpoch,
    showOwnedCleanupError:async()=>{},acquireRecordingTransition:async()=>()=>{},readControlledRecording:async()=>({}),getActiveTrip:async()=>({}),
    stopAbandonedRecording:async()=>{events.push('collector-stopped','marker-cleared');return 'stopped';},status:'paused',user:session.user,
    useAuthStore:{getState:()=>session},stopRequest:{current:null},lifecycleRequest:{current:false},
    uploadRequest:{current:false},isRestoring:false,metadataDraft:{current:null},tripEndTime:{current:null},
    pendingNames:{current:null},firstPoint:{current:null},lastPoint:{current:null},TASK_NAME:'synthetic',
    Alert:{alert:(_,__,buttons)=>{confirm=buttons.find(b=>b.text==='Stop').onPress;}},
    stopLocationWatcher:async()=>events.push('watcher-stopped'),
    Location:{hasStartedLocationUpdatesAsync:async()=>true,stopLocationUpdatesAsync:async()=>events.push('collector-stopped')},
    clearActiveTrip:async()=>events.push('marker-cleared'),refreshPending:async()=>{},
    getTripLocationNames:async()=>{events.push('names');return labels;},
    setStatus:value=>{ctx.status=value;},setIsResolvingLocation(){},setTripId:value=>{ctx.tripId=value;},setSegment(){},
    setIsUploading(){},setUploadingTripId(){},uploadTripJson:async()=>assert.fail('must not upload before confirmation'),
    sheetRef:{current:{open:(...args)=>opened.push(args),reopen:()=>events.push('reopen')}},
    toast:notice=>notices.push(notice),...overrides};
  const script=extract('const handleEditDetails = ','\n\t// secondary buttons')+';({handleStop,handleEditDetails,handleSaveMeta,handleUpload,resetState})';
  const handlers=vm.runInNewContext(script,ctx);
  return {ctx,session,opened,notices,events,...handlers,stop:async()=>{await handlers.handleStop();await confirm();}};
}
async function newTrip(f) {
  const id=await f.dao.startTrip(owner,{defaultTravelMode:'walking',defaultTripVisibility:'private'});
  await f.dao.insertTrackPoint(id,'synthetic-segment',{lat:1,lon:2,timestamp:'2026-01-01T00:00:00Z',speed:0,accuracy:1});
  return id;
}
async function assertUnconfirmed(f,id) {
  const row=await f.dao.getLocalTrip(id,owner);
  assert.equal(row.status,'stopped');assert.equal(row.metadata_confirmed,0);
  assert.equal(row.default_trip_visibility,'private');assert.equal(row.upload_payload,null);
  assert.equal(row.start_name,labels.startName);assert.equal(row.end_name,labels.endName);
  await assert.rejects(f.dao.buildTripJsonForUpload(id,{},owner,true),{code:'TRIP_METADATA_REQUIRED'});
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM track_points WHERE trip_id=?').get(id).n,1);
}

test('Stop -> Cancel -> New trip -> old pending Upload review -> Save retains names without confirming early',async()=>{
  const f=await sqliteFixture();try {
    const id=await newTrip(f),s=screen(f,id);await s.stop();await assertUnconfirmed(f,id);
    assert.deepEqual(s.events.slice(0,4),['watcher-stopped','collector-stopped','marker-cleared','names']);
    // Cancel leaves the modal draft alone; the actual New trip reset clears it.
    s.resetState();assert.equal(s.ctx.metadataDraft.current,null);
    await s.handleUpload(id);assert.equal(s.ctx.metadataDraft.current.startName,labels.startName);
    await s.handleSaveMeta(details);
    const row=await f.dao.getLocalTrip(id,owner);assert.equal(row.metadata_confirmed,1);
    assert.equal(row.title,details.title);assert.equal(row.description,details.description);
    assert.equal(row.start_name,labels.startName);assert.equal(row.end_name,labels.endName);
    const payload=await f.dao.buildTripJsonForUpload(id,{},owner,true);
    assert.equal(payload.startLocationName,labels.startName);assert.equal(payload.endLocationName,labels.endName);
  }finally{f.close();}
});

test('Cancel followed by cold SQLite reopen preserves names for review and Save without any new provider lookup',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trip-names-')),file=path.join(dir,'fixture.sqlite');
  let f=await sqliteFixture(file);try {
    const id=await newTrip(f);await screen(f,id).stop();f.close();f=await sqliteFixture(file);
    await assertUnconfirmed(f,id);
    const s=screen(f,null,{getTripLocationNames:async()=>assert.fail('no lookup on review')});
    await s.handleUpload(id);await s.handleSaveMeta(details);
    const row=await f.dao.getLocalTrip(id,owner);assert.equal(row.start_name,labels.startName);assert.equal(row.end_name,labels.endName);
  }finally{f.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('optional write failure still opens and saves successful names from memory',async()=>{
  const f=await sqliteFixture();try {
    const id=await newTrip(f),s=screen(f,id,{rememberTripLocationNames:async()=>{throw new Error('synthetic disk failure');}});
    await s.stop();assert.equal(s.opened.length,1);assert.equal(s.ctx.stopRequest.current,null);
    assert.equal((await f.dao.getLocalTrip(id,owner)).start_name,null);
    await s.handleSaveMeta(details);assert.equal((await f.dao.getLocalTrip(id,owner)).start_name,labels.startName);
    assert.equal(s.notices.some(n=>n.title==='Could not stop recording'),false);
  }finally{f.close();}
});

test('optional labels reject placeholders, respect ownership/active state and never replace existing or confirmed/frozen values',async()=>{
  const f=await sqliteFixture();try {
    const id=await newTrip(f),{rememberTripLocationNames:remember}=nameDao(f);
    await assert.rejects(remember(id,labels,owner));await f.dao.stopTrip(id,'2026-01-02',owner);
    await assert.rejects(remember(id,labels,'another-owner'));
    await remember(id,{startName:' Unknown ',endName:' '},owner);
    assert.equal((await f.dao.getLocalTrip(id,owner)).start_name,null);
    await f.db.runAsync('UPDATE trips SET start_name = ? WHERE id = ?',['Already known',id]);
    await remember(id,labels,owner);let row=await f.dao.getLocalTrip(id,owner);
    assert.equal(row.start_name,'Already known');assert.equal(row.end_name,labels.endName);
    await f.db.runAsync('UPDATE trips SET start_name = NULL, end_name = NULL, metadata_confirmed = 1 WHERE id = ?',[id]);
    await remember(id,labels,owner);assert.equal((await f.dao.getLocalTrip(id,owner)).start_name,null);
    await f.db.runAsync('UPDATE trips SET metadata_confirmed = 0, upload_payload = ? WHERE id = ?',['{"frozen":true}',id]);
    await remember(id,labels,owner);row=await f.dao.getLocalTrip(id,owner);
    assert.equal(row.start_name,null);assert.equal(row.upload_payload,'{"frozen":true}');
  }finally{f.close();}
});

test('atomic guards reject a manual Save or frozen snapshot racing the optional name write',async()=>{
  for(const mutation of ['metadata_confirmed = 1','upload_payload = \'{"frozen":true}\'']) {
    const f=await sqliteFixture();try {
      const id=await newTrip(f);await f.dao.stopTrip(id,'2026-01-02',owner);
      const {rememberTripLocationNames:remember}=nameDao(f,{openDatabase:async()=>({...f.db,runAsync:async(sql,args)=>{
        await f.db.runAsync(`UPDATE trips SET ${mutation} WHERE id = ?`,[id]);return f.db.runAsync(sql,args);
      }})});
      await remember(id,labels,owner);assert.equal((await f.dao.getLocalTrip(id,owner)).start_name,null);
    }finally{f.close();}
  }
});

test('session change during lookup or DAO await suppresses optional persistence and sheet',async()=>{
  const f=await sqliteFixture();try {
    const id=await newTrip(f);const s=screen(f,id,{getTripLocationNames:async()=>{s.session.sessionEpoch++;return labels;}});
    await s.stop();assert.equal(s.opened.length,0);assert.equal((await f.dao.getLocalTrip(id,owner)).start_name,null);
    let current=true;
    const {rememberTripLocationNames:remember}=nameDao(f,{getActiveTrip:async()=>{current=false;return {};}});
    await remember(id,labels,owner,()=>current);assert.equal((await f.dao.getLocalTrip(id,owner)).start_name,null);
  }finally{f.close();}
});

test('a manual draft opened during naming remains intact and is not reopened or replaced',async()=>{
  const f=await sqliteFixture();try {
    const id=await newTrip(f),manual={tripId:id,userId:owner,token:'synthetic',startName:'Manual start',endName:'Manual finish',endTime:'2026-01-02'};
    const s=screen(f,id,{getTripLocationNames:async()=>{s.ctx.metadataDraft.current=manual;return labels;}});
    await s.stop();assert.equal(s.ctx.metadataDraft.current,manual);assert.equal(s.opened.length,0);
    await s.handleSaveMeta(details);const row=await f.dao.getLocalTrip(id,owner);
    assert.equal(row.start_name,'Manual start');assert.equal(row.end_name,'Manual finish');
  }finally{f.close();}
});

test('Edit opened during lookup keeps manual text and merges later persisted labels on Save',async()=>{
  const f=await sqliteFixture();try {
    const id=await newTrip(f);
    const s=screen(f,id,{getTripLocationNames:async()=>{await s.handleEditDetails(id);return labels;}});
    await s.stop();assert.equal(s.opened.length,1);
    assert.equal(s.ctx.metadataDraft.current.startName,'Unknown');
    await s.handleSaveMeta(details);const row=await f.dao.getLocalTrip(id,owner);
    assert.equal(row.title,details.title);assert.equal(row.description,details.description);
    assert.equal(row.start_name,labels.startName);assert.equal(row.end_name,labels.endName);
  }finally{f.close();}
});

test('Save merges endpoint names atomically even if optional names settle after its trip read',async()=>{
  const f=await sqliteFixture();try {
    const id=await newTrip(f);await f.dao.stopTrip(id,'2026-01-02',owner);
    const finish=load('src/db/tripDao.js','finishTrip',{
      getActiveTrip:async()=>({}),openDatabase:async()=>({...f.db,runAsync:async(sql,args)=>{
        await nameDao(f).rememberTripLocationNames(id,labels,owner);return f.db.runAsync(sql,args);
      }}),
    });
    await finish(id,{endTime:'2026-01-02',title:details.title,description:details.description,startName:'Unknown',endName:'',defaultTransportMode:'walking',defaultTripVisibility:'private'},owner);
    const row=await f.dao.getLocalTrip(id,owner);assert.equal(row.start_name,labels.startName);assert.equal(row.end_name,labels.endName);
    assert.equal(row.metadata_confirmed,1);assert.equal(row.title,details.title);
  }finally{f.close();}
});
