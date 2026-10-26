const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, nodes, native } = require('./helpers/component-fixture.cjs');
const { hooksFixture, authFixture } = require('./helpers/hooks-fixture.cjs');
const theme = load('src/theme.js', 'theme');
const categories = load('src/constants/recommendationConstants.js', '({RECOMMENDATION_CATEGORIES,getRecommendationCategoryLabel})');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const ids = list => Array.from(list.props.data, item => item._id);
const textOf = node => typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
const flattenStyle = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const reply = (results = [], hasMore = false) => ({ results, hasMore });

function fakeTimers() {
  let now = 0, next = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) { const id = ++next; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const pending = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!pending) break;
        const [id, timer] = pending; timers.delete(id); now = timer.at; timer.callback();
      }
      now = target;
    },
    count: () => timers.size,
  };
}

// Execute actual search screen, context hook, search hook and list controller.
// Native layout/touch, platform keyboard and screen reader behavior are mocked.
function searchScreen(search = async () => reply()) {
  const host = hooksFixture(), auth = authFixture(), timers = fakeTimers();
  const requests = [], routes = [], primed = [], keyboard = [];
  const follow = load('src/utils/followActions.js', '({createFollowActions,getFollowRevision,subscribeFollowChanges})');
  const createSearchList = load('src/utils/searchList.js', 'createSearchList', timers);
  const useProfileContext = load('src/hooks/useProfileContext.js', 'useProfileContext', { ...host.hooks, useAuthStore: auth.store });
  const social = { deletionRevision: 0, primeCounts: item => primed.push(item) };
  const useTripSocialStore = selector => selector(social);
  const useSearchResults = load('src/hooks/useSearchResults.js', 'useSearchResults', {
    ...host.hooks, ...follow, useProfileContext, useTripSocialStore, createSearchList,
    searchPageApi: (...args) => { requests.push(args.slice(0, 5)); return search(...args); },
  });
  const screen = fixture('app/search/index.js', 'SearchScreen', {}, {
    ...native, ...host.hooks, ...categories, theme, StyleSheet: { create: x => x }, useProfileContext, useSearchResults, useTripSocialStore,
    useRouter: () => ({ push: path => routes.push(path) }), Keyboard: { dismiss: () => keyboard.push('dismiss') },
    Feather: 'Feather', UserHeader: 'UserHeader', RefreshControl: 'RefreshControl', ProfileListStatus: 'ProfileListStatus',
    TripCardContainer: 'TripCardContainer', RecommendationCard: 'RecommendationCard', BottomModal: 'BottomModal', ModalHeader: 'ModalHeader',
    RecommendationDetailModal: 'RecommendationDetailModal', CommentsSheet: 'CommentsSheet', LikersSheet: 'LikersSheet', RecommendationsSheet: 'RecommendationsSheet',
  });
  const render = () => host.render(() => screen.render());
  const input = () => nodes(render(), 'TextInput')[0];
  const tabs = () => nodes(render(), 'Pressable').filter(node => node.props.accessibilityRole === 'tab');
  const find = label => nodes(render(), 'Pressable').find(node => node.props.accessibilityLabel === label);
  const result = {
    host, auth, timers, requests, routes, primed, keyboard, social, ...follow, render, input, tabs, find,
    list: () => nodes(render(), 'FlatList')[0],
    setQuery(value) { input().props.onChangeText(value); return render(); },
    select(type) { tabs()[['trips', 'recommendations', 'users'].indexOf(type)].props.onPress(); return render(); },
    setCategory(category) {
      find('Choose recommendation category').props.onPress();
      nodes(render(), 'Pressable').find(node => node.props.accessibilityRole === 'radio' && node.props.key === category).props.onPress();
      return render();
    },
    async advance(ms = 400) { timers.advance(ms); await tick(); return render(); },
    async submit() { input().props.onSubmitEditing(); await tick(); return render(); },
  };
  return result;
}

