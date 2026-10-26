const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, nodes, native } = require('./helpers/component-fixture.cjs');
const { hooksFixture, authFixture } = require('./helpers/hooks-fixture.cjs');
const { createPagedList } = load('src/utils/pagedList.js', '({createPagedList})');
const theme = load('src/theme.js', 'theme');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const ids = list => Array.from(list.props.data, item => item._id);
const flattenStyle = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));

// Execute the real screen, list/context hooks and store with native rendering
// mocked. This proves JS interaction/state contracts, not device touch/layout.
function feedScreen({ following = async () => ({ items: [] }), discover = async () => ({ items: [], totalPages: 0 }) } = {}) {
  const host = hooksFixture(), auth = authFixture(), requests = [], primed = [], routes = [];
  const follow = load('src/utils/followActions.js', '({createFollowActions,getFollowRevision,subscribeFollowChanges})');
  const useProfileContext = load('src/hooks/useProfileContext.js', 'useProfileContext', { ...host.hooks, useAuthStore: auth.store });
  const useProfileList = load('src/hooks/useProfileList.js', 'useProfileList', {
    ...host.hooks, useProfileContext, createPagedList, useTripSocialStore: selector => selector({ deletionRevision: 0 }),
  });
  const primeCounts = item => primed.push(item._id);
  const screen = fixture('app/(tabs)/feed/index.js', 'FeedScreen', {}, {
    ...native, ...host.hooks, ...follow, theme, StyleSheet: { create: x => x }, useProfileList, useAuthStore: auth.store,
    getFeedTripJson: (...args) => { requests.push(['following', ...args]); return following(...args); },
    getDiscoverTripJson: (...args) => { requests.push(['discover', ...args]); return discover(...args); },
    useTripSocialStore: () => ({ primeCounts }), useRouter: () => ({ push: path => routes.push(path) }),
    RefreshControl: 'RefreshControl', ProfileListStatus: 'ProfileListStatus', TripCardContainer: 'TripCardContainer',
    CommentsSheet: 'CommentsSheet', LikersSheet: 'LikersSheet', RecommendationsSheet: 'RecommendationsSheet',
  });
  const render = () => host.render(() => screen.render());
  const tabs = () => nodes(render(), 'Pressable');
  return { host, auth, requests, primed, routes, ...follow, render, tabs,
    select(mode) { tabs()[mode === 'discover' ? 1 : 0].props.onPress(); return render(); },
    list: () => nodes(render(), 'FlatList')[0],
  };
}

test('Discover selector is above the existing list, defaults to Following and uses the app blue with accessible selection', async () => {
  const screen = feedScreen({ following: async () => ({ items: [{ _id: 'followed', user: { _id: 'author' } }] }) });
  let tree = screen.render();
  assert.equal(tree.children[0].props.accessibilityRole, 'tablist');
  assert.equal(tree.children[1].type, 'FlatList');
  const [following, discover] = screen.tabs();
  assert.equal(following.children[0].children[0], 'Following');
  assert.equal(discover.children[0].children[0], 'Discover');
  assert.equal(following.props.accessibilityRole, 'tab');
  assert.equal(following.props.accessibilityState.selected, true);
  assert.equal(discover.props.accessibilityState.selected, false);
  assert.equal(flattenStyle(following.props.style).backgroundColor, theme.colors.primary);
  assert.equal(flattenStyle(following.children[0].props.style).color, theme.colors.inputBackground);
  assert.ok(flattenStyle(following.props.style).minHeight >= 44);
  await tick();
  assert.deepEqual(screen.requests, [['following', 1, 10]]);
  screen.select('following'); await tick();
  assert.equal(screen.requests.length, 1);
  const list = screen.list(), item = list.props.data[0], card = list.props.renderItem({ item });
  assert.equal(card.type, 'TripCardContainer');
  assert.equal(card.props.trip, item);
  assert.equal(card.props.user, item.user);
  card.props.onPress();
  assert.deepEqual(screen.routes, ['/trip/followed']);
});

test('switching modes clears prior cards and sheets immediately, resets list scroll identity and shows loading then public cards', async () => {
  const pending = deferred();
  const screen = feedScreen({ following: async () => ({ items: [{ _id: 'followers-only' }] }), discover: () => pending.promise });
  screen.render(); await tick();
  let list = screen.list(), previousKey = list.props.key;
  list.props.renderItem({ item: list.props.data[0] }).props.onOpenSheet('comments', list.props.data[0]);
  assert.equal(nodes(screen.render(), 'CommentsSheet')[0].props.visible, true);
  screen.select('discover'); list = screen.list();
  assert.deepEqual(ids(list), []);
  assert.notEqual(list.props.key, previousKey);
  assert.equal(list.props.ListEmptyComponent.props.loading, true);
  assert.equal(nodes(screen.render(), 'CommentsSheet')[0].props.visible, false);
  assert.equal(screen.tabs()[1].props.accessibilityState.selected, true);
  await tick();
  pending.resolve({ items: [{ _id: 'stranger-public' }, { _id: 'followed-public' }], totalPages: 1 }); await tick();
  assert.deepEqual(ids(screen.list()), ['stranger-public', 'followed-public']);
  screen.select('discover'); await tick();
  assert.deepEqual(screen.requests, [['following', 1, 10], ['discover', 1, 10]]);
  screen.select('following'); assert.deepEqual(ids(screen.list()), []); await tick();
  assert.deepEqual(ids(screen.list()), ['followers-only']);
  assert.equal(nodes(screen.render(), 'CommentsSheet')[0].props.visible, false);
  assert.deepEqual(screen.requests.at(-1), ['following', 1, 10]);
});

