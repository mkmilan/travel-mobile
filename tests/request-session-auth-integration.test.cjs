const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('zustand');
const { load } = require('./helpers/component-fixture.cjs');
const preferences = require('../src/constants/presentationPreferences');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(setImmediate);
const account = { _id: 'fixture-a', username: 'Fixture A', token: 'fixture-token-a' };
const response = (status = 200, data = status === 401 ? { message: 'Expired' } : { ok: true }) => ({
  status, ok: status < 400, headers: { get: () => 'application/json' }, json: async () => data,
});
const operations = [
  ['JSON PUT', api => api.apiFetch('/users/me', { method: 'PUT', csrf: true, body: '{"username":"Old edit"}' })],
  ['profile photo', api => api.uploadProfilePhoto('file://fixture.jpg')],
  ['trip photo', api => api.uploadTripPhoto('fixture-trip', 'file://fixture.jpg')],
  ['recommendation photo', api => api.uploadRecommendationPhoto('fixture-rec', 'file://fixture.jpg')],
];

// Run the production auth store with real Zustand, the production CSRF helper,
// and API module together. Only native storage/recording/photo and network I/O
// are controlled; never simulate logout by assigning a null token.
async function fixture() {
  const storage = new Map(), requests = [], storageReads = [], authService = {};
  let beforeRead = async () => {}, beforeWrite = async () => {}, stop = async () => {};
  let csrf = async () => response(200, { csrfToken: 'fixture-csrf' });
  let reply = async () => response(), photo = async () => ({ fixture: 'multipart' }), stopCount = 0;
  const SecureStore = {
    getItemAsync: async key => { storageReads.push(key); await beforeRead(key); return storage.get(key) ?? null; },
    setItemAsync: async (key, value) => { await beforeWrite(key); storage.set(key, value); },
    deleteItemAsync: async key => { storage.delete(key); },
  };
  const useAuthStore = load('src/stores/auth.js', 'useAuthStore', {
    ...preferences, create, SecureStore, authService,
    stopActiveRecording: async () => { stopCount++; await stop(); },
    require: () => ({ useTripSocialStore: { getState: () => ({ reset() {} }) } }),
  });
  const Constants = { expoConfig: { extra: { API_URL: 'https://fixture.invalid/api', APP_ENV: 'test' } } };
  const fetch = async (url, options) => {
    requests.push({ url, options });
    const result = await (url.endsWith('/csrf-token') ? csrf() : reply());
    if (options?.headers?.['X-Photo-Upload-Id'] && result.ok) {
      const original = result.json; result.json = async () => ({...await original(), photoIds:['fixture-photo'], photoUploadProtocol:1, photoUploadId:options.headers['X-Photo-Upload-Id']});
    }
    return result;
  };
  const console = { log() {}, warn() {}, error() {} };
  const getCsrfToken = load('src/services/csrf.js', 'getCsrfToken', { Constants, fetch, console });
  const api = load('src/services/api.js', '({apiFetch,uploadProfilePhoto,uploadTripPhoto,uploadRecommendationPhoto})', {
    ...require('./helpers/photo-upload-identity.cjs'),
    Constants, Updates: {}, SecureStore, getCsrfToken, fetch, console,
    require: () => ({ useAuthStore }), createPhotoFormData: (...args) => photo(...args),
  });
  Object.assign(authService, load('src/services/auth.js', '({loginRequest,registerRequest})', { Constants, apiFetch: api.apiFetch }));
  await useAuthStore.getState().login(account);
  return {
    api, authService, storage, requests, storageReads, useAuthStore, state: useAuthStore.getState,
    writes: () => requests.filter(request => !request.url.endsWith('/csrf-token')),
    stopCount: () => stopCount, holdStop: fn => { stop = fn; }, holdCsrf: fn => { csrf = fn; },
    holdRead: fn => { beforeRead = fn; }, holdWrite: fn => { beforeWrite = fn; },
    holdReply: fn => { reply = fn; }, holdPhoto: fn => { photo = fn; },
  };
}

