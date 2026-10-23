const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, nodes, native, theme } = require('./helpers/component-fixture.cjs');
const { hooksFixture } = require('./helpers/hooks-fixture.cjs');
const preferences = require('../src/constants/presentationPreferences');
const options = load('src/constants/settingsOptions.js', '({dateFormatOptions, languageOptions, preferredUnitOptions, themePreferenceOptions, timeFormatOptions, travelModeOptions, tripVisibilityOptions})');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const tick = () => new Promise(setImmediate);
const account = id => ({_id:id, username:`User ${id}`, token:`fixture-token-${id}`, profilePictureUrl:`avatar-${id}`,
  settings:{language:'fr', themePreference:'dark', defaultTripVisibility:id==='A'?'private':'public', preferredUnits:'metric'}});
const profileReply = () => ({_id:'A', username:'Edited A', token:'fixture-token-A', profilePictureUrl:'new-avatar-A', bio:'Edited bio', city:'City', country:'Country'});
const response = data => ({status:200, ok:true, headers:{get:()=> 'application/json'}, json:async()=>data});

function authFixture() {
  let state, beforeWrite=async()=>{};
  const storage=new Map(), writes=[], listeners=new Set();
  const SecureStore={
    getItemAsync:async key=>storage.get(key),
    setItemAsync:async(key,value)=>{await beforeWrite(key,value);storage.set(key,value);writes.push(['set',key,value]);},
    deleteItemAsync:async key=>{storage.delete(key);writes.push(['delete',key]);},
  };
  const useAuthStore=load('src/stores/auth.js','useAuthStore',{
    ...preferences,SecureStore,stopActiveRecording:async()=>{},console:{error(){},warn(){}},
    require:()=>({useTripSocialStore:{getState:()=>({reset(){}})}}),
    create:initialize=>{
      state=initialize(patch=>{const previous=state;state={...state,...patch};listeners.forEach(listener=>listener(state,previous));},()=>state);
      const store=select=>select?select(state):state;
      store.getState=()=>state;store.subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
      return store;
    },
  });
  return {useAuthStore,SecureStore,storage,writes,state:()=>state,holdWrites:fn=>{beforeWrite=fn;}};
}

async function screenFixture(kind, { hydrate = true } = {}) {
  const auth=authFixture();await auth.state().login(account('A'));
  const host=hooksFixture(), replies=[], requests=[], routes=[], alerts=[], pickers=[];
  const api=load('src/services/api.js','({getUserById,updateUserById,updateUserSettings,uploadProfilePhoto})',{
    Constants:{expoConfig:{extra:{API_URL:'https://fixture.invalid/api',APP_ENV:'test'}}},Updates:{},console:{log(){},error(){},warn(){}},
    require:()=>({useAuthStore:auth.useAuthStore}),SecureStore:auth.SecureStore,getCsrfToken:async()=> 'fixture-csrf',
    createPhotoFormData:async()=>({fixture:'multipart'}),
    fetch:(url,config)=>{const pending=deferred();requests.push({url,config});replies.push(pending);return pending.promise;},
  });
  const useProfileContext=load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.useAuthStore});
  const screen=fixture(`app/(tabs)/me/${kind==='profile'?'edit-profile':'settings'}.js`,kind==='profile'?'EditProfileScreen':'SettingsScreen',{}, {
    ...native,...host.hooks,...preferences,...options,...api,useProfileContext,useAuthStore:auth.useAuthStore,useRequireAuth:()=>true,
    theme,StyleSheet:{create:x=>x},FormField:'FormField',Avatar:'Avatar',Feather:'Feather',TransportIcon:'TransportIcon',ChoiceTabs:'ChoiceTabs',
    useRouter:()=>({push:route=>routes.push(route)}),Alert:{alert:(...args)=>alerts.push(args)},
    ImagePicker:{launchImageLibraryAsync:()=>{const pending=deferred();pickers.push(pending);return pending.promise;}},
  });
  const render=()=>host.render(()=>screen.render());
  const save=()=>nodes(render(),'TouchableOpacity').at(-1).props.onPress();
  const avatar=()=>nodes(render(),'TouchableOpacity')[0].props.onPress();
  if (kind === 'profile' && hydrate) {
    render(); await tick();
    replies[0].resolve(response({...account('A'), bio:'Original bio', city:'Saved city', country:'Saved country'}));
    await tick(); render(); requests.length=0; replies.length=0;
  }
  return {...auth,render,save,avatar,requests,replies,routes,alerts,pickers,unmount:()=>host.unmount()};
}
async function interrupt(f,kind) {
  if(kind==='unmount')f.unmount();
  else {await f.state().logout();await f.state().login(account(kind==='same-login'?'A':'B'));}
}
const replyFor = kind => kind==='profile'?profileReply():{settings:{defaultTripVisibility:'followers_only'}};
const persistedUser = f => JSON.parse(f.storage.get('user-data'));

