const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, nodes, native, theme } = require('./helpers/component-fixture.cjs');
const { hooksFixture } = require('./helpers/hooks-fixture.cjs');
const tick = () => new Promise(setImmediate);

// Run the actual TripDetailScreen and its registered hardware callback. The
// history/native event host is synthetic; this is not an Android device test.
function detail(source) {
  const host = hooksFixture(), listeners = new Set(), registered = [], calls = [], alerts = [];
  const sourceState = { route: source, query: 'camp', type: 'trips', page: 2 };
  const history = source ? [sourceState, { route: '/trip/trip-a' }] : [{ route: '/trip/trip-a' }];
  const router = {
    canGoBack: () => history.length > 1,
    back: () => { calls.push(['back']); history.pop(); },
    replace: path => { calls.push(['replace', path]); history[history.length - 1] = { route: path }; },
    push: path => { calls.push(['push', path]); history.push({ route: path }); },
  };
	const rootNavigation = { getState: () => source === '/search'
		? { index: 2, routes: [{ name: '(tabs)' }, { name: 'search/index' }, { name: '(tabs)' }] }
		: { index: 0, routes: [{ name: '(tabs)' }] } };
  const session = { user: { _id: 'owner' }, token: 'session-a', sessionEpoch: 1, isAuthenticated: true, isSessionChanging: false };
  const components = Object.fromEntries(['CommentList', 'TripRecommendationCard', 'TransportIcon', 'TripMapThumbnail', 'AddCommentModal', 'AddRecommendationModal', 'LikersModal', 'MapModal', 'RecommendationDetailModal', 'IconStatDisplay', 'PhotoGallery', 'Section', 'SocialButton', 'Avatar'].map(name => [name, name]));
  const screen = fixture('app/(tabs)/trip/[id].js', 'TripDetailScreen', {}, {
    ...native, ...components, ...host.hooks, theme, StyleSheet: { create: value => value }, Feather: 'Feather',
    useAuthStore: Object.assign(() => session, { getState: () => session }),
    useLocalSearchParams: () => ({ id: 'trip-a' }), useRouter: () => router,
		useNavigation: parent => { assert.equal(parent, '/'); return rootNavigation; },
    useTripSocialStore: Object.assign(() => ({ setRecCount() {}, setLikeState() {}, setCommentCount() {} }), { getState: () => ({ invalidateDeletedTrip() {} }) }),
    BackHandler: { addEventListener(event, callback) {
      assert.equal(event, 'hardwareBackPress'); listeners.add(callback); registered.push(callback);
      return { remove: () => listeners.delete(callback) };
    } },
    getTripJsonById: async () => ({ _id: 'trip-a', user: { _id: 'owner' }, title: 'Trip', likes: [], comments: [], recommendations: [], photos: [] }),
    useViewerUnits: () => "metric", speedUnit: () => "km/h", calcAvgSpeed: () => 1, kmOrMiles: () => '1 km', msToDuration: () => '', lineStringToCoords: () => [], isoToDate: () => '', getPoiNote: () => '',
    Alert: { alert: (...args) => alerts.push(args) },
    ENABLE_SAFE_TRIP_DELETE: true,
    createTripDeletion: options => ({ getState: () => ({}), run: async () => options.onComplete(null, { cleanupPending: false }) }),
    deleteServerTrip() {}, rememberPendingTripDeletion() {}, settlePendingTripDeletion() {}, reconcileDeletedServerTrip() {},
  });
  return { host, listeners, registered, history, sourceState, calls, alerts,
    render: () => host.render(() => screen.render()),
    pressBack: () => { for (const callback of [...listeners].reverse()) if (callback()) return true; return false; },
  };
}

for (const source of ['/search']) {
  test(`trip Android Back returns to ${source} rather than replacing it with Trips`, async () => {
    const f = detail(source); f.render(); await tick(); f.render();
    assert.equal(f.listeners.size, 1); assert.equal(f.pressBack(), true);
    assert.deepEqual(f.calls, [['back']]); assert.equal(f.history.length, 1);
    assert.equal(f.history[0], f.sourceState); assert.equal(f.history[0].query, 'camp'); assert.equal(f.history[0].page, 2);
    f.host.unmount(); assert.equal(f.listeners.size, 0);
  });
}

