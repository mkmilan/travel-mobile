const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {sqliteFixture}=require('./helpers/sqlite-fixture.cjs');
const {read,load,fixture,nodes,theme,native}=require('./helpers/component-fixture.cjs');
const noteTools=load('src/utils/poiNote.js','({POI_NOTE_MAX_LENGTH,validatePoiNote})');
const metadata={endTime:'2026-01-01T01:00:00.000Z',title:'Synthetic repair',description:'Keep my route',startName:'A',endName:'B',defaultTransportMode:'walking',defaultTripVisibility:'private'};
async function recording() {
 const f=await sqliteFixture();const id=await f.dao.startTrip('owner',{defaultTripVisibility:'private'});
 await f.dao.insertTrackPoint(id,'segment',{lat:1,lon:2,timestamp:metadata.endTime,speed:0,accuracy:4});
 await f.dao.stopTrip(id,metadata.endTime,'owner');await f.dao.finishTrip(id,metadata,'owner');return {...f,id};
}
function handler(start,end,name,dependencies) {
 const source=read('app/(tabs)/record/index.js');return vm.runInNewContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)))+';'+name,dependencies);
}
test('actual SQLite validates POI 500/501 before insert and keeps oversized legacy rows until explicit owner edit',async()=>{
 const f=await recording();try {
  const note='x'.repeat(500);await f.dao.addPoi(f.id,{lat:1,lon:2,note});await assert.rejects(f.dao.addPoi(f.id,{lat:1,lon:2,note:note+'x'}),/500/);
  assert.equal((await f.db.getAllAsync('SELECT * FROM pois')).length,1);
  const inserted=await f.db.runAsync('INSERT INTO pois(trip_id,lat,lon,timestamp,note) VALUES(?,?,?,?,?)',[f.id,3,4,metadata.endTime,note+'x']);const poiId=inserted.lastInsertRowid;
  const original=await f.dao.getPoiForEdit(f.id,poiId,'owner');const track=JSON.stringify(await f.db.getAllAsync('SELECT * FROM track_points'));
  await assert.rejects(f.dao.buildTripJsonForUpload(f.id,{},'owner'),e=>e.code==='POI_NOTE_NEEDS_EDIT'&&e.poiId===poiId);
  await assert.rejects(f.dao.updatePoiNote(f.id,poiId,'short','other'),/not found/);await assert.rejects(f.dao.updatePoiNote(f.id,poiId,note+'x','owner'),/500/);
  assert.equal(JSON.stringify(await f.dao.getPoiForEdit(f.id,poiId,'owner')),JSON.stringify(original));
  await f.dao.updatePoiNote(f.id,poiId,'Explicitly edited','owner');const edited=await f.dao.getPoiForEdit(f.id,poiId,'owner');
  assert.deepEqual({...edited,note:original.note},{...original});assert.equal(edited.note,'Explicitly edited');
  assert.equal(JSON.stringify(await f.db.getAllAsync('SELECT * FROM track_points')),track);
  const payload=await f.dao.buildTripJsonForUpload(f.id,{},'owner');assert.equal(payload.pois.length,2);assert.equal(payload.pois.find(p=>p.lat===1).note.length,500);assert.equal(payload.pois.find(p=>p.lat===3).note,'Explicitly edited');assert.equal(payload.defaultTripVisibility,'private');
 } finally {f.close();}
});

test('upload opens exact legacy note for repair without API calls; cancel preserves all data and retry uploads unchanged route once repaired',async()=>{
 const f=await recording();try {
  const long='Legacy exact note '+ 'x'.repeat(501);await f.db.runAsync('INSERT INTO pois(trip_id,lat,lon,timestamp,note) VALUES(?,?,?,?,?)',[f.id,3,4,metadata.endTime,long]);
  const session={user:{_id:'owner'},token:'token'},pendingPoiRepair={current:null};let requests=0,marks=0;const notices=[];
  const repair=handler('const handlePoiRepairSubmit = ','\n\t// Handle recommendation submission','handlePoiRepairSubmit',{pendingPoiRepair,useAuthStore:{getState:()=>session},getPoiForEdit:f.dao.getPoiForEdit,updatePoiNote:f.dao.updatePoiNote,toast:n=>notices.push(n)});
  const form=fixture('src/components/modals/AddPoiModal.js','AddPoiModal',{onSubmit:repair},{...native,theme,...noteTools,RecordingFormModal:'RecordingFormModal'});form.render();
  const upload=handler('const handleUpload = ','\n\tconst resetState','handleUpload',{tripId:f.id,status:'stopped',isRestoring:false,lifecycleRequest:{current:false},uploadRequest:{current:false},useAuthStore:{getState:()=>session},user:session.user,setIsUploading(){},setUploadingTripId(){},toast:n=>notices.push(n),buildTripJsonForUpload:f.dao.buildTripJsonForUpload,getPoiForEdit:f.dao.getPoiForEdit,pendingPoiRepair,poiRepairModalRef:form.ref,uploadTripJson:async()=>requests++,markTripUploaded:async()=>marks++,refreshPending:async()=>{},resetState(){}});
  await upload();assert.equal(requests,0);assert.equal(marks,0);let tree=form.render();assert.equal(tree.props.visible,true);assert.equal(nodes(tree,'TextInput')[0].props.value,long);
  tree.props.onClose();assert.equal((await f.dao.getPoiForEdit(f.id,pendingPoiRepair.current.poiId,'owner')).note,long);
  await upload();tree=form.render();assert.equal(nodes(tree,'TextInput')[0].props.value,long);nodes(tree,'TextInput')[0].props.onChangeText('User shortened');tree=form.render();await nodes(tree,'Pressable').find(n=>n.props.testID==='poi-save').props.onPress();
  assert.equal(form.render().props.visible,false);assert.equal(requests,0);await upload();assert.equal(requests,1);assert.equal(marks,1);
 } finally {f.close();}
});

test('repair rejects stale owner/token before read or write, including session switch while reading',async()=>{
 let reads=0,writes=0,resolve;const session={user:{_id:'owner'},token:'token'},pendingPoiRepair={current:{tripId:'trip',poiId:1,userId:'owner',token:'token'}};
 const repair=handler('const handlePoiRepairSubmit = ','\n\t// Handle recommendation submission','handlePoiRepairSubmit',{pendingPoiRepair,useAuthStore:{getState:()=>session},getPoiForEdit:async()=>{reads++;await new Promise(r=>resolve=r);},updatePoiNote:async()=>writes++,toast(){}});
 session.token='new';await assert.rejects(repair({note:'short'}),/Account changed/);assert.equal(reads,0);session.token='token';const work=repair({note:'short'});session.user={_id:'other'};resolve();await assert.rejects(work,/Account changed/);assert.equal(writes,0);
});