for(const kind of ['profile','settings']) {
  test(`${kind}: dispatched A response or failure cannot mutate B, relogin A, or an unmounted screen`,async()=>{
    for(const change of ['account','same-login','unmount'])for(const fail of [false,true]) {
      const f=await screenFixture(kind);const work=f.save();await tick();assert.equal(f.requests.length,1);
      await interrupt(f,change);const before=plain(f.state().user),saved=f.storage.get('user-data'),writes=f.writes.length;
      if(fail)f.replies[0].reject(Error('Old request failed'));else f.replies[0].resolve(response(replyFor(kind)));
      await work;
      assert.deepEqual(plain(f.state().user),before);assert.equal(f.storage.get('user-data'),saved);assert.equal(f.writes.length,writes);
      assert.equal(f.state().token,change==='account'?'fixture-token-B':'fixture-token-A');
      assert.deepEqual(f.routes,[]);assert.deepEqual(f.alerts,[]);
    }
  });

  test(`${kind}: old-render handlers and old drafts cannot dispatch under another login`,async()=>{
    for(const change of ['account','same-login']) {
      const f=await screenFixture(kind);const handler=nodes(f.render(),'TouchableOpacity').at(-1).props.onPress;
      await interrupt(f,change);await handler();assert.equal(f.requests.length,0);
      assert.equal(nodes(f.render(),'TouchableOpacity').length,0);
    }
  });

  test(`${kind}: duplicate saves are single-flight, normal completion persists before one navigation`,async()=>{
    const f=await screenFixture(kind);const tree=f.render();
    if(kind==='profile')nodes(tree,'FormField')[0].props.onChange('Edited A');
    else nodes(tree,'ChoiceTabs')[0].props.onChange('followers_only');
    const handler=nodes(f.render(),'TouchableOpacity').at(-1).props.onPress;
    const first=handler(),duplicate=handler();await duplicate;await tick();assert.equal(f.requests.length,1);
    assert.equal(nodes(f.render(),'TouchableOpacity').at(-1).props.disabled,true);
    f.replies[0].resolve(response(replyFor(kind)));await first;
    assert.equal(f.state().user._id,'A');assert.equal(f.state().token,'fixture-token-A');assert.equal(persistedUser(f).token,'fixture-token-A');
    assert.equal(persistedUser(f).settings.language,'fr');assert.equal(persistedUser(f).settings.themePreference,'dark');
    assert.equal(f.state().language,'en');assert.equal(f.state().theme,'light');
    if(kind==='profile')assert.equal(persistedUser(f).username,'Edited A');
    else {
      assert.equal(persistedUser(f).settings.defaultTripVisibility,'followers_only');
      const payload=JSON.parse(f.requests[0].config.body);assert.equal(payload.language,undefined);assert.equal(payload.themePreference,undefined);
    }
    assert.deepEqual(f.routes,['/(tabs)/user/A']);assert.deepEqual(f.alerts,[]);
    assert.equal(nodes(f.render(),'TouchableOpacity').at(-1).props.disabled,false);
  });

  test(`${kind}: a failed current save preserves the draft and enables explicit retry`,async()=>{
    const f=await screenFixture(kind);const work=f.save();await tick();f.replies[0].reject(Error('Fixture unavailable'));await work;
    assert.deepEqual(f.alerts,[['Error','Fixture unavailable']]);assert.deepEqual(f.routes,[]);
    assert.equal(nodes(f.render(),'TouchableOpacity').at(-1).props.disabled,false);
    const retry=f.save();await tick();assert.equal(f.requests.length,2);f.replies[1].resolve(response(replyFor(kind)));await retry;
    assert.deepEqual(f.routes,['/(tabs)/user/A']);
  });
}

test('avatar picker captures session before native await and blocks duplicate picker/save dispatch',async()=>{
  for(const change of ['account','same-login','unmount']) {
    const f=await screenFixture('profile');const work=f.avatar();await f.avatar();await f.save();assert.equal(f.pickers.length,1);
    await interrupt(f,change);const writes=f.writes.length;
    f.pickers[0].resolve({canceled:false,assets:[{uri:'file://fixture'}]});await work;
    assert.equal(f.requests.length,0);assert.equal(f.writes.length,writes);assert.deepEqual(f.alerts,[]);assert.deepEqual(f.routes,[]);
  }
});