for (const source of ['/(tabs)/feed', '/(tabs)/trips']) {
	test(`trip Android Back from ${source} preserves its original Trips redirect outside Search`, async () => {
		const f = detail(source); f.render(); await tick(); f.render();
		assert.equal(f.listeners.size, 1); assert.equal(f.pressBack(), true);
		assert.deepEqual(f.calls, [['replace', '/(tabs)/trips/']]);
		f.host.unmount(); assert.equal(f.listeners.size, 0);
	});
}

test('direct-linked trip without prior history keeps the safe Trips fallback', async () => {
  const f = detail(); f.render(); await tick(); f.render();
  assert.equal(f.pressBack(), true); assert.deepEqual(f.calls, [['replace', '/(tabs)/trips/']]);
  assert.equal(f.history[0].route, '/(tabs)/trips/'); f.host.unmount();
});

test('mounted but blurred trip cannot intercept search Back; focus/re-renders install exactly one live handler', async () => {
  const f = detail('/search'); f.render(); await tick(); f.render();
  const oldCallback = f.registered[0];
  f.host.blur(); assert.equal(f.listeners.size, 0); assert.equal(f.pressBack(), false);
  assert.equal(oldCallback(), false); assert.deepEqual(f.calls, []);
  f.host.focus(); await tick(); f.render(); f.render();
  assert.equal(f.listeners.size, 1); assert.equal(f.registered.length, 2);
  assert.equal(oldCallback(), false); assert.equal(f.pressBack(), true); assert.deepEqual(f.calls, [['back']]);
  f.host.unmount(); assert.equal(f.listeners.size, 0); assert.equal(f.registered.at(-1)(), false);
});

test('confirmed deletion still redirects to Trips, never back to the now-deleted detail source', async () => {
  const f = detail('/search'); f.render(); await tick();
  const menu = nodes(f.render()).find(node => node.type?.name === 'DropdownMenu');
  assert.ok(menu); menu.props.onDelete();
  const confirmation = f.alerts.find(args => args[0] === 'Permanently delete trip?');
  assert.ok(confirmation); await confirmation[2].find(button => button.style === 'destructive').onPress();
  assert.deepEqual(f.calls, [['replace', '/(tabs)/trips/']]); f.host.unmount();
});

// These are the actual pure routers shipped inside the installed Expo Router,
// not mocks of router.back(). They demonstrate how nested GO_BACK is consumed.
const { TabRouter } = require('expo-router/build/react-navigation/routers/TabRouter');
const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter');
const CommonActions = require('expo-router/build/react-navigation/routers/CommonActions');
const routeNames = ['feed/index', 'trips/index', 'record/index', 'me/index', 'trip/[id]', 'trip/[id]/edit', 'me/edit-profile', 'me/settings', 'user/[userId]/index'];
const tabOptions = { routeNames, routeParamList: {}, routeGetIdList: {} };
const stackOptions = { routeNames: ['(tabs)', 'search/index'], routeParamList: {}, routeGetIdList: {} };
function layout(rootState, frameKey) {
  const Tabs = Object.assign(() => {}, { Screen: 'TabScreen' });
  return fixture('app/(tabs)/_layout.js', 'TabLayout', {}, {
    Tabs, IconSymbol: 'IconSymbol', Platform: { OS: 'android' },
    useRoute: () => ({ name: '(tabs)', key: frameKey }),
    useNavigationState: select => select(rootState),
  }).render();
}
function rootWithSearch() {
  const stack = StackRouter({ initialRouteName: '(tabs)' });
  let state = stack.getInitialState(stackOptions);
  state = stack.getStateForAction(state, { type: 'PUSH', payload: { name: 'search/index' } }, stackOptions);
  const searchFrame = state.routes[1];
  state = stack.getStateForAction(state, { type: 'PUSH', payload: { name: '(tabs)' } }, stackOptions);
  return { stack, state, searchFrame };
}
function targetTabs(behavior, name) {
  const router = TabRouter({ initialRouteName: 'trips/index', backBehavior: behavior });
  const state = router.getRehydratedState({ stale: true, index: 0, routes: [{ name, params: { id: 'trip-a', userId: 'person-a' } }] }, tabOptions);
  return { router, state };
}