test('search defaults to Trips with one accessible input, existing theme and no blank/category-only request', async () => {
  const screen = searchScreen();
  assert.equal(nodes(screen.render(), 'TextInput').length, 1);
  assert.deepEqual(screen.tabs().map(textOf), ['Trips', 'Recommendations', 'People']);
  assert.equal(screen.tabs()[0].props.accessibilityState.selected, true);
  assert.equal(flattenStyle(screen.tabs()[0].props.style).backgroundColor, theme.colors.primary);
  assert.ok(screen.tabs().every(tab => flattenStyle(tab.props.style).minHeight >= 44));
  assert.equal(screen.input().props.returnKeyType, 'search');
  assert.equal(screen.input().props.maxLength, 120);
  assert.equal(screen.input().props.accessibilityLabel, 'Search trips');
  await screen.advance();
  assert.deepEqual(screen.requests, []);
  assert.equal(screen.list().props.ListEmptyComponent.props.loading, false);
  assert.match(screen.list().props.ListEmptyComponent.props.emptyMessage, /at least 2 characters/);
  screen.setQuery(' x '); await screen.advance(); assert.deepEqual(screen.requests, []);
  screen.setQuery('   '); screen.select('recommendations'); screen.setCategory('WILD_SPOT'); await screen.advance();
  assert.deepEqual(screen.requests, []);
  assert.equal(screen.list().props.refreshControl, undefined);
});

test('typing is trimmed, debounced 400ms and only the newest eligible query is fetched without empty flash', async () => {
  const pending = deferred();
  const screen = searchScreen(() => pending.promise);
  screen.render(); screen.setQuery('ca');
  assert.equal(screen.list().props.ListEmptyComponent.props.loading, true);
  await screen.advance(399); assert.equal(screen.requests.length, 0);
  screen.setQuery('  camp  '); await screen.advance(399); assert.equal(screen.requests.length, 0);
  await screen.advance(1);
  assert.deepEqual(screen.requests, [['camp', 'trips', 1, 20, '']]);
  assert.equal(screen.list().props.ListEmptyComponent.props.loading, true);
  pending.resolve(reply()); await tick();
  assert.equal(screen.list().props.ListEmptyComponent.props.loading, false);
  assert.equal(screen.list().props.ListEmptyComponent.props.emptyMessage, 'No trips found.');
  assert.equal(screen.input().props.value, '  camp  ');
});

test('keyboard Search bypasses pending debounce once; clear immediately removes results and does not query blank', async () => {
  const screen = searchScreen(async () => reply([{ _id: 'trip' }]));
  screen.render(); screen.setQuery('camp'); await screen.submit();
  assert.equal(screen.requests.length, 1); assert.equal(screen.timers.count(), 0);
  assert.deepEqual(ids(screen.list()), ['trip']);
  await screen.submit(); await screen.advance(); assert.equal(screen.requests.length, 1);
  const clear = screen.find('Clear search');
  assert.ok(flattenStyle(clear.props.style).minHeight >= 44);
  clear.props.onPress();
  assert.equal(screen.input().props.value, ''); assert.deepEqual(ids(screen.list()), []);
  await screen.advance(); await screen.submit(); assert.equal(screen.requests.length, 1);
  assert.ok(screen.keyboard.length >= 2);
});

test('tabs retain query, fetch only selected type and hide old cards and sheets immediately', async () => {
  const screen = searchScreen(async (_query, type) => reply([{ _id: type, user: { _id: 'author' }, username: 'Camper' }]));
  screen.render(); screen.setQuery('camp'); await screen.advance();
  let list = screen.list(), key = list.props.key, card = list.props.renderItem({ item: list.props.data[0] });
  card.props.onOpenSheet('comments', list.props.data[0]);
  assert.equal(nodes(screen.render(), 'CommentsSheet')[0].props.visible, true);
  screen.select('users');
  assert.equal(screen.input().props.value, 'camp'); assert.equal(screen.input().props.accessibilityLabel, 'Search people');
  assert.deepEqual(ids(screen.list()), []); assert.notEqual(screen.list().props.key, key);
  assert.equal(nodes(screen.render(), 'CommentsSheet')[0].props.visible, false);
  assert.equal(screen.list().props.ListEmptyComponent.props.loading, true);
  await screen.advance(); assert.deepEqual(ids(screen.list()), ['users']);
  assert.deepEqual(screen.requests.map(args => args[1]), ['trips', 'users']);
  screen.select('users'); await screen.advance(); assert.equal(screen.requests.length, 2);
  screen.select('recommendations'); await screen.advance();
  assert.deepEqual(screen.requests.map(args => args[1]), ['trips', 'users', 'recommendations']);
  assert.equal(screen.input().props.value, 'camp');
});

