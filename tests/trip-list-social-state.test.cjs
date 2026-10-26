const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, nodes, native } = require('./helpers/component-fixture.cjs');
const { hooksFixture, authFixture } = require('./helpers/hooks-fixture.cjs');
const theme = load('src/theme.js', 'theme');
const { createPagedList } = load('src/utils/pagedList.js', '({createPagedList})');
const tick = () => new Promise(setImmediate);

// Real list screens, hooks, social store, cards and sheets; only native hosts,
// network responses and React scheduling are controlled. Not device UI coverage.
function setup(kind, options = {}) {
  const auth = authFixture(), apiCalls = [], sheetCalls = [], host = hooksFixture();
  let state, comments = [], recommendations = [];
  const social = load('src/stores/tripSocialStore.js', '({useTripSocialStore,getSocialSessionScope})', {
    useAuthStore: auth.store,
    create: init => {
      state = init(patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; }, () => state);
      const store = selector => selector ? selector(state) : state;
      store.getState = () => state;
      return store;
    },
    likeTrip: async id => { apiCalls.push(['like', id]); }, unlikeTrip: async id => { apiCalls.push(['unlike', id]); },
    getTripComments: async () => { sheetCalls.push('comments'); return comments; },
    getTripLikers: async () => { sheetCalls.push('likers'); return [{ _id: 'actor' }]; },
    getTripJsonById: async () => { sheetCalls.push('recommendations'); return { recommendations }; },
    addTripComment: async (_id, text) => { const comment = { _id: `comment-${comments.length}`, text }; comments = [...comments, comment]; return comment; },
  });
  const trip = { _id: 'trip', user: { _id: 'author' }, title: 'Synthetic trip', likesCount: 0, commentsCount: 0, recommendationCount: 0, isLikedByCurrentUser: false };
  let firstPage = [trip], secondPage = [{ ...trip, _id: 'trip2' }];
  const page = options.page || (async n => ({ items: n === 1 ? firstPage : secondPage, totalPages: 2 }));
  const useProfileContext = load('src/hooks/useProfileContext.js', 'useProfileContext', { ...host.hooks, useAuthStore: auth.store });
  const useProfileList = load('src/hooks/useProfileList.js', 'useProfileList', { ...host.hooks, useProfileContext, createPagedList, useTripSocialStore: social.useTripSocialStore });
  const [file, name] = kind === 'profile' ? ['src/screens/profile/tabs/TripsTab.js', 'TripsTab'] : kind === 'my-trips' ? ['app/(tabs)/trips/index.js', 'MyTrips'] : ['app/(tabs)/feed/index.js', 'FeedScreen'];
  const screen = fixture(file, name, { userId: 'author' }, {
    ...native, ...host.hooks, ...social, theme, StyleSheet: { create: x => x }, useProfileList, useAuthStore: auth.store,
    getFollowRevision: () => 0, subscribeFollowChanges: () => () => {}, getFeedTripJson: page, getDiscoverTripJson: page, getMyJsonTrips: page,
    getTripsByUser: async (_user, n) => { const result = await page(n); return { data: result.items, totalPages: result.totalPages }; },
    useRouter: () => ({ push() {} }), recordAuthDiagnostic() {}, PendingTripDeletions: 'PendingTripDeletions', RefreshControl: 'RefreshControl',
    ProfileListStatus: 'ProfileListStatus', TripCardContainer: 'TripCardContainer', CommentsSheet: 'CommentsSheet', LikersSheet: 'LikersSheet', RecommendationsSheet: 'RecommendationsSheet',
  });
  const render = () => host.render(() => screen.render());
  const list = () => nodes(render(), 'FlatList')[0];
  function card(item = list().props.data[0]) {
    const cardHost = hooksFixture(), props = list().props.renderItem({ item }).props;
    const useTripSocial = load('src/hooks/useTripSocial.js', 'useTripSocial', { React: { useEffect: cardHost.hooks.useEffect }, useAuthStore: auth.store, ...social });
    const component = fixture('src/components/TripCardContainer.js', 'TripCardContainer', props, {
      useTripSocial, TripCard: 'TripCard', calcAvgSpeed: () => '', isoToDate: () => '', kmOrMiles: () => '', msToDuration: () => '', lineStringToCoords: () => [],
    });
    return { render: () => cardHost.render(() => component.render()), unmount: () => cardHost.unmount() };
  }
  function sheet(name, props) {
    const sheetHost = hooksFixture();
    const useTripSocial = load('src/hooks/useTripSocial.js', 'useTripSocial', { React: { useEffect: sheetHost.hooks.useEffect }, useAuthStore: auth.store, ...social });
    const useSocialSheetLoader = load('src/hooks/useSocialSheetLoader.js', 'useSocialSheetLoader', { ...sheetHost.hooks, useAuthStore: auth.store });
    const component = fixture(`src/components/sheets/${name}.js`, name, props, {
      ...native, ...sheetHost.hooks, React: { Fragment: 'Fragment', useEffect: sheetHost.hooks.useEffect }, theme, StyleSheet: { create: x => x },
      useTripSocial, useSocialSheetLoader, useAuthStore: auth.store, useRouter: () => ({ push() {} }), ProfileListStatus: 'ProfileListStatus', BaseSheet: 'BaseSheet',
      Avatar: 'Avatar', Feather: 'Feather', isoToDate: () => '', deleteTripComment: async () => {}, RecommendationCard: 'RecommendationCard', RecommendationDetailModal: 'RecommendationDetailModal', lineStringToCoords: () => [],
    });
    return { render: () => sheetHost.render(() => component.render()), unmount: () => sheetHost.unmount() };
  }
  return { auth, social, apiCalls, sheetCalls, trip, render, list, card, sheet, host,
    async start() { render(); await tick(); if (kind === 'discover') { nodes(render(), 'Pressable')[1].props.onPress(); render(); await tick(); } },
    setFirstPage(items) { firstPage = items; }, setSecondPage(items) { secondPage = items; },
    setSocialLists(nextComments, nextRecommendations) { comments = nextComments; recommendations = nextRecommendations; },
  };
}