test('actual Tabs layout picks history on the first result-frame render and leaves the underlying frame unchanged', () => {
  const { state } = rootWithSearch();
  assert.equal(layout(state, state.routes[0].key).props.backBehavior, 'firstRoute');
  assert.equal(layout(state, state.routes[2].key).props.backBehavior, 'history');
  // Selection belongs to this exact frame, not whichever frame is globally focused.
  const unfocused = { ...state, index: 0 };
  assert.equal(layout(unfocused, state.routes[2].key).props.backBehavior, 'history');
  assert.equal(layout(unfocused, state.routes[0].key).props.backBehavior, 'firstRoute');
  const direct = { ...state, index: 0, routes: [state.routes[2]] };
  assert.equal(layout(direct, state.routes[2].key).props.backBehavior, 'firstRoute');
});

for (const destination of ['trip/[id]', 'user/[userId]/index']) {
  test(`installed routers return Search→${destination} to the same Search frame rather than Feed`, () => {
    const root = rootWithSearch();
    const behavior = layout(root.state, root.state.routes[2].key).props.backBehavior;
    const tabs = targetTabs(behavior, destination);
    assert.deepEqual(tabs.state.history.map(entry => tabs.state.routes.find(route => route.key === entry.key).name), [destination]);
    // An untargeted back from the deepest navigator must bubble when unhandled.
    const action = CommonActions.goBack();
    assert.equal(tabs.router.getStateForAction(tabs.state, action, tabOptions), null);
    const returned = root.stack.getStateForAction(root.state, action, stackOptions);
    assert.equal(returned.routes[returned.index], root.searchFrame);
    assert.equal(returned.routes.length, 2);
    // Prove this is not a tautology: the prior/default config swallows the same action.
    const old = targetTabs('firstRoute', destination);
    const wrongReturn = old.router.getStateForAction(old.state, action, tabOptions);
    assert.equal(wrongReturn.routes[wrongReturn.index].name, 'feed/index');
  });
}

test('installed routers retain nested trip→profile history inside a Search result frame before returning to Search', () => {
  const root = rootWithSearch();
  const tabs = targetTabs(layout(root.state, root.state.routes[2].key).props.backBehavior, 'trip/[id]');
  const profile = tabs.router.getStateForAction(tabs.state, CommonActions.navigate({ name: 'user/[userId]/index', params: { userId: 'person-a' } }), tabOptions);
  assert.equal(profile.routes[profile.index].name, 'user/[userId]/index');
  const trip = tabs.router.getStateForAction(profile, CommonActions.goBack(), tabOptions);
  assert.equal(trip.routes[trip.index].name, 'trip/[id]');
  assert.equal(tabs.router.getStateForAction(trip, CommonActions.goBack(), tabOptions), null);
  const search = root.stack.getStateForAction(root.state, CommonActions.goBack(), stackOptions);
  assert.equal(search.routes[search.index], root.searchFrame);
});

test('installed normal Trips navigator still uses firstRoute, and actual detail handler retains legacy Trips redirect', async () => {
  const tabs = TabRouter({ initialRouteName: 'trips/index', backBehavior: 'firstRoute' });
  const initial = tabs.getInitialState(tabOptions);
  assert.equal(initial.routes[initial.index].name, 'trips/index');
  const trip = tabs.getStateForAction(initial, CommonActions.navigate({ name: 'trip/[id]', params: { id: 'trip-a' } }), tabOptions);
  const unhandledBack = tabs.getStateForAction(trip, CommonActions.goBack(), tabOptions);
  assert.equal(unhandledBack.routes[unhandledBack.index].name, 'feed/index', 'generic back would regress the old Trips return');
  const f = detail('/(tabs)/trips'); f.render(); await tick(); f.render(); f.pressBack();
  assert.deepEqual(f.calls, [['replace', '/(tabs)/trips/']]);
  const replacement = tabs.getStateForAction(trip, { type: 'REPLACE', payload: { name: 'trips/index' } }, tabOptions);
  assert.equal(replacement.routes[replacement.index].name, 'trips/index');
  f.host.unmount();
});