test('category chooser uses enum-friendly labels, one filter and retains selection across tabs', async () => {
  const screen = searchScreen();
  screen.render(); screen.setQuery('camp'); screen.select('recommendations');
  screen.find('Choose recommendation category').props.onPress();
  assert.equal(nodes(screen.render(), 'BottomModal')[0].props.visible, true);
  const choices = nodes(screen.render(), 'Pressable').filter(node => node.props.accessibilityRole === 'radio');
  assert.deepEqual(choices.map(textOf), ['All categories', ...Array.from(categories.RECOMMENDATION_CATEGORIES, option => option.label)]);
  assert.ok(choices.every(choice => flattenStyle(choice.props.style).minHeight >= 44));
  nodes(screen.render(), 'ModalHeader')[0].props.onClose();
  assert.equal(nodes(screen.render(), 'BottomModal')[0].props.visible, false);
  screen.setCategory('WILD_SPOT');
  assert.equal(textOf(screen.find('Choose recommendation category')), 'Category: Wild Spot');
  assert.equal(nodes(screen.render(), 'BottomModal')[0].props.visible, false);
  await screen.advance();
  assert.deepEqual(screen.requests, [['camp', 'recommendations', 1, 20, 'WILD_SPOT']]);
  assert.equal(screen.list().props.ListEmptyComponent.props.emptyMessage, 'No recommendations found in this category.');
  screen.select('trips'); await screen.advance(); assert.deepEqual(screen.requests.at(-1), ['camp', 'trips', 1, 20, '']);
  screen.select('recommendations'); await screen.advance(); assert.deepEqual(screen.requests.at(-1), ['camp', 'recommendations', 1, 20, 'WILD_SPOT']);
  screen.setCategory(''); await screen.advance(); assert.deepEqual(screen.requests.at(-1), ['camp', 'recommendations', 1, 20, '']);
});

test('pagination deduplicates cards, single-flights repeated scroll and stops at hasMore=false', async () => {
  const page2 = deferred();
  const screen = searchScreen((_query, _type, page) => page === 1 ? reply([{ _id: 'one' }], true) : page2.promise);
  screen.render(); screen.setQuery('camp'); await screen.advance();
  const list = screen.list(), first = list.props.onEndReached(), second = list.props.onEndReached();
  assert.equal(first, second); await tick();
  assert.equal(screen.list().props.ListFooterComponent.type, 'ActivityIndicator');
  assert.deepEqual(screen.requests.map(args => args[2]), [1, 2]);
  page2.resolve(reply([{ _id: 'one', title: 'latest' }, { _id: 'two' }, { _id: 'two' }])); await first;
  assert.deepEqual(ids(screen.list()), ['one', 'two']);
  assert.equal(screen.list().props.data[0].title, 'latest');
  await screen.list().props.onEndReached(); assert.equal(screen.requests.length, 2);
  assert.equal(screen.list().props.ListFooterComponent, null);
});

test('first-page and later-page errors expose retry without auto-loop; later retry keeps previous rows and page number', async () => {
  let failFirst = true, failSecond = true;
  const screen = searchScreen((_q, _type, page) => {
    if (page === 1 && failFirst) throw Error('First page offline');
    if (page === 2 && failSecond) throw Error('Second page offline');
    return reply([{ _id: `page-${page}` }], page === 1);
  });
  screen.render(); screen.setQuery('camp'); await screen.advance();
  assert.match(screen.list().props.ListEmptyComponent.props.error, /First page offline/);
  await screen.list().props.onEndReached(); assert.equal(screen.requests.length, 1);
  failFirst = false; await screen.list().props.ListEmptyComponent.props.onRetry();
  assert.deepEqual(ids(screen.list()), ['page-1']);
  await screen.list().props.onEndReached(); assert.deepEqual(ids(screen.list()), ['page-1']);
  assert.match(screen.list().props.ListFooterComponent.props.error, /Second page offline/);
  await screen.list().props.onEndReached(); assert.equal(screen.requests.length, 3);
  failSecond = false; await screen.list().props.ListFooterComponent.props.onRetry();
  assert.deepEqual(ids(screen.list()), ['page-1', 'page-2']);
  assert.deepEqual(screen.requests.map(args => args[2]), [1, 1, 2, 2]);
});

