const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('zustand');
const { load, fixture, nodes, native, theme } = require('./helpers/component-fixture.cjs');
const { hooksFixture } = require('./helpers/hooks-fixture.cjs');
const preferences = require('../src/constants/presentationPreferences');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(setImmediate);
const account = { _id: 'fixture-owner', username: 'Fixture', token: 'fixture-token', settings: {} };
const otherAccount = { ...account, _id: 'fixture-other', token: 'fixture-other-token' };
const response = (data = {}, status = 200) => ({ status, ok: status < 400, headers: { get: () => 'application/json' }, json: async () => data });
const text = tree => nodes(tree, 'Text').flatMap(node => node.children).join(' ');
const inputs = tree => nodes(tree, 'TextInput').map(node => node.props.value);
const photos = tree => nodes(tree, 'TripPhotoThumb').map(node => node.props.photoId);
const button = (tree, label) => nodes(tree, 'Pressable').find(node => nodes(node, 'Text').some(child => child.children.includes(label)));
const picker = tree => nodes(tree, 'Pressable').find(node => nodes(node, 'Feather').some(child => child.props.name === 'plus'));

// Production Zustand/auth, CSRF/API, profile lifetime, photo manager and screen
// run together. Only React scheduling, native storage/picker/resize/recording,
// navigation and network I/O are synthetic. No live account or service is used.
async function editor() {
  let host = hooksFixture(), mountedKey;
  const storage = new Map(), requests = [], alerts = [], routes = [], route = { id: 'fixture-trip' };
  const hooks = Object.fromEntries(Object.keys(host.hooks).map(name => [name, (...args) => host.hooks[name](...args)]));
  let stop = async () => {}, write = async () => {}, pick = async () => ({ canceled: true });
  let resize = async uri => uri, readCount = 0, pickCount = 0, resizeCount = 0;
  let title = 'Original title', photoIds = ['existing-photo'];
  let reply = async (url, options) => {
    if (options.method === 'GET') return response(trip());
    if (options.method === 'POST') return response({ photoIds: [`saved-${options.body.uri.split('/').at(-1)}`] });
    return response();
  };
  const SecureStore = {
    getItemAsync: async key => storage.get(key) ?? null,
    setItemAsync: async (key, value) => { await write(key); storage.set(key, value); },
    deleteItemAsync: async key => { storage.delete(key); },
  };
  const auth = load('src/stores/auth.js', 'useAuthStore', {
    ...preferences, create, SecureStore, authService: {}, stopActiveRecording: () => stop(),
    require: () => ({ useTripSocialStore: { getState: () => ({ reset() {} }) } }),
  });
  // Preserve the actual Zustand state and subscriptions without calling a React
  // hook outside React; the deterministic host explicitly schedules renders.
  const useAuthStore = Object.assign(select => select ? select(auth.getState()) : auth.getState(), auth);
  const Constants = { expoConfig: { extra: { API_URL: 'https://fixture.invalid/api', APP_ENV: 'test' } } };
  const console = { log() {}, warn() {}, error() {} };
  const fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/csrf-token')) return response({ csrfToken: 'fixture-csrf' });
    if (options.method === 'GET') readCount++;
    const result = await reply(url, options);
    if (options?.headers?.['X-Photo-Upload-Id'] && result.ok) {
      const original = result.json; result.json = async () => ({...await original(), photoUploadProtocol:1, photoUploadId:options.headers['X-Photo-Upload-Id']});
    }
    return result;
  };
  const getCsrfToken = load('src/services/csrf.js', 'getCsrfToken', { Constants, fetch, console });
  const api = load('src/services/api.js', '({getTripJsonById,updateTripJson,uploadTripPhoto,deleteTripPhoto})', {
    ...require('./helpers/photo-upload-identity.cjs'),
    Constants, Updates: {}, SecureStore, getCsrfToken, fetch, console,
    require: () => ({ useAuthStore }), createPhotoFormData: async (field, uri) => ({ field, uri }),
  });
  const useProfileContext = load('src/hooks/useProfileContext.js', 'useProfileContext', { ...hooks, useAuthStore });
  const usePhotoManager = load('src/hooks/usePhotoManager.js', 'usePhotoManager', {
    ...hooks, ...api, useProfileContext,
    ImagePicker: { launchImageLibraryAsync: () => { pickCount++; return pick(); } },
    copyAndResizeAsync: uri => { resizeCount++; return resize(uri); },
  });
  const options = load('src/constants/settingsOptions.js', '({tripVisibilityOptions,travelModeOptions})');
  const form = fixture('app/(tabs)/trip/[id]/edit.js', 'EditTripScreen', {}, {
    ...native, ...hooks, ...options, ...api, theme, useAuthStore, usePhotoManager, console,
    StyleSheet: { create: value => value }, Feather: 'Feather', TransportIcon: 'TransportIcon', TripPhotoThumb: 'TripPhotoThumb',
    useLocalSearchParams: () => route, useRouter: () => ({ replace: path => routes.push(path), back: () => routes.push('back') }),
    Alert: { alert: (...args) => alerts.push(args) },
  });
  function trip(overrides = {}) {
    return { _id: route.id, user: { _id: auth.getState().user?._id }, title, description: 'Original description',
      defaultTripVisibility: 'private', defaultTravelMode: 'walking', photos: [...photoIds], ...overrides };
  }
  const render = () => {
    const child = form.render();
    // Honor the production wrapper's actual React key: replace hook cells and
    // run old cleanups on key changes, rather than pretending a child persists.
    if (mountedKey !== child.props.key) {
      host.unmount();
      host = hooksFixture();
      mountedKey = child.props.key;
    }
    return host.render(() => child.type(child.props));
  };
  await auth.getState().login(account);
  return {
    state: auth.getState, auth, route, requests, alerts, routes, render, trip,
    unmount: () => host.unmount(), load: async () => { render(); await tick(); return render(); },
    save: () => nodes(render(), 'Pressable').find(node => node.props.testID === 'trip-edit-save'),
    reads: () => readCount, writes: method => requests.filter(({ options }) => options.method === method),
    pickCount: () => pickCount, resizeCount: () => resizeCount,
    holdStop: fn => { stop = fn; }, holdWrite: fn => { write = fn; }, holdReply: fn => { reply = fn; },
    holdPicker: fn => { pick = fn; }, holdResize: fn => { resize = fn; },
    setTrip: (nextTitle, nextPhotos = photoIds) => { title = nextTitle; photoIds = nextPhotos; },
  };
}

