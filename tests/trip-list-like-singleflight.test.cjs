const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('zustand');
const {load, fixture, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const {hooksFixture} = require('./helpers/hooks-fixture.cjs');
const preferences = require('../src/constants/presentationPreferences');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const reply = (data = {}, status = 200) => ({status, ok: status < 400, headers: {get: () => 'application/json'}, json: async () => data});
const actor = {_id: 'actor', username: 'Fixture', token: 'fixture-token'};

// Actual auth, API, shared store, hook, container and card; only native hosts,
// storage and HTTP response scheduling are controlled. No live API/device work.
async function app(options = {}) {
  const storage = new Map(), requests = [];
  let socialStore;
  const SecureStore = {getItemAsync: async key => storage.get(key) || null, setItemAsync: async (key, value) => storage.set(key, value), deleteItemAsync: async key => storage.delete(key)};
  const auth = load('src/stores/auth.js', 'useAuthStore', {...preferences, create, SecureStore, authService: {}, stopActiveRecording: options.stopRecording || (async () => {}), require: () => ({useTripSocialStore: socialStore})});
  const useAuthStore = Object.assign(select => select ? select(auth.getState()) : auth.getState(), auth);
  const api = load('src/services/api.js', '({likeTrip,unlikeTrip})', {
    Constants: {expoConfig: {extra: {API_URL: 'https://fixture.invalid/api'}}}, Updates: {}, SecureStore, getCsrfToken: async () => 'fixture-csrf',
    require: () => ({useAuthStore}), console: {log() {}, warn() {}, error() {}},
    fetch: (url, request) => { const response = deferred(); requests.push({url, request, response}); return response.promise; },
  });
  const social = load('src/stores/tripSocialStore.js', '({useTripSocialStore,getSocialSessionScope})', {...api, create, useAuthStore});
  socialStore = social.useTripSocialStore;
  const useTripSocialStore = Object.assign(select => select ? select(socialStore.getState()) : socialStore.getState(), socialStore);
  await auth.getState().login(actor);
  const prime = (id = 'trip', data = {}) => socialStore.getState().primeCounts({_id: id, likesCount: 0, isLikedByCurrentUser: false, commentsCount: 0, recommendationCount: 0, ...data});
  prime();
  function card(id = 'trip') {
    const host = hooksFixture(), trip = {_id: id, likesCount: 0, isLikedByCurrentUser: false};
    const useTripSocial = load('src/hooks/useTripSocial.js', 'useTripSocial', {React: {useEffect: host.hooks.useEffect}, useAuthStore, useTripSocialStore, getSocialSessionScope: social.getSocialSessionScope});
    const container = fixture('src/components/TripCardContainer.js', 'TripCardContainer', {trip, primeOnMount: false, onOpenSheet() {}}, {
      useTripSocial, TripCard: 'TripCard', useViewerUnits: () => "metric", speedUnit: () => "km/h", calcAvgSpeed: () => '', isoToDate: () => '', kmOrMiles: () => '', msToDuration: () => '', lineStringToCoords: () => [],
    });
    const props = () => host.render(() => container.render()).props;
    const render = () => fixture('src/components/TripCard.js', 'TripCard', props(), {...native, theme, StyleSheet: {create: value => value}, Feather: 'Feather', JourneyShareAction: 'JourneyShareAction', UserHeader: 'UserHeader', TransportIcon: 'TransportIcon', TripMapThumbnail: 'TripMapThumbnail'}).render();
    const heart = () => nodes(render(), 'TouchableOpacity').find(node => node.props.accessibilityLabel?.endsWith(' trip'));
    return {props, heart, press: () => heart().props.onPress({stopPropagation() {}}), unmount: host.unmount};
  }
  return {auth, store: socialStore, requests, prime, card, state: (id = 'trip') => socialStore.getState().trips[id]};
}

test('actual repeated cards share a disabled heart; even pre-render duplicate presses cannot reverse HTTP order', async () => {
  const f = await app(), first = f.card(), second = f.card();
  const stalePress = first.heart().props.onPress;
  stalePress({stopPropagation() {}}); stalePress({stopPropagation() {}});
  second.press(); await tick();
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].request.method, 'POST');
  assert.equal(f.state().isLikedByCurrentUser, true); assert.equal(f.state().likesCount, 1);
  for (const card of [first, second]) {
    const heart = card.heart(); assert.equal(heart.props.disabled, true);
    assert.equal(heart.props.accessibilityState.busy, true);
  }
  first.unmount(); const remounted = f.card(); remounted.press(); await tick(); assert.equal(f.requests.length, 1);
  f.requests[0].response.resolve(reply({likesCount: 1})); await tick();
  assert.equal(second.heart().props.disabled, false);
  second.press(); await tick(); assert.equal(f.requests.length, 2); assert.equal(f.requests[1].request.method, 'DELETE');
  assert.equal(f.state().isLikedByCurrentUser, false); assert.equal(f.state().likesCount, 0);
  f.requests[1].response.resolve(reply({likesCount: 0})); await tick(); assert.equal(remounted.heart().props.disabled, false);
  second.unmount(); remounted.unmount();
});