test('rapid query A-B-A, tab and category changes reject every late old success/error and do not prime old cards', async () => {
  for (const fail of [false, true]) {
    const oldA = deferred(), oldB = deferred(), oldPeople = deferred(), oldCategory = deferred();
    let callsA = 0;
    const screen = searchScreen((query, type, _page, _limit, category) => {
      if (type === 'users') return oldPeople.promise;
      if (type === 'recommendations' && !category) return oldCategory.promise;
      if (query === 'alpha' && type === 'trips' && ++callsA === 1) return oldA.promise;
      if (query === 'beta') return oldB.promise;
      return reply([{ _id: 'current', user: { _id: 'author' } }]);
    });
    screen.render(); screen.setQuery('alpha'); await screen.advance(); screen.setQuery('beta'); await screen.advance();
    screen.setQuery('alpha'); await screen.advance(); assert.deepEqual(ids(screen.list()), ['current']);
    screen.select('users'); await screen.advance(); screen.select('recommendations'); await screen.advance();
    screen.setCategory('CAFE'); await screen.advance(); assert.deepEqual(ids(screen.list()), ['current']);
    for (const pending of [oldA, oldB, oldPeople, oldCategory]) fail ? pending.reject(Error('stale error')) : pending.resolve(reply([{ _id: 'stale-private' }]));
    await tick();
    assert.deepEqual(ids(screen.list()), ['current']); assert.equal(screen.list().props.ListFooterComponent, null);
    assert.equal(screen.primed.some(item => item._id === 'stale-private'), false);
  }
});

test('short query/clear suppress stale results and errors while cancelling pending timers', async () => {
  for (const clear of [false, true]) {
    const pending = deferred();
    const screen = searchScreen(() => pending.promise);
    screen.render(); screen.setQuery('camp'); await screen.advance();
    clear ? screen.find('Clear search').props.onPress() : screen.setQuery(' x ');
    assert.deepEqual(ids(screen.list()), []);
    pending.reject(Error('old failure')); await tick();
    assert.equal(screen.list().props.ListEmptyComponent.props.error, null);
    assert.equal(screen.list().props.ListEmptyComponent.props.loading, false);
    screen.setQuery('next'); screen.setQuery(''); await screen.advance(); assert.equal(screen.requests.length, 1);
  }
});

test('account replacement, changing-session state and same-token logout/login reset draft and suppress pending requests', async () => {
  for (const transition of ['replace', 'same-login', 'changing']) {
    const pending = deferred();
    const screen = searchScreen(() => pending.promise);
    screen.render(); screen.setQuery('camp'); screen.select('recommendations'); screen.setCategory('CAFE'); await screen.advance();
    const oldKey = screen.list().props.key;
    if (transition === 'replace') screen.auth.set({ token: 'session-two', user: { _id: 'other' } });
    if (transition === 'same-login') { screen.auth.set({ token: null, user: null }); screen.auth.set({ token: 'session-one', user: { _id: 'actor' } }); }
    if (transition === 'changing') screen.auth.set({ token: 'session-one', user: { _id: 'actor' }, sessionEpoch: 1, isSessionChanging: true });
    assert.equal(screen.input().props.value, ''); assert.equal(screen.tabs()[0].props.accessibilityState.selected, true);
    assert.notEqual(screen.list().props.key, oldKey); assert.deepEqual(ids(screen.list()), []);
    pending.resolve(reply([{ _id: 'old-account' }])); await tick(); await screen.advance();
    assert.deepEqual(ids(screen.list()), []); assert.equal(screen.requests.length, 1);
  }
});