for (const kind of ['following', 'discover', 'my-trips', 'profile']) {
  test(`${kind}: all three sheets preserve a successful like and next tap unlikes`, async () => {
    const f = setup(kind); await f.start(); const card = f.card(); card.render(); await card.render().props.onLikePress();
    for (const [name, action] of [['CommentsSheet', 'onCommentPress'], ['LikersSheet', 'onOpenLikersModalPress'], ['RecommendationsSheet', 'onRecommendPress']]) {
      card.render().props[action](); const props = nodes(f.render(), name)[0].props;
      const sheet = f.sheet(name, props); sheet.render(); await tick(); sheet.render();
      assert.equal(card.render().props.isLikedByCurrentUser, true, `${name} must not re-prime list snapshot`);
      assert.equal(card.render().props.likes, 1); props.onClose(); f.render(); sheet.unmount();
    }
    assert.deepEqual(f.sheetCalls, ['comments', 'likers', 'recommendations']);
    await card.render().props.onLikePress(); assert.deepEqual(f.apiCalls, [['like', 'trip'], ['unlike', 'trip']]);
  });

  test(`${kind}: pagination and virtualized card remount preserve live likes/comments/recommendations`, async () => {
    const f = setup(kind); await f.start(); let card = f.card(); card.render(); await card.render().props.onLikePress();
    f.setSocialLists([{ _id: 'one' }, { _id: 'two' }], [{ _id: 'rec' }]);
    await f.social.useTripSocialStore.getState().loadComments('trip'); await f.social.useTripSocialStore.getState().loadRecommendations('trip');
    await f.list().props.onEndReached(); f.render(); card.unmount(); card = f.card(); card.render();
    const props = card.render().props;
    assert.equal(props.isLikedByCurrentUser, true); assert.equal(props.likes, 1); assert.equal(props.comments, 2); assert.equal(props.recommendationsCount, 1);
    await props.onLikePress(); assert.deepEqual(f.apiCalls, [['like', 'trip'], ['unlike', 'trip']]);
  });

  test(`${kind}: new server objects still refresh authoritative counts, including duplicate IDs on a new page`, async () => {
    const f = setup(kind); await f.start(); const card = f.card(); card.render(); await card.render().props.onLikePress();
    f.setFirstPage([{ ...f.trip, likesCount: 7, commentsCount: 3, recommendationCount: 2, isLikedByCurrentUser: false }]);
    await f.list().props.refreshControl.props.onRefresh(); f.render();
    assert.equal(card.render().props.likes, 7); assert.equal(card.render().props.isLikedByCurrentUser, false); assert.equal(card.render().props.comments, 3); assert.equal(card.render().props.recommendationsCount, 2);
    f.setSecondPage([{ ...f.trip, likesCount: 8, commentsCount: 4, recommendationCount: 3, isLikedByCurrentUser: true }]);
    await f.list().props.onEndReached(); f.render();
    assert.equal(card.render().props.likes, 8); assert.equal(card.render().props.isLikedByCurrentUser, true); assert.equal(card.render().props.comments, 4); assert.equal(card.render().props.recommendationsCount, 3);
  });
}