test('Discover works with no follows and paginates once per page using server totals; ordinary focus retains its cache', async () => {
  const pending = deferred();
  const screen = feedScreen({ discover: page => page === 1 ? { items: [{ _id: 'one' }], totalPages: 2 } : pending.promise });
  screen.render(); await tick(); assert.deepEqual(ids(screen.list()), []);
  screen.select('discover'); await tick();
  let list = screen.list(); const a = list.props.onEndReached(), b = list.props.onEndReached();
  assert.equal(a, b); await tick();
  assert.deepEqual(screen.requests, [['following', 1, 10], ['discover', 1, 10], ['discover', 2, 10]]);
  pending.resolve({ items: [{ _id: 'one', title: 'latest' }, { _id: 'two' }, { _id: 'two' }], totalPages: 2 }); await a;
  assert.deepEqual(ids(screen.list()), ['one', 'two']);
  assert.equal(screen.list().props.data[0].title, 'latest');
  await screen.list().props.onEndReached(); assert.equal(screen.requests.length, 3);
  const key = screen.list().props.key;
  screen.host.blur(); screen.host.focus(); await tick();
  assert.deepEqual(ids(screen.list()), ['one', 'two']);
  assert.equal(screen.list().props.key, key); assert.equal(screen.requests.length, 3);
});

test('Discover pull refresh and trip-detail return replace the active page, including visibility changes and retry after errors', async () => {
  let items = [{ _id: 'public-trip', user: { _id: 'stranger' } }], fail = false;
  const screen = feedScreen({ discover: async () => { if (fail) throw Error('offline'); return { items, totalPages: items.length ? 1 : 0 }; } });
  screen.render(); await tick(); screen.select('discover'); await tick();
  let list = screen.list(), item = list.props.data[0];
  const card = list.props.renderItem({ item });
  assert.equal(card.type, 'TripCardContainer'); assert.equal(card.props.trip, item); assert.equal(card.props.user, item.user);
  card.props.onPress(); screen.host.blur(); items = []; screen.host.focus(); await tick();
  assert.deepEqual(screen.routes, ['/trip/public-trip']);
  assert.deepEqual(ids(screen.list()), []);
  assert.equal(screen.list().props.ListEmptyComponent.props.emptyMessage, 'No public trips to discover yet.');
  assert.deepEqual(screen.requests.at(-1), ['discover', 1, 10]);
  fail = true; await screen.list().props.refreshControl.props.onRefresh();
  assert.match(screen.list().props.ListEmptyComponent.props.error, /offline/);
  const count = screen.requests.length;
  screen.host.blur(); screen.host.focus(); await screen.list().props.onEndReached(); assert.equal(screen.requests.length, count);
  fail = false; items = [{ _id: 'new-public' }]; await screen.list().props.ListEmptyComponent.props.onRetry();
  assert.deepEqual(ids(screen.list()), ['new-public']);
  items = []; const refresh = screen.list().props.refreshControl.props.onRefresh();
  assert.equal(screen.list().props.refreshControl.props.refreshing, true);
  await refresh; assert.deepEqual(ids(screen.list()), []);
  assert.equal(screen.list().props.refreshControl.props.refreshing, false);
});

test('late responses and errors from either old mode cannot populate or prime the current mode after rapid switches', async () => {
  for (const rejectOld of [false, true]) {
    const oldFollowing = deferred(), oldDiscover = deferred(); let followingCalls = 0;
    const screen = feedScreen({
      following: () => ++followingCalls === 1 ? oldFollowing.promise : { items: [{ _id: 'current-following' }] },
      discover: () => oldDiscover.promise,
    });
    screen.render(); await tick(); screen.select('discover'); await tick(); screen.select('following'); await tick();
    assert.deepEqual(ids(screen.list()), ['current-following']);
    if (rejectOld) { oldFollowing.reject(Error('old following error')); oldDiscover.reject(Error('old discover error')); }
    else { oldFollowing.resolve({ items: [{ _id: 'old-private' }] }); oldDiscover.resolve({ items: [{ _id: 'old-public' }], totalPages: 1 }); }
    await tick();
    const list = screen.list(); assert.deepEqual(ids(list), ['current-following']);
    assert.equal(list.props.ListFooterComponent, null);
    assert.equal(screen.primed.includes('old-private'), false); assert.equal(screen.primed.includes('old-public'), false);
  }
});