test('unmount before debounce dispatch and during pending response cancels list lifetime without priming', async () => {
  const pending = deferred();
  const screen = searchScreen(() => pending.promise);
  screen.render(); screen.setQuery('camp'); screen.host.unmount(); await screen.advance();
  assert.equal(screen.requests.length, 0); assert.equal(screen.timers.count(), 0);
  const running = searchScreen(() => pending.promise);
  running.render(); running.setQuery('camp'); await running.advance(); running.host.unmount();
  pending.resolve(reply([{ _id: 'late' }])); await tick();
  assert.deepEqual(running.primed, []); assert.equal(running.timers.count(), 0);
});

test('back/refocus retains query, tab, category, stable list key and every loaded page while revalidating', async () => {
  let version = 1;
  const screen = searchScreen((_q, _type, page) => reply([{ _id: `page-${page}`, name: `version-${version}` }], page < 3));
  screen.render(); screen.setQuery('camp'); screen.select('recommendations'); screen.setCategory('CAMPSITE'); await screen.advance();
  await screen.list().props.onEndReached();
  const key = screen.list().props.key;
  screen.host.blur(); version = 2; screen.host.focus(); await tick();
  assert.equal(screen.input().props.value, 'camp'); assert.equal(screen.tabs()[1].props.accessibilityState.selected, true);
  assert.equal(textOf(screen.find('Choose recommendation category')), 'Category: Campsite');
  assert.equal(screen.list().props.key, key); assert.deepEqual(ids(screen.list()), ['page-1', 'page-2']);
  assert.equal(screen.list().props.data[0].name, 'version-2');
  assert.deepEqual(screen.requests.map(args => args[2]), [1, 2, 1, 2]);
  await screen.list().props.onEndReached(); assert.deepEqual(screen.requests.map(args => args[2]), [1, 2, 1, 2, 3]);
});

test('refocus revalidation stops at new end and removes rows whose visibility changed', async () => {
  let hidden = false;
  const screen = searchScreen((_q, _type, page) => hidden ? reply([]) : reply([{ _id: `page-${page}` }], page === 1));
  screen.render(); screen.setQuery('camp'); await screen.advance(); await screen.list().props.onEndReached();
  screen.host.blur(); hidden = true; screen.host.focus(); await tick();
  assert.deepEqual(ids(screen.list()), []); assert.deepEqual(screen.requests.map(args => args[2]), [1, 2, 1]);
  assert.equal(screen.list().props.ListEmptyComponent.props.emptyMessage, 'No trips found.');
});

test('follow and deletion revisions invalidate privacy-dependent results/sheets before replacement reads', async () => {
  const screen = searchScreen(async () => reply([{ _id: 'visible', user: { _id: 'author' } }]));
  screen.render(); screen.setQuery('camp'); await screen.advance();
  let list = screen.list(); list.props.renderItem({ item: list.props.data[0] }).props.onOpenSheet('recs', list.props.data[0]);
  const oldKey = list.props.key;
  await screen.createFollowActions({ context: { userId: 'actor', isCurrent: () => true }, unfollow: async () => {}, onChange: async () => {} }).toggle('author', true);
  assert.deepEqual(ids(screen.list()), []); assert.notEqual(screen.list().props.key, oldKey);
  assert.equal(nodes(screen.render(), 'RecommendationsSheet')[0].props.visible, false);
  await screen.advance(); assert.deepEqual(ids(screen.list()), ['visible']);
  screen.social.deletionRevision++;
  assert.deepEqual(ids(screen.list()), []); await screen.advance(); assert.deepEqual(ids(screen.list()), ['visible']);
});