async function overlapLogin(f, next = account) {
  const stopped = deferred(), tokens = [];
  const unsubscribe = f.auth.subscribe(state => tokens.push(state.token));
  let stops = 0;
  f.holdStop(() => ++stops === 1 ? stopped.promise : Promise.resolve());
  const logout = f.state().logout();
  assert.equal(f.state().sessionEpoch, 2);
  assert.equal(f.state().isSessionChanging, true);
  assert.equal(await f.state().login(next), true);
  assert.equal(f.state().sessionEpoch, 3);
  assert.equal(f.state().isSessionChanging, false);
  if (next === account) assert.ok(tokens.every(token => token === account.token), 'same-token overlap never clears the old identity');
  unsubscribe();
  return async () => { stopped.resolve(); assert.equal(await logout, false); };
}

for (const next of [account, otherAccount]) for (const fails of [false, true]) {
  test(`MOB-035 dispatched PUT ${fails ? 'failure' : 'success'} cannot affect a newer ${next === account ? 'same-token' : 'different-account'} login`, async () => {
    const f = await editor(), pending = deferred();
    await f.load();
    f.holdReply((url, options) => options.method === 'PUT' ? pending.promise : Promise.resolve(response(f.trip())));
    const saving = f.save().props.onPress();
    await tick();
    assert.equal(f.writes('PUT').length, 1);
    const finish = await overlapLogin(f, next);
    f.setTrip('New login title', ['new-photo']);
    assert.deepEqual(inputs(f.render()), [], 'old draft is hidden before reset effects run');
    await tick();
    assert.deepEqual(inputs(f.render()), ['New login title', 'Original description']);
    pending.resolve(fails ? response({ message: 'Old metadata failure' }, 503) : response());
    await saving;
    assert.deepEqual(inputs(f.render()), ['New login title', 'Original description']);
    assert.deepEqual(photos(f.render()), ['new-photo']);
    assert.equal(f.save().props.disabled, false);
    assert.equal(f.reads(), 2);
    assert.deepEqual(f.alerts, []);
    assert.deepEqual(f.routes, []);
    await finish();
  });
}

test('MOB-035 live epoch guard rejects old PUT completion before any auth rerender', async () => {
  for (const fails of [false, true]) {
    const f = await editor(), pending = deferred();
    await f.load();
    f.holdReply(() => pending.promise);
    const saving = f.save().props.onPress();
    await tick();
    const finish = await overlapLogin(f);
    pending.resolve(fails ? response({ message: 'Old error' }, 500) : response());
    await saving;
    assert.deepEqual(f.alerts, []);
    assert.deepEqual(f.routes, []);
    await finish();
  }
});