async function overlappingSameLogin(f) {
  const nativeStop = deferred(), observedTokens = [];
  const unsubscribe = f.useAuthStore.subscribe(state => observedTokens.push(state.token));
  f.holdStop(() => nativeStop.promise);
  const logout = f.state().logout();
  assert.equal(f.state().sessionEpoch, 2);
  assert.equal(f.state().isSessionChanging, true);
  assert.equal(await f.state().login(account), true);
  assert.equal(f.state().sessionEpoch, 3);
  assert.equal(f.state().isSessionChanging, false);
  assert.ok(observedTokens.every(token => token === account.token), 'the real overlap never clears or changes the token');
  unsubscribe();
  nativeStop.resolve();
  assert.equal(await logout, false);
  assert.equal(f.state().token, account.token);
}

test('real auth overlap: CSRF-held JSON and multipart requests cannot cross same-token epochs', async () => {
  for (const [name, operation] of operations) {
    const f = await fixture(), csrf = deferred();
    f.holdCsrf(() => csrf.promise);
    const work = operation(f.api);
    await tick();
    assert.equal(f.requests[0].options.credentials, 'include');
    await overlappingSameLogin(f);
    csrf.resolve(response(200, { csrfToken: 'fixture-csrf' }));
    await assert.rejects(work, /Account changed/, name);
    assert.equal(f.writes().length, 0, name);
  }
});

test('real auth overlap: final SecureStore awaits reject same-token epochs for JSON and multipart', async () => {
  for (const [name, operation] of operations) {
    const f = await fixture(), read = deferred();
    f.holdRead(() => read.promise);
    const work = operation(f.api);
    await tick();
    assert.ok(f.storageReads.length > 0, name);
    await overlappingSameLogin(f);
    read.resolve();
    await assert.rejects(work, /Account changed/, name);
    assert.equal(f.writes().length, 0, name);
  }
});

test('the final dispatch check closes the promise boundary after persisted-session validation', async () => {
  for (const [name, operation] of operations) {
    const f = await fixture();
    const getState = f.useAuthStore.getState;
    let scheduled = false, login;
    f.useAuthStore.getState = () => {
      const state = getState();
      if (!scheduled && f.storageReads.length === 2) {
        scheduled = true;
        // Begin a real same-token login after the validator reads current auth,
        // but before its awaiting caller resumes to dispatch the prepared write.
        queueMicrotask(() => { login = getState().login(account); });
      }
      return state;
    };
    await assert.rejects(operation(f.api), /Account changed/, name);
    assert.equal(scheduled, true, name);
    await login;
    assert.equal(f.state().sessionEpoch, 2);
    assert.equal(f.state().token, account.token);
    assert.equal(f.writes().length, 0, name);
  }
});

test('real auth overlap: multipart preparation cannot dispatch an earlier same-token epoch', async () => {
  for (const [name, operation] of operations.slice(1)) {
    const f = await fixture(), nativePhoto = deferred();
    let preparing = false;
    f.holdPhoto(() => { preparing = true; return nativePhoto.promise; });
    const work = operation(f.api);
    await tick();
    assert.equal(preparing, true, name);
    await overlappingSameLogin(f);
    nativePhoto.resolve({ fixture: 'multipart' });
    await assert.rejects(work, /Account changed/, name);
    assert.equal(f.writes().length, 0, name);
  }
});

test('authenticated requests started during real logout or login transitions stop before CSRF and dispatch', async () => {
  for (const transition of ['logout', 'login']) {
    const f = await fixture(), native = deferred();
    if (transition === 'logout') f.holdStop(() => native.promise);
    else f.holdWrite(() => native.promise);
    const changing = transition === 'logout' ? f.state().logout() : f.state().login(account);
    assert.equal(f.state().isSessionChanging, true);
    for (const [name, operation] of operations) await assert.rejects(operation(f.api), /Account changed/, `${transition}: ${name}`);
    assert.equal(f.requests.length, 0);
    assert.equal(f.storageReads.length, 0);
    native.resolve();
    await changing;
  }
});