test('existing trip card data/actions are reused, append never reprimes earlier unchanged cards and stale account handlers are inert', async () => {
  const trip = { _id: 'trip', user: { _id: 'author', username: 'Camper', city: 'Bath', country: 'UK' }, defaultTravelMode: 'WALKING', likesCount: 3, commentsCount: 2, recommendationCount: 1, isLikedByCurrentUser: true };
  const screen = searchScreen((_q, _type, page) => reply(page === 1 ? [trip] : [{ _id: 'other' }], page === 1));
  screen.render(); screen.setQuery('camp'); await screen.advance();
  const list = screen.list(), card = list.props.renderItem({ item: list.props.data[0] });
  assert.equal(card.type, 'TripCardContainer'); assert.equal(card.props.trip, trip); assert.equal(card.props.user, trip.user);
  assert.equal(card.props.canAct(), true); card.props.onPress(); assert.deepEqual(screen.routes, ['/trip/trip']);
  for (const [type, component] of [['comments', 'CommentsSheet'], ['likers', 'LikersSheet'], ['recs', 'RecommendationsSheet']]) {
    card.props.onOpenSheet(type, trip); assert.equal(nodes(screen.render(), component)[0].props.trip, trip);
    assert.equal(nodes(screen.render(), component)[0].props.visible, true); nodes(screen.render(), component)[0].props.onClose();
  }
  assert.deepEqual(screen.primed.map(item => item._id), ['trip']);
  await screen.list().props.onEndReached(); screen.render(); assert.deepEqual(screen.primed.map(item => item._id), ['trip', 'other']);
  screen.auth.set({ token: 'session-two', user: { _id: 'another' } });
  assert.equal(card.props.canAct(), false); card.props.onPress(); card.props.onOpenSheet('comments', trip);
  assert.deepEqual(screen.routes, ['/trip/trip']); assert.equal(nodes(screen.render(), 'CommentsSheet')[0].props.visible, false);
});

test('recommendation search reuses supplied authenticated-media/detail payload read-only without per-card request', async () => {
  const rec = { _id: 'rec', user: { _id: 'author' }, photos: ['000000000000000000000001'], associatedTrip: 'trip', name: 'Camp', primaryCategory: 'CAMPSITE', location: { coordinates: [0, 1] }, description: 'Good place' };
  const screen = searchScreen(async () => reply([rec]));
  screen.render(); screen.setQuery('camp'); screen.select('recommendations'); await screen.advance();
  let list = screen.list(), card = list.props.renderItem({ item: list.props.data[0] });
  assert.equal(card.type, 'RecommendationCard'); assert.equal(card.props.rec, rec); assert.ok(card.props.photoRefreshIdentity);
  assert.equal(card.props.onLongPress, undefined); card.props.onPress();
  let detail = nodes(screen.render(), 'RecommendationDetailModal')[0];
  assert.equal(detail.props.isVisible, true); assert.equal(detail.props.recommendation, rec); assert.equal(detail.props.readOnly, true);
  assert.equal(detail.props.tripUserId, 'author'); assert.deepEqual(Array.from(detail.props.tripRouteCoordinates), []);
  detail.props.onClose(); assert.equal(nodes(screen.render(), 'RecommendationDetailModal')[0].props.isVisible, false);
  card.props.onPress(); nodes(screen.render(), 'RecommendationDetailModal')[0].props.onNavigateClose();
  assert.equal(nodes(screen.render(), 'RecommendationDetailModal')[0].props.isVisible, false); assert.equal(screen.requests.length, 1);
  assert.equal(screen.primed.length, 0);
});

test('People rows use existing profile navigation and remain scoped to current search/account', async () => {
  const person = { _id: 'person', username: 'Camper', city: 'Bath', country: 'UK' };
  const screen = searchScreen(async () => reply([person]));
  screen.render(); screen.setQuery('camp'); screen.select('users'); await screen.advance();
  const list = screen.list(), row = list.props.renderItem({ item: list.props.data[0] });
  assert.equal(row.props.accessibilityRole, 'button'); assert.match(row.props.accessibilityLabel, /Camper/);
  assert.equal(row.children[0].type, 'UserHeader'); assert.equal(row.children[0].props.user, person);
  row.props.onPress(); assert.deepEqual(screen.routes, ['/(tabs)/user/person']);
  screen.select('trips'); row.props.onPress(); assert.deepEqual(screen.routes, ['/(tabs)/user/person']);
});

