const test=require('node:test'),assert=require('node:assert/strict');
const {sqliteFixture}=require('./helpers/sqlite-fixture.cjs');
const metadata={endTime:'2026-01-01T00:01:00Z',title:'Synthetic',description:'Synthetic',startName:'A',endName:'B',defaultTransportMode:'walking',defaultTripVisibility:'private'};
async function ready(){const f=await sqliteFixture();const id=await f.dao.startTrip('owner');await f.dao.insertTrackPoint(id,'segment',{lat:1,lon:1,timestamp:'2026-01-01T00:00:00Z',speed:0,accuracy:3});await f.dao.insertTrackPoint(id,'segment',{lat:1,lon:1.01,timestamp:metadata.endTime,speed:0,accuracy:3});await f.dao.stopTrip(id,metadata.endTime,'owner');await f.dao.finishTrip(id,metadata,'owner');await f.db.runAsync('INSERT INTO recommendations(trip_id,lat,lon,primaryCategory,name,description) VALUES(?,?,?,?,?,?)',[id,1,1,'OTHER','Fixture','Synthetic']);return{f,id};}
const receipt=p=>({uploadProtocol:1,uploadId:p.uploadId,uploadComplete:true,trip:{_id:'a'.repeat(24)},recommendationsOutcome:p.recommendations.map(r=>({uploadId:r.uploadId,id:'b'.repeat(24),status:'created'}))});
test('SQLite upload snapshot survives reload/migration and keeps identical trip/child identities',async()=>{const{f,id}=await ready();try{const before=await f.dao.buildTripJsonForUpload(id,{},'owner');const payload=await f.dao.buildTripJsonForUpload(id,{},'owner',true);assert.equal(payload.uploadId,id);assert.equal(payload.recommendations[0].uploadId,'1');assert.equal(JSON.stringify(payload.segments),JSON.stringify(before.segments));await f.migrate();assert.equal(JSON.stringify(await f.dao.buildTripJsonForUpload(id,{},'owner',true)),JSON.stringify(payload));await assert.rejects(f.dao.finishTrip(id,metadata,'owner'),/Upload already started/);await assert.rejects(f.dao.buildTripJsonForUpload(id,{},'other',true),/not found/);}finally{f.close();}});
test('partial receipt persists server link but keeps trip pending; complete retry marks uploaded',async()=>{const{f,id}=await ready();try{const p=await f.dao.buildTripJsonForUpload(id,{},'owner',true);const partial=receipt(p);partial.uploadComplete=false;partial.recommendationsOutcome[0]={uploadId:'1',status:'failed',error:'Synthetic'};await assert.rejects(f.dao.markTripUploaded(id,'owner',partial,p),{code:'TRIP_UPLOAD_INCOMPLETE'});let row=await f.dao.getLocalTrip(id,'owner');assert.equal(row.status,'stopped');assert.equal(row.upload_server_id,'a'.repeat(24));assert.equal((await f.dao.getPendingTrips('owner')).length,1);await f.dao.markTripUploaded(id,'owner',receipt(p),p);assert.equal((await f.dao.getLocalTrip(id,'owner')).status,'uploaded');assert.equal((await f.dao.getPendingTrips('owner')).length,0);}finally{f.close();}});
test('malformed, wrong identity and missing receipt cannot silently mark upload complete',async()=>{const{f,id}=await ready();try{const p=await f.dao.buildTripJsonForUpload(id,{},'owner',true);for(const result of [{}, {...receipt(p),uploadId:'wrong'},{...receipt(p),recommendationsOutcome:[]}])await assert.rejects(f.dao.markTripUploaded(id,'owner',result,p),/not confirmed/);await assert.rejects(f.dao.markTripUploaded(id,'owner'),/receipt/);assert.equal((await f.dao.getLocalTrip(id,'owner')).status,'stopped');}finally{f.close();}});
test('file-backed SQLite snapshot survives closing and reopening the database',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'upload-snapshot-'));const filename=path.join(dir,'fixture.sqlite');let f=await sqliteFixture(filename);
 try{const id=await f.dao.startTrip('owner');for(const lon of [1,1.01]) await f.dao.insertTrackPoint(id,'segment',{lat:1,lon,timestamp:metadata.endTime,speed:0,accuracy:3});await f.dao.stopTrip(id,metadata.endTime,'owner');await f.dao.finishTrip(id,metadata,'owner');const p=await f.dao.buildTripJsonForUpload(id,{},'owner',true);f.close();f=await sqliteFixture(filename);assert.equal(JSON.stringify(await f.dao.buildTripJsonForUpload(id,{},'owner',true)),JSON.stringify(p));}finally{f.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed local completion write keeps a retryable recording and durable receipt',async()=>{
 const{f,id}=await ready();try{const p=await f.dao.buildTripJsonForUpload(id,{},'owner',true);const original=f.db.runAsync;f.db.runAsync=async(sql,args)=>{if(sql.includes("SET status = 'uploaded'"))throw Error('Synthetic disk failure');return original(sql,args)};await assert.rejects(f.dao.markTripUploaded(id,'owner',receipt(p),p),/disk failure/);assert.equal((await f.dao.getLocalTrip(id,'owner')).status,'stopped');f.db.runAsync=original;await f.dao.markTripUploaded(id,'owner',receipt(p),p);assert.equal((await f.dao.getLocalTrip(id,'owner')).status,'uploaded');}finally{f.close();}
});
test('only matching definite pre-insert rejection unlocks draft; partial receipt never does',async()=>{
 const{f,id}=await ready();try{const p=await f.dao.buildTripJsonForUpload(id,{},'owner',true);assert.equal(await f.dao.releaseRejectedTripUpload(id,'owner',p,{uploadRejected:true,uploadId:'wrong'}),false);assert.ok((await f.dao.getLocalTrip(id,'owner')).upload_payload);assert.equal(await f.dao.releaseRejectedTripUpload(id,'owner',p,{uploadRejected:true,uploadId:p.uploadId}),true);await f.dao.finishTrip(id,{...metadata,title:'Corrected'},'owner');const next=await f.dao.buildTripJsonForUpload(id,{},'owner',true);const partial=receipt(next);partial.uploadComplete=false;partial.recommendationsOutcome[0]={uploadId:'1',status:'failed'};await assert.rejects(f.dao.markTripUploaded(id,'owner',partial,next));assert.equal(await f.dao.releaseRejectedTripUpload(id,'owner',next,{uploadRejected:true,uploadId:next.uploadId}),false);}finally{f.close();}
});
test('API reliable upload uses only explicit endpoint and explains old-server rejection without fallback',async()=>{
 const calls=[];
 // Invoke production function body with a controlled API transport, not a network.
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const source=fs.readFileSync(path.join(__dirname,'../src/services/api.js'),'utf8');const start=source.indexOf('export const uploadTripJson = '),end=source.indexOf('\n// ───────────────── getMyTrips',start);const fn=vm.runInNewContext(source.slice(start,end).replace('export ','')+';uploadTripJson',{apiFetch:async(route)=>{calls.push(route);throw Object.assign(Error('Not found'),{status:404})}});
 await assert.rejects(fn({uploadProtocol:1},true,'owner'),/server update/);assert.deepEqual(calls,['/v2/trips/recording-upload']);
});