test('MOB-035 transitions hide the draft and suppress old PUT success/failure until a fresh end-of-transition GET', async () => {
  for (const transition of ['logout', 'login']) for (const fails of [false, true]) {
    const f = await editor(), pending = deferred(), nativeWait = deferred();
    const tree = await f.load(), oldSave = f.save().props.onPress;
    f.holdReply((url, options) => options.method === 'PUT' ? pending.promise : Promise.resolve(response(f.trip())));
    const saving = oldSave();
    await tick();
    if (transition === 'logout') f.holdStop(() => nativeWait.promise);
    else f.holdWrite(() => nativeWait.promise);
    const changing = transition === 'logout' ? f.state().logout() : f.state().login(account);
    assert.equal(f.state().isSessionChanging, true);
    await oldSave();
    await picker(tree).props.onPress();
    assert.deepEqual(inputs(f.render()), []);
    assert.equal(f.reads(), 1, 'no request is launched during the transition');
    assert.equal(f.pickCount(), 0);
    pending.resolve(fails ? response({ message: 'Old error' }, 500) : response());
    await saving;
    assert.deepEqual(f.alerts, []);
    assert.deepEqual(f.routes, []);
    nativeWait.resolve();
    await changing;
    if (transition === 'logout') {
      assert.match(text(f.render()), /Sign in|^$/);
      await f.state().login(account);
    }
    f.setTrip('Reloaded title');
    await f.load();
    assert.deepEqual(inputs(f.render()), ['Reloaded title', 'Original description']);
    assert.equal(f.reads(), 2, 'isSessionChanging=false triggers a fresh read even when user/token are unchanged');
    assert.equal(f.save().props.disabled, false);
  }
});

test('MOB-035 a late old PUT cannot unlock or report over a new login save', async () => {
  const f = await editor(), old = deferred(), current = deferred();
  await f.load();
  f.holdReply((url, options) => options.method === 'PUT' ? (f.writes('PUT').length === 1 ? old.promise : current.promise) : Promise.resolve(response(f.trip())));
  const first = f.save().props.onPress();
  await tick();
  const finish = await overlapLogin(f);
  await f.load();
  const second = f.save().props.onPress();
  await tick();
  old.resolve(response({ message: 'Old error' }, 500));
  await first;
  assert.equal(f.save().props.disabled, true);
  await f.save().props.onPress();
  assert.equal(f.writes('PUT').length, 2);
  assert.deepEqual(f.alerts, []);
  current.resolve(response());
  await second;
  assert.deepEqual(f.alerts.map(([title]) => title), ['Success']);
  assert.deepEqual(f.routes, ['/(tabs)/trip/fixture-trip']);
  await finish();
});

test('MOB-035 stale GET success/failure cannot hydrate or report over a replacement login draft', async () => {
  for (const next of [account, otherAccount]) for (const fails of [false, true]) {
    const f = await editor(), old = deferred();
    const oldTrip = f.trip({ title: 'Obsolete title', photos: ['obsolete-photo'] });
    f.holdReply(() => f.reads() === 1 ? old.promise : Promise.resolve(response(f.trip())));
    f.render();
    await tick();
    const finish = await overlapLogin(f, next);
    f.setTrip('Replacement title', ['replacement-photo']);
    await f.load();
    old.resolve(fails ? response({ message: 'Old read error' }, 500) : response(oldTrip));
    await tick();
    assert.deepEqual(inputs(f.render()), ['Replacement title', 'Original description']);
    assert.deepEqual(photos(f.render()), ['replacement-photo']);
    assert.equal(f.reads(), 2);
    assert.deepEqual(f.alerts, []);
    assert.deepEqual(f.routes, []);
    await finish();
  }
});

test('MOB-035 retained input/chip/picker/save/cancel/delete callbacks cannot act on a replacement login draft', async () => {
  const f = await editor(), tree = await f.load();
  const save = f.save().props.onPress, add = picker(tree).props.onPress, cancel = button(tree, 'Cancel').props.onPress;
  const thumb = nodes(tree, 'TripPhotoThumb')[0].props.onPress;
  thumb();
  const confirm = f.alerts.pop()[2].find(button => button.text === 'Delete').onPress;
  const finish = await overlapLogin(f);
  // Also exercise the live store checks before a rerender updates context refs.
  await add(); await save(); await confirm(); cancel(); thumb();
  f.setTrip('Current draft');
  await f.load();
  nodes(tree, 'TextInput')[0].props.onChangeText('Stale input');
  nodes(tree).filter(node => node.type?.name === 'Chip').forEach(node => node.props.onPress());
  await add(); await save(); await confirm(); cancel(); thumb();
  assert.deepEqual(inputs(f.render()), ['Current draft', 'Original description']);
  assert.deepEqual(photos(f.render()), ['existing-photo']);
  assert.equal(f.pickCount(), 0);
  assert.equal(f.writes('DELETE').length, 0);
  assert.equal(f.writes('PUT').length, 0);
  assert.deepEqual(f.alerts, []);
  assert.deepEqual(f.routes, []);
  await f.save().props.onPress();
  const body = JSON.parse(f.writes('PUT')[0].options.body);
  assert.equal(body.defaultTripVisibility, 'private');
  assert.equal(body.defaultTravelMode, 'walking');
  await finish();
});