test('dispatched avatar upload ignores late success/failure after account switch, same login or unmount',async()=>{
  for(const change of ['account','same-login','unmount'])for(const fail of [false,true]) {
    const f=await screenFixture('profile');const work=f.avatar();f.pickers[0].resolve({canceled:false,assets:[{uri:'file://fixture'}]});
    await tick();assert.equal(f.requests.length,1);await interrupt(f,change);
    const before=f.storage.get('user-data'),writes=f.writes.length;
    if(fail)f.replies[0].reject(Error('Old upload failed'));else f.replies[0].resolve(response({user:profileReply()}));
    await work;assert.equal(f.storage.get('user-data'),before);assert.equal(f.writes.length,writes);
    assert.deepEqual(f.alerts,[]);assert.deepEqual(f.routes,[]);
  }
});

test('avatar cancellation and picker failure release the lock; normal upload updates subsequent save payload',async()=>{
  const f=await screenFixture('profile');
  let work=f.avatar();f.pickers[0].resolve({canceled:true});await work;assert.equal(f.requests.length,0);
  work=f.avatar();f.pickers[1].reject(Error('Picker unavailable'));await work;assert.deepEqual(f.alerts,[['Upload failed','Picker unavailable']]);
  work=f.avatar();f.pickers[2].resolve({canceled:false,assets:[{uri:'file://fixture'}]});await tick();
  f.replies[0].resolve(response({user:profileReply()}));await work;
  assert.equal(nodes(f.render(),'Avatar')[0].props.photoId,'new-avatar-A');assert.equal(persistedUser(f).profilePictureUrl,'new-avatar-A');
  assert.deepEqual(f.routes,[]);
  const save=f.save();await tick();assert.equal(JSON.parse(f.requests[1].config.body).profilePictureUrl,'new-avatar-A');
  f.replies[1].resolve(response(profileReply()));await save;assert.deepEqual(f.routes,['/(tabs)/user/A']);
});

test('store rejects mismatched identities, stale epochs and signed-out patches while preserving current tokens and saved preferences',async()=>{
  const f=authFixture();await f.state().login(account('A'));const session=f.state().captureSession(),writes=f.writes.length;
  assert.equal(await f.state().updateUser(account('B'),session),false);assert.equal(f.writes.length,writes);
  assert.equal(await f.state().updateUser({username:'Renamed',token:'wrong-response-token',settings:{preferredUnits:'imperial'}},session),true);
  assert.equal(f.state().token,'fixture-token-A');assert.equal(persistedUser(f).token,'fixture-token-A');
  assert.equal(persistedUser(f).settings.language,'fr');assert.equal(persistedUser(f).settings.themePreference,'dark');
  assert.equal(persistedUser(f).settings.preferredUnits,'imperial');assert.equal(f.state().isSessionCurrent(session),true);
  await f.state().logout();await f.state().login(account('A'));assert.equal(await f.state().updateUser({username:'Old'},session),false);
  await f.state().logout();assert.equal(await f.state().updateUser(account('A')),false);assert.equal(f.storage.size,0);
});

test('in-flight SecureStore profile write cannot outlive logout/login persistence or navigate late',async()=>{
  for(const kind of ['profile','settings'])for(const next of ['B','A']) {
    const f=await screenFixture(kind),write=deferred();let started=false;
    f.holdWrites(async(key)=>{if(key==='user-data'&&!started){started=true;await write.promise;}});
    const work=f.save();await tick();f.replies[0].resolve(response(replyFor(kind)));await tick();assert.equal(started,true);
    const logout=f.state().logout();assert.equal(f.state().captureSession(),null);
    const login=f.state().login(account(next));write.resolve();await Promise.all([work,logout,login]);
    assert.deepEqual(plain(f.state().user),account(next));assert.deepEqual(persistedUser(f),account(next));
    assert.equal(f.storage.get('auth-token'),account(next).token);assert.deepEqual(f.routes,[]);assert.deepEqual(f.alerts,[]);
  }
});

test('queued profile completion checks unmount before writing and failed persistence does not poison later login',async()=>{
  const f=await screenFixture('profile'),write=deferred();let started=false;
  f.holdWrites(async(key)=>{if(key==='user-data'&&!started){started=true;await write.promise;}});
  const first=f.state().updateUser({bio:'Other current update'});await tick();
  const work=f.save();await tick();f.replies[0].resolve(response(profileReply()));await tick();f.unmount();
  write.resolve();await Promise.all([first,work]);assert.equal(persistedUser(f).username,'User A');assert.deepEqual(f.routes,[]);
  f.holdWrites(async()=>{throw Error('Fixture storage unavailable');});await assert.rejects(f.state().updateUser({username:'Failed'}),/storage unavailable/);
  f.holdWrites(async()=>{});await f.state().login(account('B'));assert.deepEqual(persistedUser(f),account('B'));
});