test('real auth overlap: old JSON 401 cannot log out the newer same-token login', async () => {
  for (const boundary of ['response', '401 storage']) {
    const f = await fixture(), reply = deferred(), read = deferred();
    f.holdReply(() => reply.promise);
    const work = f.api.apiFetch('/trips');
    await tick();
    assert.equal(f.writes().length, 1);
    if (boundary === '401 storage') {
      f.holdRead(() => read.promise);
      reply.resolve(response(401));
      await tick();
      assert.equal(f.storageReads.length, 3, '401 token read is held after the two dispatch-validation reads');
    }
    await overlappingSameLogin(f);
    reply.resolve(response(401));
    read.resolve();
    await assert.rejects(work, /Expired/);
    assert.equal(f.stopCount(), 1, boundary);
    assert.equal(f.state().sessionEpoch, 3, boundary);
    assert.equal(f.state().isAuthenticated, true, boundary);
    assert.equal(f.storage.get('auth-token'), account.token);
  }
});

test('a 401 arriving during an existing logout does not start another logout', async () => {
  const f = await fixture(), reply = deferred(), nativeStop = deferred();
  f.holdReply(() => reply.promise);
  const work = f.api.apiFetch('/trips');
  await tick();
  f.holdStop(() => nativeStop.promise);
  const logout = f.state().logout();
  reply.resolve(response(401));
  // Release the native stop after the response is handled, not by nulling auth.
  const rejected = assert.rejects(work, /Expired/);
  await tick();
  nativeStop.resolve();
  await Promise.all([logout, rejected]);
  assert.equal(f.stopCount(), 1);
  assert.equal(f.state().sessionEpoch, 2);
  assert.equal(f.state().isAuthenticated, false);
});

test('current JSON 401 still logs out the real authenticated session and clears persisted credentials', async () => {
  const f = await fixture();
  f.holdReply(async () => response(401));
  await assert.rejects(f.api.apiFetch('/trips'), /Expired/);
  assert.equal(f.stopCount(), 1);
  assert.equal(f.state().isAuthenticated, false);
  assert.equal(f.state().isSessionChanging, false);
  assert.equal(f.storage.size, 0);
});

test('public login and registration retain CSRF and skip session checks during real auth transitions', async () => {
  const f = await fixture(), nativeStop = deferred();
  f.holdStop(() => nativeStop.promise);
  const logout = f.state().logout();
  await f.authService.loginRequest('fixture@example.invalid', 'fixture-password');
  await f.state().register('Fixture', 'fixture@example.invalid', 'fixture-password');
  assert.deepEqual(f.writes().map(request => request.url.split('/').pop()), ['login', 'register']);
  for (const { options } of f.writes()) {
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers['X-CSRF-Token'], 'fixture-csrf');
    assert.equal(options.credentials, 'include');
  }
  f.holdReply(async () => response(401));
  await assert.rejects(f.authService.loginRequest('fixture@example.invalid', 'fixture-password'), /Expired/);
  assert.equal(f.stopCount(), 1);
  assert.equal(f.storageReads.length, 0);
  nativeStop.resolve();
  await logout;
});

test('current real sessions retain JSON/multipart CSRF, captured Bearer, owner checks and profile-only updates', async () => {
  for (const [name, operation] of operations) {
    const f = await fixture(), csrf = deferred();
    f.holdCsrf(() => csrf.promise);
    const work = operation(f.api);
    assert.equal(await f.state().updateUser({ username: 'Current edit' }), true);
    assert.equal(f.state().sessionEpoch, 1);
    csrf.resolve(response(200, { csrfToken: 'fixture-csrf' }));
    await work;
    const { options } = f.writes()[0];
    assert.equal(options.headers.Authorization, `Bearer ${account.token}`, name);
    assert.equal(options.headers['X-CSRF-Token'], 'fixture-csrf', name);
    assert.equal(options.headers['Content-Type'], name === 'JSON PUT' ? 'application/json' : undefined);
    assert.equal(f.state().isAuthenticated, true);
  }
  const f = await fixture();
  await assert.rejects(f.api.apiFetch('/v2/trips/json', { method: 'POST', expectedUserId: 'fixture-b' }), /Account changed/);
  assert.equal(f.requests.length, 0);
  await f.api.apiFetch('/v2/trips/json', { method: 'POST', expectedUserId: account._id });
  assert.equal(f.writes().length, 1);
});
