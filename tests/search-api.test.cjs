const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/component-fixture.cjs');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function apiFixture({ payload = { results: [], page: 1, limit: 20, total: 0, hasMore: false }, status = 200, read } = {}) {
  const requests = []; let csrfCalls = 0, logoutCalls = 0;
  let state = { token: 'search-token', user: { _id: 'search-user' }, sessionEpoch: 1, isSessionChanging: false, logout: async () => { logoutCalls++; } };
  const api = load('src/services/api.js', '({searchPageApi,searchApi,searchUsersApi})', {
    URLSearchParams,
    Constants: { expoConfig: { extra: { API_URL: 'https://fixture.invalid/api', APP_ENV: 'test' } } }, Updates: {},
    console: { log() {}, error() {}, warn() {} }, require: () => ({ useAuthStore: { getState: () => state } }),
    SecureStore: { getItemAsync: async key => read ? read(key, state) : key === 'auth-token' ? state.token : JSON.stringify(state.user) },
    getCsrfToken: async () => { csrfCalls++; return 'fixture-csrf'; },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { status, ok: status < 400, headers: { get: () => 'application/json' }, json: async () => payload };
    },
  });
  return { api, requests, setState: next => { state = { ...state, ...next }; }, csrfCalls: () => csrfCalls, logoutCalls: () => logoutCalls };
}

test('paged search requests plural API types, opt-in envelope and correct paging with authenticated safe GET', async () => {
  for (const type of ['trips', 'recommendations', 'users']) {
    const payload = { results: [{ _id: 'result', photos: ['photo'], associatedTrip: 'trip', isLikedByCurrentUser: true }], page: 3, limit: 20, total: 70, hasMore: true };
    const f = apiFixture({ payload });
    const result = await f.api.searchPageApi('Café & [camp]+ 東京', type, 3, 20, 'WILD_SPOT');
    assert.equal(result, payload);
    const { url, options } = f.requests[0], parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://fixture.invalid/api/v2/search');
    assert.equal(parsed.searchParams.get('q'), 'Café & [camp]+ 東京');
    assert.equal(parsed.searchParams.get('type'), type); assert.equal(parsed.searchParams.get('envelope'), 'true');
    assert.equal(parsed.searchParams.get('page'), '3'); assert.equal(parsed.searchParams.get('limit'), '20');
    assert.equal(parsed.searchParams.get('category'), type === 'recommendations' ? 'WILD_SPOT' : null);
    assert.equal(options.method, 'GET'); assert.equal(options.headers.Authorization, 'Bearer search-token');
    assert.equal(options.headers['X-CSRF-Token'], undefined); assert.equal(options.credentials, undefined);
    assert.equal(f.csrfCalls(), 0);
  }
});

test('paged search defaults to first 20 and omits empty category rather than issuing catalogue-only filter', async () => {
  const f = apiFixture(); await f.api.searchPageApi('camp', 'recommendations');
  const params = new URL(f.requests[0].url).searchParams;
  assert.equal(params.get('page'), '1'); assert.equal(params.get('limit'), '20'); assert.equal(params.has('category'), false);
  assert.equal(params.get('q'), 'camp');
});

test('unexpected legacy array, missing results/metadata, wrong page and nonboolean paging fail explicitly for retry', async () => {
  for (const payload of [null, [], {}, { results: [] }, { results: {}, page: 1, hasMore: false }, { results: [], page: 2, hasMore: false }, { results: [], page: '1', hasMore: false }, { results: [], page: 1, hasMore: 'false' }]) {
    const f = apiFixture({ payload });
    await assert.rejects(f.api.searchPageApi('camp', 'trips'), /Unexpected search response/);
  }
});

test('search API failures retain useful server messages, while current-session 401 uses existing logout behavior', async () => {
  const badRequest = apiFixture({ status: 400, payload: { message: 'Query must contain at least 2 characters' } });
  await assert.rejects(badRequest.api.searchPageApi('x', 'trips'), /at least 2 characters/);
  const forbidden = apiFixture({ status: 403, payload: { message: 'You cannot view this trip' } });
  await assert.rejects(forbidden.api.searchPageApi('camp', 'trips'), /cannot view/);
  const expired = apiFixture({ status: 401, payload: { message: 'Session expired' } });
  await assert.rejects(expired.api.searchPageApi('camp', 'trips'), /Session expired/);
  assert.equal(expired.logoutCalls(), 1);
});

test('account transitions during SecureStore lookup do not dispatch a search with newer credentials', async () => {
  const storage = deferred();
  const f = apiFixture({ read: async (key, state) => { await storage.promise; return key === 'auth-token' ? state.token : JSON.stringify(state.user); } });
  const request = f.api.searchPageApi('camp', 'trips'); await tick();
  f.setState({ token: 'new-token', user: { _id: 'new-user' }, sessionEpoch: 2 }); storage.resolve();
  await assert.rejects(request, /Account changed/); assert.equal(f.requests.length, 0);
});

test('legacy search helpers retain array response contract and their existing separate paths', async () => {
  const payload = [{ _id: 'legacy' }], f = apiFixture({ payload });
  assert.equal(await f.api.searchApi('camp', 'trips'), payload);
  assert.equal(await f.api.searchUsersApi('camp', 2, 10), payload);
  const generic = new URL(f.requests[0].url), people = new URL(f.requests[1].url);
  assert.equal(generic.pathname, '/api/v2/search'); assert.equal(generic.searchParams.has('envelope'), false);
  assert.equal(generic.searchParams.get('type'), 'trips'); assert.equal(people.pathname, '/api/v2/search/users');
  assert.equal(people.searchParams.get('page'), '2'); assert.equal(people.searchParams.get('limit'), '10');
});

test('obsolete search guard during SecureStore await blocks dispatch even when account stays the same', async () => {
  const storage = deferred(); let current = true;
  const f = apiFixture({ read: async (key, state) => { await storage.promise; return key === 'auth-token' ? state.token : JSON.stringify(state.user); } });
  const request = f.api.searchPageApi('camp', 'trips', 1, 20, '', () => current); await tick();
  current = false; storage.resolve();
  await assert.rejects(request, /Screen changed/); assert.equal(f.requests.length, 0);
  const alreadyStale = apiFixture();
  await assert.rejects(alreadyStale.api.searchPageApi('camp', 'trips', 1, 20, '', () => false), /Screen changed/);
  assert.equal(alreadyStale.requests.length, 0);
});
