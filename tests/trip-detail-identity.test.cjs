const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('zustand');
const {load, fixture, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const {hooksFixture} = require('./helpers/hooks-fixture.cjs');
const prefs = require('../src/constants/presentationPreferences');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const reply = (data, status = 200) => ({status, ok: status < 400, headers: {get: () => 'application/json'}, json: async () => data});
const account = {_id: 'owner', username: 'Owner', token: 'old-token'};
const other = {_id: 'other', username: 'Other', token: 'new-token'};
const text = tree => nodes(tree, 'Text').flatMap(n => n.children).join(' ');
const like = tree => nodes(tree, 'TouchableOpacity').find(n => nodes(n, 'Feather').some(i => i.props.name === 'heart'));
const menu = tree => nodes(tree).find(n => n.type?.name === 'DropdownMenu');
const social = (tree, icon) => nodes(tree, 'SocialButton').find(n => n.props.iconName === icon);
const countButton = tree => nodes(tree, 'TouchableOpacity').find(n => n.props.style?.paddingLeft !== undefined) ||
  nodes(tree, 'TouchableOpacity').find(n => nodes(n, 'Text').some(t => t.children.some(x => typeof x === 'number')));
const mutations = f => f.requests.filter(r => r.options.method !== 'GET');

// Actual detail, auth, API and social-store modules. Native rendering/navigation,
// SecureStore and HTTP transport are controlled hosts, not a phone or live API.
async function app() {
  const host = hooksFixture(), storage = new Map(), requests = [], alerts = [], navigation = [], route = {id: 'trip-a'};
  let socialStore;
  const SecureStore = {getItemAsync: async k => storage.get(k) || null, setItemAsync: async (k, v) => storage.set(k, v), deleteItemAsync: async k => storage.delete(k)};
  const auth = load('src/stores/auth.js', 'useAuthStore', {...prefs, create, SecureStore, authService: {}, stopActiveRecording: async () => {}, require: () => ({useTripSocialStore: socialStore})});
  const useAuthStore = Object.assign(select => select ? select(auth.getState()) : auth.getState(), auth);
  const trip = id => ({_id: id, user: {_id: 'owner', username: 'Owner'}, title: id === 'trip-a' ? 'Original trip A' : 'New trip B', likes: [], comments: ['comment'], recommendations: [{_id: `${id}-rec`, name: `${id} place`, user: {_id: 'owner'}, photos: ['rec-photo']}], photos: [`${id}-photo`]});
  const defaultHandler = async (url, options) => reply(url.includes('/v2/trips/json/') ? trip(url.split('/').at(-1)) : url.endsWith('/comments') && options.method === 'GET' ? [{_id: 'comment', text: 'Comment', user: {_id: 'owner'}}] : url.endsWith('/likers') ? [] : {});
  let handler = defaultHandler;
  const api = load('src/services/api.js', '({getTripJsonById,getTripLikers,getTripComments,addTripComment,deleteTripComment,likeTrip,unlikeTrip,addRecommendation,updateRecommendation,deleteRecommendation,deleteTripPhoto})', {
    Constants: {expoConfig: {extra: {API_URL: 'https://fixture.invalid/api'}}}, Updates: {}, SecureStore,
    getCsrfToken: async () => 'fixture-csrf', fetch: (url, options) => { requests.push({url, options}); return handler(url, options); },
    require: () => ({useAuthStore}), console: {log() {}, warn() {}, error() {}},
  });
  socialStore = load('src/stores/tripSocialStore.js', 'useTripSocialStore', {...api, create, useAuthStore});
  const useTripSocialStore = Object.assign(select => select ? select(socialStore.getState()) : socialStore.getState(), socialStore);
  const components = Object.fromEntries(['CommentList', 'TripRecommendationCard', 'TransportIcon', 'TripMapThumbnail', 'AddCommentModal', 'AddRecommendationModal', 'LikersModal', 'MapModal', 'RecommendationDetailModal', 'IconStatDisplay', 'PhotoGallery', 'Section', 'SocialButton', 'Avatar'].map(n => [n, n]));
  const screen = fixture('app/(tabs)/trip/[id].js', 'TripDetailScreen', {}, {
    ...native, ...host.hooks, ...components, ...api, theme, useAuthStore, useTripSocialStore,
    StyleSheet: {create: v => v}, Feather: 'Feather', console: {log() {}, warn() {}, error() {}},
    useLocalSearchParams: () => route, useRouter: () => ({push: path => navigation.push(path), replace: path => navigation.push(path), canGoBack: () => true, back() {}}),
    useNavigation: () => ({getState: () => ({index: 2, routes: [{name: '(tabs)'}, {name: 'search/index'}, {name: '(tabs)'}]})}),
    BackHandler: {addEventListener: () => ({remove() {}})}, Alert: {alert: (...args) => alerts.push(args)},
    calcAvgSpeed: () => 1, kmOrMiles: () => '1 km', msToDuration: () => '', lineStringToCoords: () => [], isoToDate: () => '', getPoiNote: () => '',
  });
  await auth.getState().login(account);
  const render = () => host.render(() => screen.render());
  render(); await tick(); render();
  return {host, auth, social: socialStore, requests, alerts, navigation, route, trip, render, defaultHandler, handler: fn => { handler = fn; }};
}

async function openComments(f) {
  social(f.render(), 'message-circle').props.onPress();
  const expand = nodes(f.render(), 'TouchableOpacity').find(n => nodes(n, 'Text').some(t => t.children.some(x => typeof x === 'string' && x.startsWith('View all '))));
  expand.props.onPress(); await tick();
  return nodes(f.render(), 'CommentList')[0];
}

const {TabRouter} = require('expo-router/build/react-navigation/routers/TabRouter');
const CommonActions = require('expo-router/build/react-navigation/routers/CommonActions');
const {findDivergentState, getPayloadFromStateRoute} = require('expo-router/build/global-state/stateUtils');
const tabOptions = {routeNames: ['feed/index', 'trips/index', 'record/index', 'me/index', 'trip/[id]', 'trip/[id]/edit', 'me/edit-profile', 'me/settings', 'user/[userId]/index'], routeParamList: {}, routeGetIdList: {}};
function navigateThroughProfile() {
  const tabs = TabRouter({initialRouteName: 'trips/index', backBehavior: 'history'});
  const a = tabs.getRehydratedState({stale: true, index: 0, routes: [{name: 'trip/[id]', params: {id: 'trip-a'}}]}, tabOptions);
  const profile = tabs.getStateForAction(a, CommonActions.navigate({name: 'user/[userId]/index', params: {userId: 'owner'}}), tabOptions);
  const rootState = {type: 'stack', key: 'root', index: 2, routes: [{name: '(tabs)'}, {name: 'search/index'}, {name: '(tabs)', state: profile}]};
  const targetState = {routes: [{name: '(tabs)', state: {routes: [{name: 'trip/[id]', params: {id: 'trip-b'}}]}}]};
  const divergent = findDivergentState(targetState, rootState);
  assert.equal(divergent.navigationState, profile);
  const payload = getPayloadFromStateRoute(divergent.actionStateRoute);
  const b = tabs.getStateForAction(profile, CommonActions.navigate({name: payload.screen, params: payload.params}), tabOptions);
  assert.equal(b.routes[b.index].key, a.routes[a.index].key, 'installed router reuses the detail screen');
  return b.routes[b.index].params.id;
}

test('installed-router Trip A → profile → Trip B hides A on the first reused render and rejects every retained action', async () => {
  const f = await app(), pending = deferred(), original = f.render();
  const oldLike = like(original).props.onPress, oldMenu = menu(original), oldGallery = nodes(original, 'PhotoGallery')[0], oldForm = nodes(original, 'AddCommentModal')[0], oldRecForm = nodes(original, 'AddRecommendationModal')[0];
  assert.match(text(original), /Original trip A/);
  f.handler((url, options) => options.method === 'GET' ? pending.promise : reply({}));
  f.route.id = navigateThroughProfile();
  const first = f.render();
  assert.doesNotMatch(text(first), /Original trip A/); assert.equal(like(first), undefined); assert.equal(nodes(first, 'ActivityIndicator').length, 1);
  await oldLike(); oldMenu.props.onEdit(); oldMenu.props.onDelete(); oldMenu.props.onAddRecommendation();
  await oldGallery.props.onDelete('trip-a-photo');
  await assert.rejects(oldForm.props.onSubmit('stale'), /trip or account changed/);
  await assert.rejects(oldRecForm.props.onSubmit({name: 'stale'}), /trip or account changed/);
  assert.equal(mutations(f).length, 0); assert.equal(f.alerts.length, 0); assert.equal(f.navigation.length, 0);
  pending.resolve(reply(f.trip('trip-b'))); await tick();
  assert.match(text(f.render()), /New trip B/); await like(f.render()).props.onPress();
  assert.equal(mutations(f).length, 1); assert.ok(mutations(f)[0].url.endsWith('/trips/trip-b/like'));
  f.host.unmount();
});

test('route changes close old comments, likers, map and recommendation views; late A reads cannot populate B', async () => {
  const f = await app(), oldLikers = deferred();
  await openComments(f);
  nodes(f.render(), 'TripRecommendationCard')[0].props.onPress();
  nodes(f.render(), 'TouchableOpacity').find(n => nodes(n, 'TripMapThumbnail').length).props.onPress();
  f.handler((url, options) => url.includes('/trip-a/likers') ? oldLikers.promise : f.defaultHandler(url, options));
  countButton(f.render()).props.onPress(); await tick();
  assert.equal(nodes(f.render(), 'LikersModal')[0].props.isVisible, true);
  f.route.id = 'trip-b'; f.render(); await tick(); let tree = f.render();
  assert.equal(nodes(tree, 'CommentList').length, 0);
  assert.equal(nodes(tree, 'LikersModal')[0].props.isVisible, false);
  assert.equal(nodes(tree, 'MapModal')[0].props.visible, false);
  assert.equal(nodes(tree, 'RecommendationDetailModal')[0].props.isVisible, false);
  oldLikers.resolve(reply([{_id: 'private-a-liker'}])); await tick(); tree = f.render();
  assert.equal(nodes(tree, 'LikersModal')[0].props.likers.length, 0);
  countButton(tree).props.onPress(); await tick();
  assert.equal(nodes(f.render(), 'LikersModal')[0].props.isVisible, true);
  assert.equal(nodes(f.render(), 'LikersModal')[0].props.likers.length, 0); f.host.unmount();
});

test('same-trip refresh retains visible content and controls, reports failure inline, and retries only the read', async () => {
  const f = await app(), pending = deferred();
  f.handler((url, options) => options.method === 'GET' ? pending.promise : reply({}));
  f.host.blur(); f.host.focus();
  assert.match(text(f.render()), /Original trip A/); assert.ok(like(f.render()));
  pending.resolve(reply({message: 'Refresh offline'}, 503)); await tick();
  assert.match(text(f.render()), /Original trip A/); assert.match(text(f.render()), /Refresh offline/);
  f.handler(f.defaultHandler);
  await nodes(f.render(), 'Pressable').find(n => n.props.testID === 'trip-refresh-retry').props.onPress();
  assert.doesNotMatch(text(f.render()), /Refresh offline/); assert.equal(mutations(f).length, 0); f.host.unmount();
});

test('new trip failure cannot reveal old data or old errors; a mismatched server ID is rejected and current refocus recovers', async () => {
  const f = await app();
  f.handler(async () => reply(f.trip('trip-a'))); f.route.id = 'trip-b'; f.render(); await tick();
  assert.match(text(f.render()), /loaded trip did not match/); assert.doesNotMatch(text(f.render()), /Original trip A/); assert.equal(like(f.render()), undefined);
  f.route.id = 'trip-c'; const first = f.render(); assert.doesNotMatch(text(first), /did not match/);
  f.handler(f.defaultHandler); f.host.blur(); f.host.focus(); await tick();
  assert.ok(like(f.render())); assert.equal(mutations(f).length, 0); f.host.unmount();
});

for (const nextAccount of [other, account]) {
  test(`actual logout/unmount/login ${nextAccount._id} rejects old Like rollback and global alert`, async () => {
    const f = await app(), pending = deferred();
    f.handler((url, options) => options.method === 'POST' ? pending.promise : f.defaultHandler(url, options));
    const work = like(f.render()).props.onPress(); await tick(); assert.equal(mutations(f).length, 1);
    await f.auth.getState().logout(); f.host.unmount(); await f.auth.getState().login(nextAccount);
    f.social.getState().primeCounts({_id: 'trip-a', likesCount: 7, isLikedByCurrentUser: true, commentsCount: 3, recommendationCount: 2});
    pending.resolve(reply({message: 'Old Like failure'}, 503)); await work;
    const current = f.social.getState().trips['trip-a'];
    assert.equal(current.likesCount, 7); assert.equal(current.isLikedByCurrentUser, true);
    assert.equal(current.commentsCount, 3); assert.equal(current.recommendationCount, 2); assert.equal(f.alerts.length, 0);
  });
}

test('new-session data stays hidden while loading; old pending Like cannot release the new session request lock', async () => {
  const f = await app(), old = deferred(), fresh = deferred(), read = deferred();
  f.handler((url, options) => options.method === 'POST' ? old.promise : f.defaultHandler(url, options));
  const oldWork = like(f.render()).props.onPress(); await tick();
  await f.auth.getState().logout(); await f.auth.getState().login(other);
  f.handler((url, options) => options.method === 'GET' ? read.promise : fresh.promise);
  assert.doesNotMatch(text(f.render()), /Original trip A/);
  read.resolve(reply({...f.trip('trip-a'), likes: ['other', 'third']})); await tick();
  const newWork = like(f.render()).props.onPress(); await tick(); assert.equal(like(f.render()).props.disabled, true);
  old.resolve(reply({message: 'Old failure'}, 503)); await oldWork;
  assert.equal(like(f.render()).props.disabled, true); assert.equal(f.alerts.length, 0);
  fresh.resolve(reply({})); await newWork;
  assert.equal(like(f.render()).props.disabled, false); assert.equal(f.social.getState().trips['trip-a'].likesCount, 1);
  assert.ok(mutations(f)[1].url.endsWith('/trips/trip-a/like')); assert.equal(mutations(f)[1].options.method, 'DELETE'); f.host.unmount();
});

test('Like is single-flight, rolls back a current failure, retries, then sends Unlike with nonnegative count', async () => {
  const f = await app(), pending = deferred(); let first = true;
  f.handler((url, options) => options.method !== 'GET' && first ? pending.promise : f.defaultHandler(url, options));
  const press = like(f.render()).props.onPress, work = press(); await press(); await tick();
  assert.equal(mutations(f).length, 1); assert.equal(like(f.render()).props.disabled, true);
  pending.resolve(reply({message: 'Current failure'}, 503)); await work;
  assert.equal(f.social.getState().trips['trip-a'].likesCount, 0); assert.equal(f.alerts.length, 1); assert.equal(like(f.render()).props.disabled, false);
  first = false; await like(f.render()).props.onPress(); assert.equal(f.social.getState().trips['trip-a'].likesCount, 1);
  await like(f.render()).props.onPress(); assert.equal(f.social.getState().trips['trip-a'].likesCount, 0);
  assert.deepEqual(mutations(f).map(r => r.options.method), ['POST', 'POST', 'DELETE']); f.host.unmount();
});

test('a newer accepted same-trip read supersedes old Like rollback in both local detail and shared cache', async () => {
  const f = await app(), pending = deferred();
  f.handler((url, options) => options.method === 'POST' ? pending.promise : reply({...f.trip('trip-a'), likes: ['owner', 'second', 'third']}));
  const work = like(f.render()).props.onPress(); await tick(); f.host.blur(); f.host.focus(); await tick();
  assert.equal(f.social.getState().trips['trip-a'].likesCount, 3);
  pending.resolve(reply({message: 'Old failure'}, 503)); await work;
  assert.equal(f.social.getState().trips['trip-a'].likesCount, 3); assert.equal(f.social.getState().trips['trip-a'].isLikedByCurrentUser, true);
  assert.equal(f.alerts.length, 0); assert.equal(like(f.render()).props.disabled, false); f.host.unmount();
});

for (const kind of ['comment', 'recommendation']) {
  test(`old ${kind} confirmation cannot dispatch after route or account change`, async () => {
    for (const change of ['trip', 'account']) {
      const f = await app();
      if (kind === 'comment') (await openComments(f)).props.onDeleteComment('comment');
      else nodes(f.render(), 'TripRecommendationCard')[0].props.onLongPress();
      const confirm = f.alerts.at(-1)[2].find(button => button.style === 'destructive').onPress;
      if (change === 'trip') { f.route.id = 'trip-b'; f.render(); await tick(); }
      else { await f.auth.getState().logout(); await f.auth.getState().login(other); }
      const before = f.alerts.length; await confirm();
      assert.equal(mutations(f).length, 0); assert.equal(f.alerts.length, before); f.host.unmount();
    }
  });
}

for (const kind of ['comment', 'recommendation', 'photo']) {
  test(`late ${kind} deletion success/failure cannot alter a replacement trip or alert over it`, async () => {
    for (const fail of [false, true]) {
      const f = await app(), pending = deferred(); let invoke;
      if (kind === 'comment') { (await openComments(f)).props.onDeleteComment('comment'); invoke = f.alerts.at(-1)[2].find(button => button.style === 'destructive').onPress; }
      if (kind === 'recommendation') { nodes(f.render(), 'TripRecommendationCard')[0].props.onLongPress(); invoke = f.alerts.at(-1)[2].find(button => button.style === 'destructive').onPress; }
      if (kind === 'photo') invoke = () => nodes(f.render(), 'PhotoGallery')[0].props.onDelete('trip-a-photo');
      f.handler((url, options) => options.method === 'DELETE' ? pending.promise : f.defaultHandler(url, options));
      const work = invoke(); await tick(); assert.equal(mutations(f).length, 1);
      f.route.id = 'trip-b'; f.render(); await tick(); const before = f.alerts.length;
      pending.resolve(reply(fail ? {message: 'Old deletion failure'} : {}, fail ? 503 : 200)); await work;
      const tree = f.render(); assert.match(text(tree), /New trip B/); assert.equal(f.alerts.length, before);
      assert.equal(social(tree, 'message-circle').props.count, 1); assert.equal(social(tree, 'star').props.count, 1);
      assert.deepEqual(Array.from(nodes(tree, 'PhotoGallery')[0].props.photoIds), ['trip-b-photo']); f.host.unmount();
    }
  });
}

test('current comments, recommendation deletion, edit navigation and photo deletion still work', async () => {
  const f = await app();
  f.handler((url, options) => url.endsWith('/comments') ? reply(options.method === 'POST'
    ? {_id: 'new-comment', text: 'New', user: {_id: 'owner'}}
    : [{_id: 'new-comment', text: 'New', user: {_id: 'owner'}}, {_id: 'comment', text: 'Comment', user: {_id: 'owner'}}]) : f.defaultHandler(url, options));
  await nodes(f.render(), 'AddCommentModal')[0].props.onSubmit('New'); assert.equal(social(f.render(), 'message-circle').props.count, 2);
  nodes(f.render(), 'CommentList')[0].props.onDeleteComment('new-comment'); await f.alerts.at(-1)[2].find(button => button.style === 'destructive').onPress();
  assert.equal(social(f.render(), 'message-circle').props.count, 1);
  menu(f.render()).props.onEdit(); assert.equal(f.navigation.at(-1), '/trip/trip-a/edit');
  nodes(f.render(), 'TripRecommendationCard')[0].props.onLongPress(); await f.alerts.at(-1)[2].find(button => button.style === 'destructive').onPress();
  assert.equal(social(f.render(), 'star').props.count, 0);
  await nodes(f.render(), 'PhotoGallery')[0].props.onDelete('trip-a-photo'); assert.equal(nodes(f.render(), 'PhotoGallery').length, 0); f.host.unmount();
});


test('blurred detail failure cannot undo newer shared Unlike → Like actions with the same final values', async () => {
  const f = await app(), pending = deferred();
  f.handler((url, options) => options.method === 'POST' ? pending.promise : f.defaultHandler(url, options));
  const old = like(f.render()).props.onPress(); await tick(); f.host.blur(); f.handler(f.defaultHandler);
  await f.social.getState().toggleLike('trip-a'); await f.social.getState().toggleLike('trip-a');
  const revision = f.social.getState().trips['trip-a'].likeRevision;
  assert.equal(f.social.getState().trips['trip-a'].isLikedByCurrentUser, true);
  pending.resolve(reply({message: 'Old detail failure'}, 503)); await old;
  assert.equal(f.social.getState().trips['trip-a'].isLikedByCurrentUser, true);
  assert.equal(f.social.getState().trips['trip-a'].likesCount, 1);
  assert.equal(f.social.getState().trips['trip-a'].likeRevision, revision); assert.equal(f.alerts.length, 0); f.host.unmount();
});

test('same-value fresh list priming supersedes pending detail Like rollback without losing fresh counters', async () => {
  const f = await app(), pending = deferred();
  f.handler((url, options) => options.method === 'POST' ? pending.promise : f.defaultHandler(url, options));
  const old = like(f.render()).props.onPress(); await tick();
  f.social.getState().primeCounts({_id: 'trip-a', likesCount: 1, isLikedByCurrentUser: true, commentsCount: 4, recommendationCount: 2});
  const revision = f.social.getState().trips['trip-a'].likeRevision;
  pending.resolve(reply({message: 'Old detail failure'}, 503)); await old;
  const state = f.social.getState().trips['trip-a'];
  assert.equal(state.likeRevision, revision); assert.equal(state.isLikedByCurrentUser, true); assert.equal(state.likesCount, 1);
  assert.equal(state.commentsCount, 4); assert.equal(state.recommendationCount, 2); assert.equal(f.alerts.length, 0); f.host.unmount();
});

test('unrelated comments and recommendations do not suppress a legitimate current detail Like rollback', async () => {
  const f = await app(), pending = deferred();
  f.handler((url, options) => options.method === 'POST' ? pending.promise : f.defaultHandler(url, options));
  const old = like(f.render()).props.onPress(); await tick(); const revision = f.social.getState().trips['trip-a'].likeRevision;
  f.social.getState().setCommentCount('trip-a', 4); f.social.getState().setRecCount('trip-a', 2);
  assert.equal(f.social.getState().trips['trip-a'].likeRevision, revision);
  pending.resolve(reply({message: 'Current detail failure'}, 503)); await old;
  const state = f.social.getState().trips['trip-a'];
  assert.equal(state.likeRevision, revision + 1); assert.equal(state.isLikedByCurrentUser, false); assert.equal(state.likesCount, 0);
  assert.equal(state.commentsCount, 4); assert.equal(state.recommendationCount, 2); assert.equal(f.alerts.length, 1); f.host.unmount();
});

test('shared Like single-flight ignores pending taps and preserves unrelated data on rollback', async () => {
  for (const newerLikes of [false, true]) {
    const f = await app(), pending = deferred();
    f.handler((url, options) => options.method === 'POST' ? pending.promise : f.defaultHandler(url, options));
    const old = f.social.getState().toggleLike('trip-a'); await tick();
    f.social.getState().setCommentCount('trip-a', 4); f.social.getState().setRecCount('trip-a', 2);
    if (newerLikes) {
      f.handler(f.defaultHandler);
      await f.social.getState().toggleLike('trip-a'); await f.social.getState().toggleLike('trip-a');
    }
    const revision = f.social.getState().trips['trip-a'].likeRevision;
    pending.resolve(reply({message: 'Old shared failure'}, 503)); await old;
    const state = f.social.getState().trips['trip-a'];
    assert.equal(state.likeRevision, revision + 1);
    assert.equal(state.isLikedByCurrentUser, false); assert.equal(state.likesCount, 0);
    assert.equal(state.likePending, false);
    assert.equal(state.commentsCount, 4); assert.equal(state.recommendationCount, 2); f.host.unmount();
  }
});

test('old shared Like failure cannot undo a newer same-value detail Like or fresh server prime', async () => {
  for (const newerSource of ['detail', 'prime']) {
    const f = await app(), pending = deferred();
    f.handler((url, options) => options.method === 'POST' ? pending.promise : f.defaultHandler(url, options));
    const old = f.social.getState().toggleLike('trip-a'); await tick();
    f.handler(f.defaultHandler);
    if (newerSource === 'detail') await like(f.render()).props.onPress();
    else f.social.getState().primeCounts({_id: 'trip-a', likesCount: 1, isLikedByCurrentUser: true, commentsCount: 4, recommendationCount: 2});
    const revision = f.social.getState().trips['trip-a'].likeRevision;
    pending.resolve(reply({message: 'Old shared failure'}, 503)); await old;
    assert.equal(f.social.getState().trips['trip-a'].likeRevision, revision);
    assert.equal(f.social.getState().trips['trip-a'].isLikedByCurrentUser, true);
    assert.equal(f.social.getState().trips['trip-a'].likesCount, 1); assert.equal(f.alerts.length, 0); f.host.unmount();
  }
});

test('trip map receives current saved recommendations across close/reopen, refresh and trip switches', async () => {
  const f = await app();
  const openMap = () => nodes(f.render(), 'TouchableOpacity').find(n => nodes(n, 'TripMapThumbnail').length).props.onPress();
  openMap();
  let modal = nodes(f.render(), 'MapModal')[0];
  assert.equal(modal.props.visible, true);
  assert.deepEqual(modal.props.recommendations.map(r => r.name), ['trip-a place']);
  const oldKey = modal.props.key;
  modal.props.onClose(); assert.equal(nodes(f.render(), 'MapModal')[0].props.visible, false);
  openMap(); assert.deepEqual(nodes(f.render(), 'MapModal')[0].props.recommendations.map(r => r.name), ['trip-a place']);
  const pending = deferred();
  f.handler(() => pending.promise); f.route.id = 'trip-b';
  assert.equal(nodes(f.render(), 'MapModal').length, 0, 'old pins disappear before new trip read completes');
  pending.resolve(reply({...f.trip('trip-b'), recommendations: []})); await tick(); openMap();
  modal = nodes(f.render(), 'MapModal')[0];
  assert.equal(modal.props.visible, true); assert.equal(modal.props.recommendations.length, 0);
  assert.notEqual(modal.props.key, oldKey);
  f.handler(async () => reply({...f.trip('trip-b'), recommendations: [{_id: 'fresh', name: 'Refreshed place', location: {coordinates: [0, 0]}}]}));
  f.host.blur(); f.host.focus(); await tick();
  assert.deepEqual(nodes(f.render(), 'MapModal')[0].props.recommendations.map(r => r.name), ['Refreshed place']);
  assert.equal(mutations(f).length, 0); f.host.unmount();
});

test('saved-trip Add recommendation requests explicit route selection rather than a start/end default', async () => {
  const f = await app(), opened = [], edited = [];
  const coordinates = [[20, 10], [24, 12]];
  f.handler(async () => reply({...f.trip('trip-a'), simplifiedRoute: {type: 'LineString', coordinates}, startLocation: {coordinates: [20, 10]}, endLocation: {coordinates: [24, 12]}}));
  f.host.blur(); f.host.focus(); await tick(); const tree = f.render();
  nodes(tree, 'AddRecommendationModal')[0].props.ref.current = {open: (...args) => opened.push(args), openEdit: rec => edited.push(rec)};
  menu(tree).props.onAddRecommendation();
  assert.equal(opened.length, 1); assert.equal(opened[0][0], null); assert.equal(opened[0][1], 'trip-a');
  assert.equal(opened[0][2].requireLocationSelection, true); assert.deepEqual(opened[0][2].routeCoordinates, coordinates);
  nodes(tree, 'RecommendationDetailModal')[0].props.onEdit(f.trip('trip-a').recommendations[0]);
  assert.equal(edited.length, 1); assert.equal(edited[0]._id, 'trip-a-rec');
  f.route.id = 'trip-b'; f.render(); menu(tree).props.onAddRecommendation();
  assert.equal(opened.length, 1, 'retained trip A action cannot open picker for trip B');
  assert.equal(mutations(f).length, 0); f.host.unmount();
});
