// Execute real auth, viewer selector, formatters and presentation components.
// Only native hosts, network/storage, and React scheduling are controlled.
const { load, fixture, nodes, native, theme } = require('./component-fixture.cjs');
const { hooksFixture } = require('./hooks-fixture.cjs');
const { createStore } = require('zustand/vanilla');
const prefs = require('../../src/constants/presentationPreferences');
const tick = () => new Promise(setImmediate);
const account = (id, units) => ({ _id: id, username: id, token: `token-${id}`, settings: { preferredUnits: units } });
const names = list => Object.fromEntries(list.split(' ').map(name => [name, name]));
const deps = { ...native, theme, baseTheme: theme, StyleSheet: { create: x => x },
  ...names('JourneyShareAction Feather TransportIcon TripMapThumbnail UserHeader Avatar Link BottomModal ModalHeader ProfileListStatus RefreshControl PendingTripDeletions TripCardContainer CommentsSheet LikersSheet RecommendationsSheet RecommendationCard RecommendationDetailModal'),
};

function environment() {
  const storage = new Map(), mounted = new Set();
  let rendering = null;
  const useAuthStore = load('src/stores/auth.js', 'useAuthStore', {
    ...prefs, authService: {}, stopActiveRecording: async () => {},
    SecureStore: { getItemAsync: async key => storage.get(key), setItemAsync: async (key, value) => storage.set(key, value), deleteItemAsync: async key => storage.delete(key) },
    require: () => ({ useTripSocialStore: { getState: () => ({ reset() {} }) } }),
    create: init => {
      const store = createStore(init);
      // Model Zustand's selected-snapshot subscription, not an unconditional
      // parent render. A unit-only update can rerender a card only if one of
      // that mounted card's real selectors changed.
      const hook = (select = state => state) => {
        const value = select(store.getState());
        rendering?.selectors.push({ select, value });
        return value;
      };
      store.subscribe(state => {
        for (const view of mounted) {
          if (view.selectors.some(({ select, value }) => !Object.is(select(state), value))) view.render();
        }
      });
      return Object.assign(hook, store);
    },
  });
  const useViewerUnits = load('src/hooks/useViewerUnits.js', 'useViewerUnits', { useAuthStore });
  const format = load('src/utils/format.js', '({kmOrMiles,calcAvgSpeed,speedUnit,metersToKm,metersToMiles,msToDuration,isoToDate})', { useAuthStore });
  const { profileDistance } = load('src/utils/profileData.js', '({profileDistance})', format);
  const social = { trips: {}, primeCounts() {}, setRecCount() {}, setLikeState() {}, setCommentCount() {} };
  const useTripSocialStore = select => select ? select(social) : social;
  const common = { ...deps, ...format, useAuthStore, useViewerUnits, useTripSocialStore, profileDistance,
    useRouter: () => ({ push() {}, replace() {}, canGoBack: () => true, back() {} }), lineStringToCoords: () => [],
  };
  function mount(file, name, props, extra = {}) {
    const host = hooksFixture();
    const view = { selectors: [], tree: null, renders: 0,
      render() {
        const before = rendering; rendering = view; view.selectors = [];
        try { view.tree = host.render(() => component.render()); view.renders++; return view.tree; }
        finally { rendering = before; }
      },
      unmount() { mounted.delete(view); host.unmount(); },
    };
    const component = fixture(file, name, props, { ...common, ...host.hooks, ...extra });
    mounted.add(view); view.render(); return view;
  }
  const trip = (owner = 'other', ownerUnits = 'metric', patch = {}) => ({
    _id: 'trip', title: '100 km in two hours', user: { _id: owner, username: owner, settings: { preferredUnits: ownerUnits } },
    distanceMeters: 100000, durationMillis: 7200000, likes: [], comments: [], recommendations: [], photos: [], pointsOfInterest: [], ...patch,
  });
  function card(data, props = {}) {
    const useTripSocial = load('src/hooks/useTripSocial.js', 'useTripSocial', {
      React: { useEffect() {} }, useAuthStore, useTripSocialStore, getSocialSessionScope: () => `${useAuthStore.getState().sessionEpoch}:${useAuthStore.getState().user?._id}`,
    });
    const view = mount('src/components/TripCardContainer.js', 'TripCardContainer', { trip: data, user: data.user, onOpenSheet() {}, ...props }, { useTripSocial, TripCard: 'TripCard' });
    return { ...view, labels() {
      const tree = fixture('src/components/TripCard.js', 'TripCard', view.tree.props, deps).render();
      const stats = nodes(tree).filter(node => node.type?.name === 'IconStat');
      const value = icon => { const p = stats.find(node => node.props.iconName === icon).props; return `${p.value}${p.unit ? ' ' + p.unit : ''}`; };
      return { distance: value('map-pin'), speed: value('activity') };
    }, view };
  }
  async function detail(data) {
    let requests = 0;
    const view = mount('app/(tabs)/trip/[id].js', 'TripDetailScreen', {}, {
      ...names('CommentList TripRecommendationCard AddCommentModal AddRecommendationModal LikersModal MapModal IconStatDisplay PhotoGallery Section SocialButton'),
      useLocalSearchParams: () => ({ id: data._id }), useNavigation: () => ({ getState: () => ({ index: 0, routes: [{ name: '(tabs)' }] }) }),
      BackHandler: { addEventListener: () => ({ remove() {} }) }, Alert: { alert() {} }, getTripJsonById: async () => { requests++; return data; }, getPoiNote: () => '',
    });
    await tick(); view.render();
    return { view, requests: () => requests, labels() {
      const stats = nodes(view.tree, 'IconStatDisplay');
      return { distance: stats.find(node => node.props.label === 'Distance')?.props.value, speed: stats.find(node => node.props.label === 'Avg. Speed')?.props.value };
    } };
  }
  function profile(data) {
    const stats = { totalDistance: data.distanceMeters, totalTrips: 1, followers: 0, following: 0, recommendationCount: 0, poi: 0 };
    const summary = mount('src/screens/profile/ProfileSummary.js', 'ProfileSummary', { displayedUser: data.user, stats, colors: {}, isSelf: data.user._id === useAuthStore.getState().user?._id });
    const context = { isCurrent: () => true };
    const { createPagedList } = load('src/utils/pagedList.js', '({createPagedList})');
    let requests = 0;
    const modal = mount('src/components/modals/ProfileStatModal.js', 'ProfileStatModal', { stat: 'Distance', userId: data.user._id, stats, onClose() {} }, {
      useProfileContext: () => context, createPagedList, getUserPois: async () => { requests++; return { data: [] }; },
    });
    return { summary, modal, requests: () => requests, labels: () => ({
      summary: nodes(summary.tree, 'TouchableOpacity').find(node => node.props.accessibilityLabel?.startsWith('Distance: ')).props.accessibilityLabel.slice(10),
      modal: nodes(modal.tree, 'Text')[0].children.join(''),
    }) };
  }
  function listCard(kind, data) {
    const context = { isCurrent: () => true };
    const list = { identity: {}, context, items: [data], eligible: true, refreshOnNextFocus() {}, refresh() {}, ensureLoaded() {} };
    const [file, name] = kind === 'search' ? ['app/search/index.js', 'SearchScreen'] : kind.includes('profile') ? ['src/screens/profile/tabs/TripsTab.js', 'TripsTab'] : kind === 'my-trips' ? ['app/(tabs)/trips/index.js', 'MyTrips'] : ['app/(tabs)/feed/index.js', 'FeedScreen'];
    const parent = mount(file, name, { userId: data.user._id }, {
      useProfileList: () => list, useProfileContext: () => context, useSearchResults: () => list,
      getFollowRevision: () => 0, subscribeFollowChanges: () => () => {}, getTripsByUser() {}, recordAuthDiagnostic() {},
      RECOMMENDATION_CATEGORIES: [], Keyboard: { dismiss() {} },
    });
    if (kind === 'discover') { nodes(parent.tree, 'Pressable')[1].props.onPress(); parent.render(); }
    const row = nodes(parent.tree, 'FlatList')[0].props.renderItem({ item: data });
    if (row.type !== 'TripCardContainer') throw Error(`${kind} bypassed shared trip cards`);
    return { parent, card: card(data, row.props) };
  }
  return { storage, useAuthStore, useViewerUnits, format, profileDistance, trip, card, detail, profile, listCard,
    login: (units = 'metric', id = 'viewer') => useAuthStore.getState().login(account(id, units)),
    units: units => useAuthStore.getState().updateUser({ settings: { preferredUnits: units } }),
    close() { for (const view of mounted) view.unmount(); },
  };
}
module.exports = { environment, account, tick };
