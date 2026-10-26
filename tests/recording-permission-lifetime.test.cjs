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
  const state={active:{},running:false,calls:[],notices:[],alerts:[],watchers:[],starts:0,stops:0,rows:0};
  let beforeWrite=async()=>{}, beforeDelete=async()=>{};
  const markers=recordingFixture(()=>state.active,value=>{state.active=value;db.setActive(value);});
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
    const host=hooksFixture();
    const screen=fixture('app/(tabs)/record/index.js','RecordScreen',{}, {
      ...native,...host.hooks,theme,StyleSheet:{create:x=>x,absoluteFillObject:{}},useAuthStore,
      ...markers,...db.dao,runMigrations:db.migrate,ensureRecordingPermissions,Location,TASK_NAME:'trip-location-task',
      startTrip:async(...args)=>{state.rows++;return db.dao.startTrip(...args);},startSegment:()=>`segment-${state.rows}-${state.starts}`,
      toast:notice=>state.notices.push(notice),Alert:{alert:(...args)=>state.alerts.push(args)},
      RecordingButton:'RecordingButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal',
      ...overrides,
    });
    const tree=()=>host.render(()=>screen.render());tree();
    const button=icon=>nodes(tree(),'RecordingButton').find(node=>node.props.icon===icon);
    return {tree,button,press:icon=>button(icon).props.onPress(),unmount:()=>host.unmount(),
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

test('actual auth/helper/screen: permission result cannot revive unmounted Start after completed same-token logout/login',async()=>{
  const h=await harness();try {
    const wait=holdPermission(h),screen=h.mount();await tick();const before=await h.snapshot();
    const start=screen.press('play');await tick();await h.auth().logout();screen.unmount();await h.auth().login(account());
    assert.equal(h.auth().sessionEpoch,3);wait.resolve(granted());await start;
    assertNotStarted(h);assert.deepEqual(h.state.calls,['getForegroundPermissionsAsync']);assert.equal(await h.snapshot(),before);
  }finally{h.close();}
});

test('actual auth/helper/screen: unmount alone cancels pending permission and stale Start callback',async()=>{
  const h=await harness();try {
    const wait=holdPermission(h),screen=h.mount();await tick();const callback=screen.button('play').props.onPress;
    const start=callback();await tick();screen.unmount();wait.resolve(granted());await start;await callback();
    assertNotStarted(h);assert.deepEqual(h.state.calls,['getForegroundPermissionsAsync']);
  }finally{h.close();}
});

for (const next of [account(),account('owner','replacement-token'),account('other')]) {
  test(`actual auth/helper/screen: completed logout/login ${next._id}/${next.token} cannot adopt the old mounted permission`,async()=>{
    const h=await harness();try {
      const wait=holdPermission(h),screen=h.mount();await tick();const before=await h.snapshot();
      const callback=screen.button('play').props.onPress,start=callback();await tick();
      await h.auth().logout();await h.auth().login(next);screen.tree();await tick();
      wait.resolve(granted());await start;await callback();
      assertNotStarted(h);assert.deepEqual(h.state.calls,['getForegroundPermissionsAsync']);assert.equal(await h.snapshot(),before);
      // A fresh, intentional tap in the new mounted/login lifetime still works.
      await screen.press('play');assert.equal(h.state.rows,1);assert.equal(h.state.starts,1);assert.equal(h.state.active.userId,next._id);
      screen.unmount();
    }finally{h.close();}
  });
}

for (const next of [account(),account('other')]) {
  test(`actual auth/helper/screen: overlapping logout/login ${next._id} invalidates permission before token/user change`,async()=>{
    const h=await harness();try {
      const permission=holdPermission(h),storage=deferred(),screen=h.mount();await tick();
      const start=screen.press('play');await tick();h.holdDeletes(()=>storage.promise);
      const logout=h.auth().logout();await tick();const login=h.auth().login(next);await tick();
      assert.equal(h.auth().user._id,'owner');assert.equal(h.auth().token,'token-owner');
      assert.equal(h.auth().isSessionChanging,true);assert.equal(h.auth().sessionEpoch,3);
      permission.resolve(granted());await start;assertNotStarted(h);
      storage.resolve();await Promise.all([logout,login]);assert.equal(h.auth().user._id,next._id);screen.unmount();
    }finally{h.close();}
  });
}

test('actual auth/helper/screen: a Start callback captured before transition cannot open a new prompt during logout',async()=>{
  const h=await harness();try {
    const storage=deferred(),screen=h.mount();await tick();const callback=screen.button('play').props.onPress;
    h.holdDeletes(()=>storage.promise);const logout=h.auth().logout();await tick();await callback();
    assertNotStarted(h);assert.deepEqual(h.state.calls,[]);storage.resolve();await logout;screen.unmount();
  }finally{h.close();}
});

for (const method of ['getForegroundPermissionsAsync','requestForegroundPermissionsAsync','getBackgroundPermissionsAsync','requestBackgroundPermissionsAsync']) {
  test(`actual permission boundary ${method}: same-token relogin rejects late grant and suppresses later prompts`,async()=>{
    const h=await harness();try {
      const wait=holdPermission(h,method),screen=h.mount();
      if(method==='requestForegroundPermissionsAsync')h.Location.getForegroundPermissionsAsync=async()=>({status:'undetermined',canAskAgain:true});
      if(method==='requestBackgroundPermissionsAsync')h.Location.getBackgroundPermissionsAsync=async()=>({status:'undetermined',canAskAgain:true});
      await tick();const start=screen.press('play');await tick();
      if(method==='requestBackgroundPermissionsAsync') {h.state.alerts.at(-1)[2].find(button=>button.text==='Continue').onPress();await tick();}
      const calls=h.state.calls.length;await h.auth().logout();await h.auth().login(account());
      wait.resolve(granted());await start;assertNotStarted(h);assert.equal(h.state.calls.length,calls);screen.unmount();
    }finally{h.close();}
  });
}

test('actual native rationale callbacks cannot start permissions after unmount or same-token relogin',async()=>{
  for (const change of ['unmount','relogin']) {
    const h=await harness();try {
      h.Location.getBackgroundPermissionsAsync=async()=>({status:'undetermined',canAskAgain:true});
      const screen=h.mount();await tick();const start=screen.press('play');await tick();
      assert.equal(h.state.alerts.length,1);
      if(change==='unmount')screen.unmount();else {await h.auth().logout();await h.auth().login(account());}
      const buttons=h.state.alerts[0][2];buttons.find(button=>button.text==='Continue').onPress();await start;
      assertNotStarted(h);assert.equal(h.state.calls.includes('requestBackgroundPermissionsAsync'),false);screen.unmount();
    }finally{h.close();}
  }
});

test('permission denial, rationale cancellation and inspection failure keep Start idle with no durable/native recording',async()=>{
  for (const mode of ['foreground','background','cancel','error']) {
    const h=await harness();try {
      if(mode==='foreground')h.Location.getForegroundPermissionsAsync=async()=>({status:'denied',canAskAgain:false});
      if(mode==='background')h.Location.getBackgroundPermissionsAsync=async()=>({status:'denied',canAskAgain:false});
      if(mode==='cancel')h.Location.getBackgroundPermissionsAsync=async()=>({status:'undetermined',canAskAgain:true});
      if(mode==='error')h.Location.getForegroundPermissionsAsync=async()=>{throw Error('Permission inspection failed');};
      const screen=h.mount();await tick();const before=await h.snapshot(),start=screen.press('play');await tick();
      if(mode==='cancel')h.state.alerts.at(-1)[2].find(button=>button.text==='Cancel').onPress();await start;
      assert.equal(h.state.rows,0);assert.equal(h.state.starts,0);assert.deepEqual(h.state.active,{});assert.equal(await h.snapshot(),before);
      assert.equal(screen.status(),'Status: Not recording');assert.equal(h.state.notices.length,mode==='cancel'?0:1);screen.unmount();
    }finally{h.close();}
  }
});

test('stale permission rejection has no warning or later recording side effects',async()=>{
  const h=await harness();try {
    const wait=holdPermission(h),screen=h.mount();await tick();const start=screen.press('play');await tick();
    screen.unmount();wait.reject(Error('Late native failure'));await start;assertNotStarted(h);
  }finally{h.close();}
});

test('normal Start deduplicates pending permissions and Pause/Resume preserves exact recorded points and defaults',async()=>{
  const h=await harness();try {
    const wait=holdPermission(h),screen=h.mount();await tick();const start=screen.press('play');await screen.press('play');
    assert.equal(h.state.calls.length,1);wait.resolve(granted());await start;
    const id=h.state.active.tripId;assert.equal(h.state.rows,1);assert.equal(h.state.starts,1);assert.equal(screen.status(),'Status: Recording');
    assert.equal((await h.db.dao.getLocalTrip(id,'owner')).default_trip_visibility,'private');
    const point={lat:0,lon:12.5,timestamp:'2026-01-02T03:04:05.000Z',speed:2,accuracy:3};
    await h.db.dao.insertTrackPoint(id,h.state.active.segmentId,point);
    const points=JSON.stringify(await h.db.db.getAllAsync('SELECT * FROM track_points'));
    await screen.press('pause');assert.equal(screen.status(),'Status: Paused');assert.equal(h.state.running,false);assert.deepEqual(h.state.active,{});
    await screen.press('play');assert.equal(screen.status(),'Status: Recording');assert.equal(h.state.starts,2);assert.equal(h.state.rows,1);
    assert.equal(h.state.active.tripId,id);assert.equal(JSON.stringify(await h.db.db.getAllAsync('SELECT * FROM track_points')),points);screen.unmount();
  }finally{h.close();}
});

test('pending Resume uses its original mounted/login operation, not a newly authenticated same-owner session',async()=>{
  for (const change of ['unmount','relogin']) {
    const h=await harness();try {
      const screen=h.mount();await tick();await screen.press('play');await screen.press('pause');
      const before=await h.snapshot(),wait=holdPermission(h);h.state.notices.length=0;
      const resume=screen.press('play');await tick();
      if(change==='unmount')screen.unmount();else {await h.auth().logout();await h.auth().login(account());}
      wait.resolve(granted());await resume;
      assert.equal(h.state.starts,1);assert.equal(h.state.rows,1);assert.deepEqual(h.state.active,{});assert.equal(h.state.notices.length,0);
      assert.equal(await h.snapshot(),before);screen.unmount();
    }finally{h.close();}
  }
});

test('unmount during native Start cleans only its abandoned collector and retains the owner row',async()=>{
  const h=await harness();try {
    const wait=deferred();h.Location.startLocationUpdatesAsync=async()=>{h.state.starts++;await wait.promise;h.state.running=true;};
    const screen=h.mount();await tick();const start=screen.press('play');await tick();
    assert.equal(h.state.starts,1);const before=await h.snapshot();screen.unmount();wait.resolve();await start;
    assert.equal(h.state.stops,1);assert.equal(h.state.running,false);assert.deepEqual(h.state.active,{});assert.equal(h.state.notices.length,0);
    assert.equal(h.state.watchers[0].removed,1);assert.equal(await h.snapshot(),before);
  }finally{h.close();}
});

test('late native Start after same-token relogin settles before a new Record can start another collector',async()=>{
  const h=await harness();try {
    const wait=deferred(),nativeStart=h.Location.startLocationUpdatesAsync;
    h.Location.startLocationUpdatesAsync=async()=>{h.state.starts++;await wait.promise;h.state.running=true;};
    const old=h.mount();await tick();const start=old.press('play');await tick();
    await h.auth().logout();old.unmount();await h.auth().login(account());
    h.Location.startLocationUpdatesAsync=nativeStart;const current=h.mount();await tick();
    assert.equal(current.button('play'),undefined,'new Record waits for the old native transition, not just its cleared marker');
    assert.equal(h.state.starts,1);wait.resolve();await start;await tick();
    assert.equal(h.state.running,false);assert.deepEqual(h.state.active,{});
    await current.press('play');const marker=JSON.stringify(h.state.active),before=await h.snapshot();
    assert.equal(current.status(),'Status: Recording');assert.equal(h.state.running,true);assert.equal(h.state.starts,2);
    await tick();assert.equal(JSON.stringify(h.state.active),marker);assert.equal(await h.snapshot(),before);current.unmount();
  }finally{h.close();}
});

test('unmount during foreground watcher startup removes the late watcher without launching native background recording',async()=>{
  const h=await harness();try {
    const wait=deferred(),watcher={removed:0,remove(){this.removed++;}};h.Location.watchPositionAsync=()=>wait.promise;
    const screen=h.mount();await tick();const start=screen.press('play');await tick();screen.unmount();wait.resolve(watcher);await start;
    assert.equal(watcher.removed,1);assert.equal(h.state.starts,0);assert.equal(h.state.rows,1);assert.deepEqual(h.state.active,{});assert.equal(h.state.notices.length,0);
  }finally{h.close();}
});

test('late permission grant leaves a newer same-owner collector and every durable row untouched',async()=>{
  const h=await harness();try {
    const permission=holdPermission(h),old=h.mount();await tick();const start=old.press('play');await tick();
    await h.auth().logout();old.unmount();await h.auth().login(account());
    h.Location.getForegroundPermissionsAsync=async()=>granted();const current=h.mount();await tick();await current.press('play');
    const marker=JSON.stringify(h.state.active),before=await h.snapshot(),notices=h.state.notices.length,stops=h.state.stops;
    permission.resolve(granted());await start;
    assert.equal(h.state.rows,1);assert.equal(h.state.starts,1);assert.equal(h.state.stops,stops);assert.equal(h.state.notices.length,notices);
    assert.equal(JSON.stringify(h.state.active),marker);assert.equal(await h.snapshot(),before);assert.equal(current.status(),'Status: Recording');current.unmount();
  }finally{h.close();}
});