for(const count of [0,1]) test(`${count}-point recording cannot freeze a doomed upload and preserves every local row`,async()=>{
 const f=await sqliteFixture();try {
  const id=await f.dao.startTrip('owner');
  if(count)await f.dao.insertTrackPoint(id,'segment',{lat:1,lon:1,timestamp:metadata.endTime,speed:0,accuracy:3});
  await f.dao.stopTrip(id,metadata.endTime,'owner');await f.dao.finishTrip(id,metadata,'owner');
  await f.db.runAsync('INSERT INTO recommendations(trip_id,lat,lon,primaryCategory,name) VALUES(?,?,?,?,?)',[id,1,1,'OTHER','Keep this place']);
  const rows=async()=>JSON.stringify(await Promise.all(['trips','track_points','recommendations'].map(t=>f.db.getAllAsync(`SELECT * FROM ${t}`))));
  const before=await rows();
  await assert.rejects(f.dao.buildTripJsonForUpload(id,{},'owner',true),{code:'TRIP_ROUTE_TOO_SHORT'});
  assert.equal(await rows(),before);
  await f.dao.finishTrip(id,{...metadata,title:'Still editable'},'owner');
  assert.equal((await f.dao.getLocalTrip(id,'owner')).title,'Still editable');
 }finally{f.close();}
});

test('legacy frozen short-route upload remains byte-identical until definitive server rejection',async()=>{
 const{f,id}=await ready();try {
  const p=await f.dao.buildTripJsonForUpload(id,{},'owner',true);p.segments[0].track=p.segments[0].track.slice(0,1);
  const serialized=JSON.stringify(p);await f.db.runAsync('UPDATE trips SET upload_payload=? WHERE id=?',[serialized,id]);
  assert.equal(JSON.stringify(await f.dao.buildTripJsonForUpload(id,{},'owner',true)),serialized);
  assert.equal((await f.dao.getLocalTrip(id,'owner')).upload_payload,serialized);
 }finally{f.close();}
});