test('MOB-035 picker and resize returns from an old epoch cannot append to the newly loaded draft', async () => {
  for (const boundary of ['picker', 'resize']) {
    const f = await editor(), pending = deferred(), tree = await f.load();
    f.holdPicker(() => boundary === 'picker' ? pending.promise : Promise.resolve({ assets: [{ uri: 'file://old-photo' }] }));
    if (boundary === 'resize') f.holdResize(() => pending.promise);
    const selecting = picker(tree).props.onPress();
    await tick();
    const finish = await overlapLogin(f);
    f.setTrip('Current draft', ['new-photo']);
    await f.load();
    pending.resolve(boundary === 'picker' ? { assets: [{ uri: 'file://old-photo' }] } : 'file://resized-old-photo');
    await selecting;
    assert.deepEqual(photos(f.render()), ['new-photo']);
    assert.equal(f.resizeCount(), boundary === 'picker' ? 0 : 1);
    assert.deepEqual(f.alerts, []);
    await finish();
  }
});

test('MOB-035 an old photo-delete Retry cannot run under a replacement same-token login', async () => {
  const f = await editor();
  let tree = await f.load();
  f.holdReply(async (url, options) => options.method === 'DELETE'
    ? response({ message: 'Photo offline' }, 503) : response(f.trip()));
  nodes(tree, 'TripPhotoThumb')[0].props.onPress();
  await f.alerts.pop()[2].find(button => button.text === 'Delete').onPress();
  tree = f.render();
  assert.deepEqual(photos(tree), ['existing-photo']);
  const retry = button(tree, 'Retry remove photo').props.onPress;
  const finish = await overlapLogin(f);
  await retry();
  await f.load();
  await retry();
  assert.equal(f.writes('DELETE').length, 1);
  assert.deepEqual(photos(f.render()), ['existing-photo']);
  assert.doesNotMatch(text(f.render()), /Photo offline|Retry remove/);
  assert.deepEqual(f.alerts, []);
  await finish();
});

test('MOB-035 pending photo upload and DELETE success/failure stay out of a new login draft', async () => {
  for (const operation of ['upload', 'delete']) for (const fails of [false, true]) {
    const f = await editor(), pending = deferred();
    let tree = await f.load(), work;
    if (operation === 'upload') {
      f.holdPicker(async () => ({ assets: [{ uri: 'file://old-photo' }] }));
      await picker(tree).props.onPress();
      f.render();
    }
    f.holdReply((url, options) => ['POST', 'DELETE'].includes(options.method) ? pending.promise : Promise.resolve(response(f.trip())));
    if (operation === 'upload') work = f.save().props.onPress();
    else {
      nodes(tree, 'TripPhotoThumb')[0].props.onPress();
      work = f.alerts.pop()[2].find(button => button.text === 'Delete').onPress();
    }
    await tick();
    assert.equal(f.writes(operation === 'upload' ? 'POST' : 'DELETE').length, 1);
    const finish = await overlapLogin(f);
    f.setTrip('Current draft', ['new-photo']);
    await f.load();
    assert.equal(f.save().props.disabled, false, 'old photo work must not leave the new login draft busy');
    await f.save().props.onPress();
    assert.equal(f.writes('PUT').length, 1, 'the new login can save before old photo work settles');
    pending.resolve(fails ? response({ message: 'Old photo error' }, 500) : response({ photoIds: ['old-uploaded-photo'] }));
    await work;
    tree = f.render();
    assert.deepEqual(photos(tree), ['new-photo']);
    assert.deepEqual(inputs(tree), ['Current draft', 'Original description']);
    assert.doesNotMatch(text(tree), /Old photo error|Retry remove/);
    assert.equal(f.save().props.disabled, false);
    assert.equal(f.writes('PUT').length, 1);
    assert.deepEqual(f.alerts.map(([title]) => title), ['Success']);
    assert.deepEqual(f.routes, ['/(tabs)/trip/fixture-trip']);
    await finish();
  }
});