test('profile hydration loads authoritative location before allowing an unchanged save', async()=>{
  const f=await screenFixture('profile',{hydrate:false});
  const initial=f.render(); const oldSave=nodes(initial,'TouchableOpacity').at(-1).props.onPress;
  assert.equal(nodes(initial,'TouchableOpacity').at(-1).props.disabled,true);
  await oldSave(); await f.avatar(); await tick();
  assert.equal(f.requests.length,1); assert.equal(f.requests[0].config.method,'GET');
  assert.equal(f.pickers.length,0);
  f.replies[0].resolve(response(profileReply())); await tick();
  const loaded=f.render();
  assert.equal(nodes(loaded,'FormField').find(n=>n.props.label==='City').props.value,'City');
  assert.equal(nodes(loaded,'FormField').find(n=>n.props.label==='Country').props.value,'Country');
  await oldSave(); assert.equal(f.requests.length,1,'old blank-render handler stays blocked');
  const save=f.save(); await tick();
  const payload=JSON.parse(f.requests[1].config.body);
  assert.equal(payload.city,'City'); assert.equal(payload.country,'Country');
  f.replies[1].resolve(response(profileReply())); await save;
});

test('profile hydration failure blocks save and retry preserves text already typed, including intentional clear', async()=>{
  const f=await screenFixture('profile',{hydrate:false}); f.render(); await tick();
  nodes(f.render(),'FormField').find(n=>n.props.label==='City').props.onChange('My draft');
  f.replies[0].reject(Error('Offline')); await tick();
  let tree=f.render(); assert.equal(nodes(tree,'TouchableOpacity').at(-1).props.disabled,true);
  await f.save(); assert.equal(f.requests.length,1);
  nodes(tree,'TouchableOpacity').find(n=>nodes(n,'Text').some(t=>t.children.includes('Retry loading profile'))).props.onPress();
  tree=f.render(); await tick();
  nodes(tree,'FormField').find(n=>n.props.label==='Country').props.onChange('');
  f.replies[1].resolve(response(profileReply())); await tick();
  tree=f.render(); const fields=nodes(tree,'FormField');
  assert.equal(fields.find(n=>n.props.label==='City').props.value,'My draft');
  assert.equal(fields.find(n=>n.props.label==='Country').props.value,'');
  const save=f.save(); await tick();
  const payload=JSON.parse(f.requests[2].config.body);
  assert.equal(payload.city,'My draft'); assert.equal(payload.country,'');
  f.replies[2].resolve(response(profileReply())); await save;
});

test('profile hydration rejects mismatched profile identity and does not enable saving', async()=>{
  const f=await screenFixture('profile',{hydrate:false}); f.render(); await tick();
  f.replies[0].resolve(response({...profileReply(),_id:'B'})); await tick();
  const tree=f.render(); assert.equal(nodes(tree,'TouchableOpacity').at(-1).props.disabled,true);
  await f.save(); assert.equal(f.requests.length,1); assert.deepEqual(f.routes,[]);
});

test('profile hydration ignores old success and failure after account switch, same-user relogin or unmount', async()=>{
  for(const change of ['account','same-login','unmount']) for(const fail of [false,true]) {
    const f=await screenFixture('profile',{hydrate:false}); const tree=f.render(); await tick();
    const save=nodes(tree,'TouchableOpacity').at(-1).props.onPress;
    await interrupt(f,change); const before=f.storage.get('user-data'),writes=f.writes.length;
    if(fail)f.replies[0].reject(Error('Old GET'));else f.replies[0].resolve(response(profileReply()));
    await tick(); await save();
    assert.equal(f.requests.length,1); assert.equal(f.storage.get('user-data'),before); assert.equal(f.writes.length,writes);
    assert.deepEqual(f.routes,[]); assert.deepEqual(f.alerts,[]);
    if(change!=='unmount')assert.equal(nodes(f.render(),'FormField').length,0);
  }
});

test('profile hydration supports absent optional fields only after authoritative profile loads', async()=>{
  const f=await screenFixture('profile',{hydrate:false}); f.render(); await tick();
  f.replies[0].resolve(response(account('A'))); await tick();
  assert.equal(nodes(f.render(),'TouchableOpacity').at(-1).props.disabled,false);
  const work=f.save(); await tick(); const payload=JSON.parse(f.requests[1].config.body);
  assert.equal(payload.city,''); assert.equal(payload.country,'');
  f.replies[1].resolve(response(profileReply())); await work;
});