test('different trips have independent single-flight locks', async () => {
  const f = await app(); f.prime('other');
  const first = f.store.getState().toggleLike('trip'), second = f.store.getState().toggleLike('other');
  await tick(); assert.equal(f.requests.length, 2);
  f.requests[1].response.resolve(reply()); await second;
  assert.equal(f.state('other').likePending, false); assert.equal(f.state().likePending, true);
  f.requests[0].response.resolve(reply()); await first;
});

for (const failure of ['http', 'transport']) test(`${failure} failure releases the shared lock without replay and preserves unrelated fields`, async () => {
  const f = await app(), old = f.store.getState().toggleLike('trip');
  await tick(); await f.store.getState().toggleLike('trip');
  f.store.getState().setCommentCount('trip', 4); f.store.getState().setRecCount('trip', 2);
  if (failure === 'http') f.requests[0].response.resolve(reply({message: 'Fixture failure'}, 503));
  else f.requests[0].response.reject(Error('Response lost'));
  await old; await tick();
  assert.equal(f.requests.length, 1, 'an ambiguous failure must not automatically replay any mutation');
  assert.equal(f.state().likePending, false); assert.equal(f.state().isLikedByCurrentUser, false); assert.equal(f.state().likesCount, 0);
  assert.equal(f.state().commentsCount, 4); assert.equal(f.state().recommendationCount, 2);
  const retry = f.store.getState().toggleLike('trip'); await tick(); assert.equal(f.requests.length, 2);
  f.requests[1].response.resolve(reply()); await retry; assert.equal(f.state().likePending, false);
});

test('fresh snapshots retain revision ownership but cannot re-enable another pending card', async () => {
  const f = await app(), old = f.store.getState().toggleLike('trip'); await tick();
  f.prime('trip', {likesCount: 7, isLikedByCurrentUser: true, commentsCount: 4});
  const revision = f.state().likeRevision;
  assert.equal(f.card().heart().props.disabled, true);
  await f.store.getState().toggleLike('trip'); assert.equal(f.requests.length, 1);
  f.requests[0].response.resolve(reply({message: 'Older failure'}, 503)); await old;
  assert.equal(f.state().likeRevision, revision); assert.equal(f.state().likesCount, 7); assert.equal(f.state().commentsCount, 4);
  assert.equal(f.state().likePending, false);
});

for (const oldFails of [false, true]) test(`reset isolates a new same-trip lock from old ${oldFails ? 'failure' : 'success'}`, async () => {
  const f = await app(), old = f.store.getState().toggleLike('trip'); await tick();
  f.store.getState().reset(); f.prime(); const newer = f.store.getState().toggleLike('trip'); await tick();
  assert.equal(f.requests.length, 2);
  f.requests[0].response.resolve(reply({}, oldFails ? 503 : 200)); await old;
  assert.equal(f.state().likePending, true); assert.equal(f.state().isLikedByCurrentUser, true);
  await f.store.getState().toggleLike('trip'); assert.equal(f.requests.length, 2);
  f.requests[1].response.resolve(reply()); await newer; assert.equal(f.state().likePending, false);
});

test('logout blocks stale card presses as soon as the session transition starts', async () => {
  const stopped = deferred(), f = await app({stopRecording: () => stopped.promise}), card = f.card();
  const oldPress = card.heart().props.onPress, old = f.store.getState().toggleLike('trip'); await tick();
  const logout = f.auth.getState().logout();
  oldPress({stopPropagation() {}}); await f.store.getState().toggleLike('trip'); await tick();
  assert.equal(card.heart().props.disabled, true); assert.equal(f.requests.length, 1);
  f.requests[0].response.resolve(reply({}, 503)); await old;
  stopped.resolve(); await logout; assert.equal(Object.keys(f.store.getState().trips).length, 0);
  oldPress({stopPropagation() {}}); await tick(); assert.equal(f.requests.length, 1); card.unmount();
});

for (const replacement of ['same credentials', 'different account']) test(`${replacement} receives a new scope; old handlers and completion cannot touch its lock`, async () => {
  const f = await app(), card = f.card(), oldPress = card.heart().props.onPress;
  const old = f.store.getState().toggleLike('trip'); await tick();
  await f.auth.getState().login(replacement === 'same credentials' ? actor : {...actor, _id: 'other', token: 'other-token'});
  f.prime(); oldPress({stopPropagation() {}}); await tick(); assert.equal(f.requests.length, 1);
  const newer = f.store.getState().toggleLike('trip'); await tick(); assert.equal(f.requests.length, 2);
  f.requests[0].response.resolve(reply({}, 503)); await old; assert.equal(f.state().likePending, true);
  f.requests[1].response.resolve(reply()); await newer; assert.equal(f.state().likePending, false); assert.equal(f.state().likesCount, 1);
  card.unmount();
});

test('trip deletion prevents old completion from restoring it without disrupting another trip lock', async () => {
  const f = await app(); f.prime('other');
  const first = f.store.getState().toggleLike('trip'), second = f.store.getState().toggleLike('other'); await tick();
  f.store.getState().invalidateDeletedTrip('trip');
  f.requests[0].response.resolve(reply({}, 503)); await first; assert.equal(f.state(), undefined);
  await f.store.getState().toggleLike('trip'); await f.store.getState().toggleLike('other'); assert.equal(f.requests.length, 2);
  f.requests[1].response.resolve(reply({}, 503)); await second;
  assert.equal(f.state('other').likePending, false); assert.equal(f.state('other').isLikedByCurrentUser, false);
});