test('shared trip container keeps authoritative counts, forwards search priming opt-out and blocks stale like handlers', () => {
  let allowed = true, likes = 0;
  const hookCalls = [];
  const trip = { _id: 'trip', title: 'Camp', defaultTravelMode: 'WALKING', defaultTripVisibility: 'public', user: { username: 'Camper' } };
  const component = fixture('src/components/TripCardContainer.js', 'TripCardContainer', {
    trip, user: trip.user, primeOnMount: false, canAct: () => allowed, onOpenSheet() {}, onPress() {},
  }, {
    TripCard: 'TripCard', calcAvgSpeed: () => '10', isoToDate: () => 'Today', kmOrMiles: () => '20', msToDuration: () => '2h', lineStringToCoords: () => [],
    useTripSocial: (...args) => { hookCalls.push(args); return { likesCount: 4, commentsCount: 3, recommendationCount: 2, isLiked: true, toggleLike: () => likes++ }; },
  });
  const card = component.render();
  assert.equal(hookCalls[0][0], trip); assert.equal(hookCalls[0][1], false);
  assert.equal(card.props.likes, 4); assert.equal(card.props.comments, 3); assert.equal(card.props.recommendationsCount, 2);
  assert.equal(card.props.isLikedByCurrentUser, true); assert.equal(card.props.travelMode, 'WALKING');
  card.props.onLikePress(); assert.equal(likes, 1);
  allowed = false; card.props.onLikePress(); assert.equal(likes, 1);
});

test('search social hook opt-out preserves cached like state across virtualized remounts; existing default still primes', () => {
  const scope = {}, primed = [];
  const trip = { _id: 'trip', likesCount: 1, isLikedByCurrentUser: false };
  const mount = primeOnMount => {
    const host = hooksFixture();
    const useTripSocial = load('src/hooks/useTripSocial.js', 'useTripSocial', {
      React: { useEffect: host.hooks.useEffect },
      useAuthStore: select => select({ token: 'token', user: { _id: 'actor' } }),
      getSocialSessionScope: () => scope,
      useTripSocialStore: () => ({ primeCounts: item => primed.push(item), trips: { trip: { session: scope, likesCount: 2, isLikedByCurrentUser: true } } }),
    });
    return host.render(() => useTripSocial(trip, primeOnMount));
  };
  const first = mount(false), remount = mount(false);
  assert.equal(first.likesCount, 2); assert.equal(remount.isLiked, true); assert.deepEqual(primed, []);
  mount(undefined); assert.deepEqual(primed, [trip]);
});

function searchSocialStore() {
  let state;
  const auth = authFixture();
  const module = load('src/stores/tripSocialStore.js', '({useTripSocialStore,getSocialSessionScope})', {
    useAuthStore: auth.store,
    create: initialize => {
      state = initialize(patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; }, () => state);
      const store = selector => selector ? selector(state) : state;
      store.getState = () => state;
      return store;
    },
    likeTrip: async () => {}, unlikeTrip: async () => {}, getTripComments: async () => [], getTripLikers: async () => [],
    getTripJsonById: async () => ({ recommendations: [] }), addTripComment: async () => ({ _id: 'comment' }),
  });
  return { auth, ...module };
}

function actualSocialSheet(name, props, social) {
  const host = hooksFixture();
  const useTripSocial = load('src/hooks/useTripSocial.js', 'useTripSocial', {
    React: { useEffect: host.hooks.useEffect }, useAuthStore: social.auth.store,
    useTripSocialStore: social.useTripSocialStore, getSocialSessionScope: social.getSocialSessionScope,
  });
  const loader = { identity: {}, loading: false, error: null, refreshIdentity: {}, retry() {} };
  const component = fixture(`src/components/sheets/${name}.js`, name, props, {
    ...native, ...host.hooks, React: { Fragment: 'Fragment', useEffect: host.hooks.useEffect }, theme, StyleSheet: { create: value => value },
    useTripSocial, useAuthStore: social.auth.store, useSocialSheetLoader: () => loader,
    useRouter: () => ({ push() {} }), ProfileListStatus: 'ProfileListStatus', BaseSheet: 'BaseSheet', Avatar: 'Avatar', Feather: 'Feather',
    RecommendationDetailModal: 'RecommendationDetailModal', RecommendationCard: 'RecommendationCard',
    lineStringToCoords: () => [], isoToDate: () => '', deleteTripComment: async () => {},
  });
  return { render: () => host.render(() => component.render()), unmount: host.unmount };
}

