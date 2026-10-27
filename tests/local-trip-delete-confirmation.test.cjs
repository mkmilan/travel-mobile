const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture, load, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const {hooksFixture, authFixture} = require('./helpers/hooks-fixture.cjs');
const {sqliteFixture} = require('./helpers/sqlite-fixture.cjs');
const {recordingFixture} = require('./helpers/recording-fixture.cjs');
const file = 'app/(tabs)/record/index.js';
const tick = () => new Promise(setImmediate);
const deferred = () => {let resolve, reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const metadata = {endTime:'2026-10-27T08:00:00Z',title:'Saved walk',description:'Synthetic fixture',startName:'A',endName:'B',defaultTransportMode:'walking',defaultTripVisibility:'private'};

// Production RecordScreen + PendingRow + SQLite migrations/DAO. React scheduling,
// native Alert/GPS and network are fixtures; no user database or server is used.
async function harness(overrides={}) {
  const db=await sqliteFixture(), host=hooksFixture(), auth=authFixture();
  auth.set({user:{_id:'owner',settings:{}},token:'owner-token'});
  let active={},running=false,beforeDelete=async()=>{},states=[];
  const alerts=[],notices=[],deletions=[];
  const markers=recordingFixture(()=>active,value=>{active=value;db.setActive(value);});
  const seeded=[];
  for(const title of ['First saved trip','Second saved trip']) {
    const id=await db.dao.startTrip('owner');seeded.push(id);
    await db.dao.insertTrackPoint(id,'segment',{lat:1,lon:2,timestamp:metadata.endTime,speed:1,accuracy:2});
    await db.dao.addPoi(id,{lat:1,lon:2,note:'Saved POI'});
    await db.db.runAsync('INSERT INTO recommendations(trip_id,name,description) VALUES(?,?,?)',[id,'Saved recommendation','Local data']);
    await db.dao.stopTrip(id,metadata.endTime,'owner');
    await db.dao.finishTrip(id,{...metadata,title},'owner');
  }
  const extraDao=load('src/db/tripDao.js','({getTripEndpoints,rememberTripLocationNames})',{openDatabase:async()=>db.db,getActiveTrip:markers.getActiveTrip});
  const screen=fixture(file,'RecordScreen',{}, {
    ...native,...host.hooks,theme,StyleSheet:{create:x=>x,absoluteFillObject:{}},Ionicons:'Ionicons',useAuthStore:auth.store,
    ...markers,...db.dao,...extraDao,runMigrations:db.migrate,
    useState:initial=>{const result=host.hooks.useState(initial);states.push(result[1]);return result;},
    deleteTrip:async(...args)=>{deletions.push(args);await beforeDelete();return db.dao.deleteTrip(...args);},
    ensureRecordingPermissions:async()=>true,startSegment:()=> 'segment',getTripLocationNames:async()=>({}),
    Location:{Accuracy:{High:1},hasStartedLocationUpdatesAsync:async()=>running,
      startLocationUpdatesAsync:async()=>{running=true;},stopLocationUpdatesAsync:async()=>{running=false;},watchPositionAsync:async()=>({remove(){}})},
    TASK_NAME:'synthetic-task',Alert:{alert:(...args)=>alerts.push(args)},toast:notice=>notices.push(notice),
    RecordingButton:'RecordingButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal',
    console:{...console,error(){}},...overrides,
  });
  const tree=()=>{states=[];return host.render(()=>screen.render());};
  tree();await tick();tree();
  const row=id=>{const list=nodes(tree(),'FlatList')[0],item=list.props.data.find(item=>item.id===id);assert.ok(item,'saved row is visible');return list.props.renderItem({item});};
  const pressDelete=id=>{const component=row(id),button=nodes(component.type(component.props),'TouchableOpacity').find(node=>node.props.accessibilityLabel==='Delete local trip');assert.equal(button.props.disabled,false);return button.props.onPress();};
  const confirm=()=>alerts.at(-1)[2].find(button=>button.text==='Delete').onPress;
  const status=()=>nodes(tree(),'Text').map(node=>node.children.join('')).find(text=>text.startsWith('Status:'));
  const press=icon=>nodes(tree(),'RecordingButton').find(node=>node.props.icon===icon).props.onPress();
  return {db,auth,alerts,notices,deletions,seeded,tree,row,pressDelete,confirm,status,press,
    holdDelete:fn=>{beforeDelete=fn;},
    changeState(index,value){states[index](value);tree();},
    blur:()=>host.blur(),focus:()=>host.focus(),unmount:()=>host.unmount(),
    snapshot:async()=>JSON.stringify(await Promise.all(['trips','track_points','pois','recommendations'].map(table=>db.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`)))),
    close(){host.unmount();db.close();},
  };
}

for(const dismiss of ['Cancel','dismiss']) test(`${dismiss} keeps all local trip data and cannot reuse the dismissed confirmation`,async()=>{
  const h=await harness();try {
    const before=await h.snapshot();h.pressDelete(h.seeded[0]);
    const alert=h.alerts.at(-1),oldConfirm=h.confirm();
    assert.equal(alert[0],'Delete local trip?');assert.match(alert[1],/First saved trip/);
    assert.match(alert[1],/not been uploaded.*lost permanently/);assert.match(alert[1],/cannot be undone/);
    assert.deepEqual(Array.from(alert[2],button=>[button.text,button.style]),[['Cancel','cancel'],['Delete','destructive']]);
    assert.equal(alert[3].cancelable,true);assert.equal(h.deletions.length,0);assert.equal(await h.snapshot(),before);
    if(dismiss==='Cancel')alert[2][0].onPress();else alert[3].onDismiss();
    await oldConfirm();assert.equal(h.deletions.length,0);assert.equal(await h.snapshot(),before);
    h.pressDelete(h.seeded[1]);assert.equal(h.alerts.length,2);alert[3].onDismiss();await oldConfirm();
    await h.confirm()();assert.deepEqual(h.deletions,[[h.seeded[1],'owner']]);
    assert.equal((await h.db.dao.getLocalTrip(h.seeded[0],'owner')).title,'First saved trip');
  }finally{h.close();}
});

test('repeated row taps show one dialog; explicit Delete runs once and removes only its original trip',async()=>{
  const h=await harness();try {
    const first=h.seeded[0],second=h.seeded[1],wait=deferred();
    h.holdDelete(()=>wait.promise);h.pressDelete(first);const confirm=h.confirm();
    h.pressDelete(first);h.pressDelete(second);assert.equal(h.alerts.length,1);assert.equal(h.deletions.length,0);
    const deleting=confirm();await confirm();h.alerts[0][3].onDismiss();h.pressDelete(second);
    assert.equal(h.alerts.length,1);assert.deepEqual(h.deletions,[[first,'owner']]);
    wait.resolve();await deleting;await confirm();assert.equal(h.deletions.length,1);
    for(const table of ['trips','track_points','pois','recommendations']) {
      const field=table==='trips'?'id':'trip_id',rows=await h.db.db.getAllAsync(`SELECT * FROM ${table} WHERE ${field} = ?`,[first]);assert.equal(rows.length,0);
      assert.equal((await h.db.db.getAllAsync(`SELECT * FROM ${table} WHERE ${field} = ?`,[second])).length,1);
    }
    assert.deepEqual(Array.from(nodes(h.tree(),'FlatList')[0].props.data,item=>item.id),[second]);
  }finally{h.close();}
});

test('actual Start then Stop reaches selected saved trip; Cancel keeps it and confirmed Delete resets its view',async()=>{
  const h=await harness();try {
    await h.press('play');await h.press('stop');
    await h.alerts.at(-1)[2].find(button=>button.text==='Stop').onPress();
    assert.equal(h.status(),'Status: Saved locally');
    const selected=nodes(h.tree(),'FlatList')[0].props.data.find(row=>!h.seeded.includes(row.id)).id;
    h.pressDelete(selected);h.alerts.at(-1)[2][0].onPress();assert.equal(h.status(),'Status: Saved locally');
    h.pressDelete(selected);await h.confirm()();assert.equal(h.status(),'Status: Not recording');
    assert.equal(nodes(h.tree(),'FlatList')[0].props.data.length,2);
  }finally{h.close();}
});

test('blur and refocus cannot reopen deletion while an explicit Delete is still running',async()=>{
  const h=await harness();try {
    const wait=deferred();h.holdDelete(()=>wait.promise);
    h.pressDelete(h.seeded[0]);const deleting=h.confirm()();
    h.blur();h.focus();await tick();h.pressDelete(h.seeded[0]);h.pressDelete(h.seeded[1]);
    assert.equal(h.alerts.length,1);assert.equal(h.deletions.length,1);
    wait.resolve();await deleting;h.pressDelete(h.seeded[1]);assert.equal(h.alerts.length,2);
  }finally{h.close();}
});

test('New trip while a dialog is open invalidates the old selected-trip confirmation',async()=>{
  const h=await harness();try {
    // Reproduce the stopped selection after a saved recording is restored in view.
    h.changeState(0,'stopped');h.changeState(1,h.seeded[0]);
    h.pressDelete(h.seeded[0]);const confirm=h.confirm(),before=await h.snapshot();
    nodes(h.tree(),'TouchableOpacity').find(node=>nodes(node,'Text').some(text=>text.children.join('')==='New trip')).props.onPress();h.tree();
    await confirm();assert.equal(h.deletions.length,0);assert.equal(await h.snapshot(),before);assert.equal(h.status(),'Status: Not recording');
  }finally{h.close();}
});

test('changing the selected trip never retargets an open confirmation',async()=>{
  const h=await harness();try {
    h.changeState(0,'stopped');h.changeState(1,h.seeded[0]);h.pressDelete(h.seeded[0]);const confirm=h.confirm();
    h.changeState(1,h.seeded[1]);const before=await h.snapshot();await confirm();
    assert.equal(h.deletions.length,0);assert.equal(await h.snapshot(),before);assert.equal(h.status(),'Status: Saved locally');
    h.pressDelete(h.seeded[0]);await h.confirm()();assert.deepEqual(h.deletions,[[h.seeded[0],'owner']]);
    assert.equal(h.status(),'Status: Saved locally','deleting another row keeps the selected trip');
  }finally{h.close();}
});

for(const change of ['recording','paused','cleanup_required','restoring']) test(`${change} while confirmation is pending does not delete`,async()=>{
  const h=await harness();try {
    h.pressDelete(h.seeded[0]);const confirm=h.confirm(),before=await h.snapshot();
    if(change==='restoring')h.changeState(7,true);else h.changeState(0,change);
    await confirm();assert.equal(h.deletions.length,0);assert.equal(await h.snapshot(),before);
  }finally{h.close();}
});

test('upload starting while the dialog is open cancels deletion, including before a re-render',async()=>{
  const packaging=deferred(),h=await harness({buildTripJsonForUpload:()=>packaging.promise,uploadTripJson:async()=>{throw Error('synthetic offline');}});
  try {
    h.pressDelete(h.seeded[0]);const confirm=h.confirm(),upload=h.row(h.seeded[1]).props.onUpload();
    await confirm();assert.equal(h.deletions.length,0);assert.equal((await h.db.dao.getPendingTrips('owner')).length,2);
    packaging.resolve({});await upload;
    h.pressDelete(h.seeded[0]);await h.confirm()();assert.equal(h.deletions.length,1);
  }finally{h.close();}
});

test('a recording transition started behind the dialog prevents deletion before a re-render',async()=>{
  const permissions=deferred(),h=await harness({ensureRecordingPermissions:()=>permissions.promise});try {
    h.pressDelete(h.seeded[0]);const confirm=h.confirm(),starting=h.press('play');
    await confirm();assert.equal(h.deletions.length,0);permissions.resolve(false);await starting;
    assert.equal((await h.db.dao.getPendingTrips('owner')).length,2);
  }finally{h.close();}
});

for(const change of ['account','token','same-token-session','session-changing','blur','unmount']) test(`${change} invalidates a pending local delete`,async()=>{
  const h=await harness();try {
    h.pressDelete(h.seeded[0]);const confirm=h.confirm(),before=await h.snapshot(),session=h.auth.store.getState();
    if(change==='blur')h.blur();else if(change==='unmount')h.unmount();
    else h.auth.set({...session,...(change==='account'?{user:{_id:'other'}}:change==='token'?{token:'other-token'}:change==='same-token-session'?{sessionEpoch:session.sessionEpoch+1}:{isSessionChanging:true})});
    await confirm();assert.equal(h.deletions.length,0);assert.equal(await h.snapshot(),before);
  }finally{h.close();}
});

for(const status of ['recording','paused','uploaded']) test(`DAO recheck rejects a trip changed to ${status} by another frame while dialog is open`,async()=>{
  const h=await harness();try {
    h.pressDelete(h.seeded[0]);const confirm=h.confirm();
    await h.db.db.runAsync('UPDATE trips SET status = ? WHERE id = ?',[status,h.seeded[0]]);
    const before=await h.snapshot();await confirm();assert.equal(await h.snapshot(),before);
    assert.equal(h.notices.at(-1).title,'Could not delete trip');
  }finally{h.close();}
});

test('delete failure preserves saved UI and data; a retry requires fresh explicit confirmation',async()=>{
  const h=await harness();try {
    h.changeState(0,'stopped');h.changeState(1,h.seeded[0]);
    h.holdDelete(async()=>{throw Error('synthetic disk failure');});h.pressDelete(h.seeded[0]);const before=await h.snapshot(),confirm=h.confirm();
    await confirm();assert.equal(await h.snapshot(),before);assert.equal(h.status(),'Status: Saved locally');
    assert.equal(h.notices.at(-1).title,'Could not delete trip');assert.match(h.notices.at(-1).msg,/disk failure/);
    await confirm();assert.equal(h.deletions.length,1);h.holdDelete(async()=>{});
    h.pressDelete(h.seeded[0]);assert.equal(h.deletions.length,1);await h.confirm()();assert.equal(h.deletions.length,2);
  }finally{h.close();}
});
