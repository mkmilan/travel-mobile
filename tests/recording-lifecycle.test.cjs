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