const socialCounts = store => {
  const { likesCount, isLikedByCurrentUser, commentsCount, recommendationCount } = store.getState().trips.trip;
  return { likesCount, isLikedByCurrentUser, commentsCount, recommendationCount };
};

test('search passes priming opt-out to all three shared social sheets, including closed siblings', async () => {
  const trip = { _id: 'trip', user: { _id: 'author' }, likesCount: 1, commentsCount: 2, recommendationCount: 3, isLikedByCurrentUser: false };
  const screen = searchScreen(async () => reply([trip]));
  screen.render(); screen.setQuery('camp'); await screen.advance();
  for (const type of ['comments', 'likers', 'recs']) {
    const list = screen.list(); list.props.renderItem({ item: trip }).props.onOpenSheet(type, trip);
    for (const name of ['CommentsSheet', 'LikersSheet', 'RecommendationsSheet']) {
      assert.equal(nodes(screen.render(), name)[0].props.primeOnMount, false, `${name} must not prime old search snapshots`);
    }
  }
});

test('real social sheets and hook preserve liked/comment/recommendation counts across search open, close and reopen', async () => {
  const social = searchSocialStore(), store = social.useTripSocialStore;
  const stale = { _id: 'trip', user: { _id: 'author' }, likesCount: 1, commentsCount: 2, recommendationCount: 3, isLikedByCurrentUser: false };
  store.getState().primeCounts(stale);
  await store.getState().toggleLike('trip');
  store.getState().setCommentCount('trip', 7); store.getState().setRecCount('trip', 9);
  const expected = { likesCount: 2, isLikedByCurrentUser: true, commentsCount: 7, recommendationCount: 9 };
  assert.deepEqual(socialCounts(store), expected);
  const sheets = ['CommentsSheet', 'LikersSheet', 'RecommendationsSheet'].map(name => {
    const props = { trip: null, visible: false, onClose() {}, primeOnMount: false };
    return { name, props, component: actualSocialSheet(name, props, social) };
  });
  for (const sheet of sheets) sheet.component.render();
  for (const selected of sheets) {
    // The screen supplies the selected trip to all sibling sheets, even hidden ones.
    for (const sheet of sheets) { sheet.props.trip = stale; sheet.props.visible = sheet === selected; sheet.component.render(); }
    assert.deepEqual(socialCounts(store), expected, `${selected.name} open must not restore stale snapshot`);
    for (const sheet of sheets) { sheet.props.trip = null; sheet.props.visible = false; sheet.component.render(); }
    assert.deepEqual(socialCounts(store), expected);
    selected.props.trip = stale; selected.props.visible = true; selected.component.render();
    assert.deepEqual(socialCounts(store), expected, `${selected.name} reopen must preserve live state`);
    selected.props.trip = null; selected.props.visible = false; selected.component.render();
  }
  for (const sheet of sheets) sheet.component.unmount();
});

test('all real social sheets retain default priming behavior for existing non-search callers', async () => {
  const stale = { _id: 'trip', user: { _id: 'author' }, likesCount: 1, commentsCount: 2, recommendationCount: 3, isLikedByCurrentUser: false };
  for (const name of ['CommentsSheet', 'LikersSheet', 'RecommendationsSheet']) {
    const social = searchSocialStore(), store = social.useTripSocialStore;
    store.getState().primeCounts(stale); await store.getState().toggleLike('trip'); store.getState().setCommentCount('trip', 7);
    const component = actualSocialSheet(name, { trip: stale, visible: true, onClose() {} }, social);
    component.render();
    assert.deepEqual(socialCounts(store), { likesCount: 1, isLikedByCurrentUser: false, commentsCount: 2, recommendationCount: 3 }, `${name} must preserve its legacy default`);
    component.unmount();
  }
});