test('MOB-035 current partial-photo and metadata retry preserves the draft and uploads only remaining files', async () => {
  const f = await editor();
  let failPhoto = true, failMetadata = true;
  let tree = await f.load();
  nodes(tree, 'TextInput')[0].props.onChangeText('  Edited title  ');
  nodes(tree, 'TextInput')[1].props.onChangeText('  Edited description  ');
  f.holdPicker(async () => ({ assets: [{ uri: 'file://a' }, { uri: 'file://b' }] }));
  await picker(f.render()).props.onPress();
  f.holdReply(async (url, options) => {
    if (options.method === 'POST') return options.body.uri === 'file://b' && failPhoto
      ? response({ message: 'Photo offline' }, 503) : response({ photoIds: [`saved-${options.body.uri.at(-1)}`] });
    return failMetadata ? response({ message: 'Metadata offline' }, 503) : response();
  });
  const saving = f.save().props.onPress();
  await f.save().props.onPress();
  await saving;
  tree = f.render();
  assert.deepEqual(photos(tree), ['existing-photo', 'saved-a', 'file://b']);
  assert.deepEqual(inputs(tree), ['  Edited title  ', '  Edited description  ']);
  assert.match(text(tree), /1 photo could not be uploaded/);
  assert.equal(f.writes('PUT').length, 0);
  assert.equal(f.save().props.disabled, false);
  failPhoto = false;
  await f.save().props.onPress();
  assert.deepEqual(photos(f.render()), ['existing-photo', 'saved-a', 'saved-b']);
  assert.match(text(f.render()), /Metadata offline/);
  assert.equal(f.routes.length, 0);
  failMetadata = false;
  await f.save().props.onPress();
  assert.deepEqual(f.writes('POST').map(({ options }) => options.body.uri), ['file://a', 'file://b', 'file://b']);
  assert.equal(f.writes('PUT').length, 2);
  assert.deepEqual(JSON.parse(f.writes('PUT')[1].options.body), {
    title: 'Edited title', description: 'Edited description', defaultTripVisibility: 'private', defaultTravelMode: 'walking',
  });
  for (const { options } of f.writes('PUT')) {
    assert.equal(options.headers.Authorization, `Bearer ${account.token}`);
    assert.equal(options.headers['X-CSRF-Token'], 'fixture-csrf');
  }
  assert.deepEqual(f.alerts.map(([title]) => title), ['Error', 'Error', 'Success']);
  assert.deepEqual(f.routes, ['/(tabs)/trip/fixture-trip']);
  assert.equal(f.reads(), 1, 'ordinary retries must not reload and discard a live draft');
});

test('MOB-035 a current-session profile update preserves unsaved metadata and selected photos without reloading', async () => {
  const f = await editor(), tree = await f.load();
  nodes(tree, 'TextInput')[0].props.onChangeText('Unsaved title');
  f.holdPicker(async () => ({ assets: [{ uri: 'file://kept-photo' }] }));
  await picker(f.render()).props.onPress();
  assert.equal(await f.state().updateUser({ username: 'Updated profile name' }), true);
  assert.equal(f.state().sessionEpoch, 1);
  assert.deepEqual(inputs(f.render()), ['Unsaved title', 'Original description']);
  assert.deepEqual(photos(f.render()), ['existing-photo', 'file://kept-photo']);
  assert.equal(f.reads(), 1);
  await f.save().props.onPress();
  assert.equal(JSON.parse(f.writes('PUT')[0].options.body).title, 'Unsaved title');
  assert.deepEqual(f.alerts.map(([title]) => title), ['Success']);
});

test('MOB-035 actual API GET/PUT completions respect trip changes and unmounts', async () => {
  for (const method of ['GET', 'PUT']) for (const change of ['trip', 'unmount']) for (const fails of [false, true]) {
    const f = await editor(), pending = deferred();
    if (method === 'PUT') await f.load();
    const oldTrip = f.trip();
    f.holdReply(() => pending.promise);
    const work = method === 'PUT' ? f.save().props.onPress() : f.render();
    await tick();
    if (change === 'unmount') f.unmount();
    else { f.route.id = 'new-trip'; f.holdReply(async () => response(f.trip({ title: 'Other trip' }))); await f.load(); }
    pending.resolve(fails ? response({ message: 'Obsolete error' }, 500) : response(oldTrip));
    await work;
    await tick();
    if (change === 'trip') assert.deepEqual(inputs(f.render()), ['Other trip', 'Original description']);
    assert.deepEqual(f.alerts, []);
    assert.deepEqual(f.routes, []);
  }
});