test('pending Discover pagination and queued refresh stay isolated when switching back to Following', async () => {
  const pending = deferred(); let discoverFirstPages = 0;
  const screen = feedScreen({
    following: async () => ({ items: [{ _id: 'following' }] }),
    discover: page => page === 2 ? pending.promise : { items: [{ _id: `public-${++discoverFirstPages}` }], totalPages: 2 },
  });
  screen.render(); await tick(); screen.select('discover'); await tick();
  const pagination = screen.list().props.onEndReached(); await tick();
  const refresh = screen.list().props.refreshControl.props.onRefresh();
  screen.select('following'); await tick();
  pending.resolve({ items: [{ _id: 'stale-public-page' }], totalPages: 2 }); await pagination; await refresh;
  assert.deepEqual(ids(screen.list()), ['following']);
  assert.equal(screen.primed.includes('stale-public-page'), false);
  screen.select('discover'); assert.deepEqual(ids(screen.list()), []); await tick();
  assert.deepEqual(ids(screen.list()), ['public-3']);
});

test('account replacement and same-token relogin reset to Following and discard pending Discover state', async () => {
  for (const sameLogin of [false, true]) {
    const pending = deferred();
    const screen = feedScreen({ following: async () => ({ items: [{ _id: 'following' }] }), discover: () => pending.promise });
    screen.render(); await tick(); screen.select('discover'); await tick();
    const oldKey = screen.list().props.key;
    if (sameLogin) { screen.auth.set({ token: null, user: null }); screen.auth.set({ token: 'session-one', user: { _id: 'actor' } }); }
    else screen.auth.set({ token: 'session-two', user: { _id: 'another-account' } });
    let list = screen.list(); assert.deepEqual(ids(list), []); assert.notEqual(list.props.key, oldKey);
    assert.equal(screen.tabs()[0].props.accessibilityState.selected, true);
    await tick(); pending.resolve({ items: [{ _id: 'old-session-public' }], totalPages: 1 }); await tick();
    assert.deepEqual(ids(screen.list()), ['following']); assert.equal(screen.primed.includes('old-session-public'), false);
    assert.deepEqual(screen.requests.at(-1), ['following', 1, 10]);
  }
});

test('Following invalidation remains active after using Discover; Discover itself is independent of follows', async () => {
  let following = false;
  const screen = feedScreen({ following: async () => ({ items: following ? [{ _id: 'followed' }] : [] }), discover: async () => ({ items: [{ _id: 'public' }], totalPages: 1 }) });
  screen.render(); await tick(); screen.select('discover'); await tick();
  await screen.createFollowActions({ context: { userId: 'actor', isCurrent: () => true }, follow: async () => { following = true; }, onChange: async () => {} }).toggle('other', false);
  screen.render(); await tick(); assert.equal(screen.requests.length, 2); assert.deepEqual(ids(screen.list()), ['public']);
  screen.select('following'); await tick(); assert.deepEqual(ids(screen.list()), ['followed']);
  await screen.createFollowActions({ context: { userId: 'actor', isCurrent: () => true }, unfollow: async () => { following = false; }, onChange: async () => {} }).toggle('other', true);
  assert.deepEqual(ids(screen.list()), []); await tick(); assert.deepEqual(ids(screen.list()), []);
  assert.deepEqual(screen.requests.at(-1), ['following', 1, 10]);
});

test('Discover helper uses the separate authenticated GET endpoint and preserves server pagination/card data', async () => {
  const calls = [], state = { token: 'fixture-token', user: { _id: 'fixture-user' }, sessionEpoch: 1, isSessionChanging: false };
  const result = { items: [{ _id: 'fixture-trip', user: { _id: 'fixture-author' } }], page: 3, limit: 10, totalPages: 4, totalCount: 31 };
  const api = load('src/services/api.js', '({getDiscoverTripJson,getFeedTripJson})', {
    Constants: { expoConfig: { extra: { API_URL: 'https://fixture.invalid/api', APP_ENV: 'test' } } }, Updates: {}, console: { log() {}, error() {} },
    require: () => ({ useAuthStore: { getState: () => state } }),
    SecureStore: { getItemAsync: async key => key === 'auth-token' ? state.token : JSON.stringify(state.user) },
    fetch: async (url, options) => { calls.push({ url, options }); return { status: 200, ok: true, headers: { get: () => 'application/json' }, json: async () => result }; },
  });
  assert.equal(await api.getDiscoverTripJson(3, 10), result);
  assert.equal(calls[0].url, 'https://fixture.invalid/api/v2/trips/json/discover?page=3&limit=10');
  assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-token');
  await api.getFeedTripJson();
  assert.equal(calls[1].url, 'https://fixture.invalid/api/v2/trips/json/feed?page=1&limit=10');
});
