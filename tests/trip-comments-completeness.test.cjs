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
const text = tree => nodes(tree, 'Text').flatMap(n => n.children).join(' ');
const social = (tree, icon) => nodes(tree, 'SocialButton').find(n => n.props.iconName === icon);


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

const existing = {_id: 'comment', text: 'Existing comment', user: {_id: 'owner'}};
const added = {_id: 'new-comment', text: 'Just posted', user: {_id: 'owner'}};
const commentReads = f => f.requests.filter(r => r.url.endsWith('/comments') && r.options.method === 'GET');
const commentPosts = f => f.requests.filter(r => r.url.endsWith('/comments') && r.options.method === 'POST');
const commentIds = f => Array.from(nodes(f.render(), 'CommentList')[0]?.props.comments || [], c => c._id);
const toggle = f => nodes(f.render(), 'TouchableOpacity').find(n => nodes(n, 'Text').some(t => t.children.some(x => typeof x === 'string' && (x === 'Hide comments' || x.startsWith('View all ')))));
const retry = f => nodes(f.render(), 'Pressable').find(n => n.props.testID === 'trip-comments-retry');

function addForm(f) {
  if (!nodes(f.render(), 'TouchableOpacity').some(n => nodes(n, 'Text').some(t => t.children.includes('Add a comment')))) {
    social(f.render(), 'message-circle').props.onPress();
  }
  nodes(f.render(), 'TouchableOpacity').find(n => nodes(n, 'Text').some(t => t.children.includes('Add a comment'))).props.onPress();
  const props = nodes(f.render(), 'AddCommentModal')[0].props;
  assert.equal(props.isVisible, true);
  const host = hooksFixture();
  const form = fixture('src/components/modals/AddCommentModal.js', 'AddCommentModal', props, {
    ...native, ...host.hooks, theme, StyleSheet: {create: x => x}, BottomModal: 'BottomModal', ModalHeader: 'ModalHeader',
  });
  const render = () => host.render(() => form.render());
  render(); nodes(render(), 'TextInput')[0].props.onChangeText('Just posted');
  return {host, render, send: () => nodes(render(), 'TouchableOpacity').find(n => n.props.testID === 'comment-submit').props.onPress()};
}

test('Add a comment before View all loads the complete list once and deduplicates the posted comment', async () => {
  const f = await app();
  f.handler((url, options) => url.endsWith('/comments')
    ? reply(options.method === 'POST' ? added : [added, existing]) : f.defaultHandler(url, options));
  const form = addForm(f);
  await form.send(); await tick();
  assert.equal(commentPosts(f).length, 1); assert.equal(commentReads(f).length, 1);
  assert.deepEqual(commentIds(f), ['new-comment', 'comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 2);
  assert.equal(f.social.getState().trips['trip-a'].commentsCount, 2);
  assert.match(text(f.render()), /Hide comments/);
  assert.equal(nodes(f.render(), 'AddCommentModal')[0].props.isVisible, false);
  assert.equal(retry(f), undefined); assert.equal(f.alerts.length, 0);
  form.host.unmount(); f.host.unmount();
});

test('successful send closes while full-list refresh is pending; failed refresh preserves the comment and retries GET only', async () => {
  const f = await app(), read = deferred(); let refresh = read.promise;
  f.handler((url, options) => url.endsWith('/comments')
    ? options.method === 'POST' ? reply(added) : refresh : f.defaultHandler(url, options));
  const form = addForm(f);
  await form.send(); await tick();
  assert.equal(nodes(f.render(), 'AddCommentModal')[0].props.isVisible, false);
  assert.deepEqual(commentIds(f), ['new-comment']);
  assert.equal(nodes(f.render(), 'ActivityIndicator').length, 1);
  read.resolve(reply({message: 'Offline'}, 503)); await tick();
  assert.match(text(f.render()), /Could not load all comments.*Offline/);
  assert.deepEqual(commentIds(f), ['new-comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 2);
  const reread = deferred(); refresh = reread.promise;
  const press = retry(f).props.onPress;
  const work = press(); assert.equal(press(), work); await tick();
  assert.equal(commentReads(f).length, 2); assert.equal(commentPosts(f).length, 1);
  reread.resolve(reply([added, existing])); await work;
  assert.deepEqual(commentIds(f), ['new-comment', 'comment']); assert.equal(retry(f), undefined);
  assert.equal(commentPosts(f).length, 1); assert.equal(f.alerts.length, 0);
  form.host.unmount(); f.host.unmount();
});

test('a pre-POST comments read merges the newer confirmed addition instead of hiding it', async () => {
  const f = await app(), read = deferred();
  f.handler((url, options) => url.endsWith('/comments')
    ? options.method === 'GET' ? read.promise : reply(added) : f.defaultHandler(url, options));
  social(f.render(), 'message-circle').props.onPress(); toggle(f).props.onPress(); await tick();
  const form = addForm(f); await form.send(); await tick();
  assert.equal(commentReads(f).length, 1, 'post reuses the in-flight complete read');
  read.resolve(reply([existing])); await tick();
  assert.deepEqual(commentIds(f), ['new-comment', 'comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 2);
  assert.equal(f.social.getState().trips['trip-a'].commentsCount, 2);
  form.host.unmount(); f.host.unmount();
});

test('deleting a freshly posted comment during its full-list refresh does not resurrect it or drop older comments', async () => {
  const f = await app(), read = deferred();
  f.handler((url, options) => url.endsWith('/comments')
    ? options.method === 'GET' ? read.promise : reply(added) : f.defaultHandler(url, options));
  const form = addForm(f); await form.send(); await tick();
  nodes(f.render(), 'CommentList')[0].props.onDeleteComment('new-comment');
  await f.alerts.at(-1)[2].find(b => b.style === 'destructive').onPress();
  read.resolve(reply([added, existing])); await tick();
  assert.deepEqual(commentIds(f), ['comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 1);
  assert.equal(f.social.getState().trips['trip-a'].commentsCount, 1);
  form.host.unmount(); f.host.unmount();
});

test('an already loaded collection adds locally without a redundant GET and two additions preserve the current count', async () => {
  const f = await app(); await openComments(f);
  let next = 0;
  f.handler((url, options) => url.endsWith('/comments') && options.method === 'POST'
    ? reply({...added, _id: `new-${++next}`}) : f.defaultHandler(url, options));
  for (let i = 0; i < 2; i += 1) { const form = addForm(f); await form.send(); await tick(); form.host.unmount(); }
  assert.equal(commentReads(f).length, 1); assert.equal(commentPosts(f).length, 2);
  assert.deepEqual(commentIds(f), ['new-2', 'new-1', 'comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 3);
  assert.equal(f.social.getState().trips['trip-a'].commentsCount, 3); f.host.unmount();
});

test('a failed POST remains retryable in the form and does not fetch or add a comment', async () => {
  const f = await app(); let fail = true;
  f.handler((url, options) => url.endsWith('/comments') && options.method === 'POST'
    ? reply(fail ? {message: 'Not saved'} : added, fail ? 503 : 200)
    : url.endsWith('/comments') && !fail ? reply([added, existing]) : f.defaultHandler(url, options));
  const form = addForm(f); await form.send();
  assert.match(text(form.render()), /Not saved/); assert.equal(nodes(f.render(), 'AddCommentModal')[0].props.isVisible, true);
  assert.equal(commentReads(f).length, 0); assert.deepEqual(commentIds(f), []);
  fail = false; await form.send(); await tick();
  assert.equal(commentPosts(f).length, 2); assert.equal(commentReads(f).length, 1);
  assert.deepEqual(commentIds(f), ['new-comment', 'comment']);
  form.host.unmount(); f.host.unmount();
});

for (const change of ['trip', 'logout', 'same-account-login', 'unmount']) {
  test(`late post-send comment read cannot affect ${change} replacement or dispatch retained retry`, async () => {
    const f = await app(), first = deferred();
    f.handler((url, options) => url.endsWith('/comments')
      ? options.method === 'POST' ? reply(added) : first.promise : f.defaultHandler(url, options));
    const form = addForm(f); await form.send(); await tick();
    first.resolve(reply({message: 'Offline'}, 503)); await tick();
    const retainedRetry = retry(f).props.onPress, later = deferred(); let delay = true;
    f.handler((url, options) => {
      if (delay && url.endsWith('/trip-a/comments') && options.method === 'GET') { delay = false; return later.promise; }
      return f.defaultHandler(url, options);
    });
    const pending = retainedRetry(); await tick();
    if (change === 'trip') { f.route.id = 'trip-b'; f.render(); await tick(); }
    else if (change === 'unmount') f.host.unmount();
    else { await f.auth.getState().logout(); if (change === 'same-account-login') await f.auth.getState().login(account); f.render(); await tick(); }
    const before = f.requests.length, currentCount = f.social.getState().trips['trip-a']?.commentsCount;
    await retainedRetry(); assert.equal(f.requests.length, before);
    later.resolve(reply([added, existing])); await pending;
    if (change !== 'unmount') {
      assert.deepEqual(commentIds(f), []); assert.equal(retry(f), undefined);
      assert.equal(f.social.getState().trips['trip-a']?.commentsCount, currentCount);
    }
    assert.equal(f.alerts.length, 0); form.host.unmount(); f.host.unmount();
  });
}

test('a main-trip read started before posting cannot replace the confirmed comment count', async () => {
  const f = await app(), old = deferred();
  f.handler((url, options) => url.includes('/v2/trips/json/') ? old.promise
    : url.endsWith('/comments') ? reply(options.method === 'POST' ? added : [added, existing]) : f.defaultHandler(url, options));
  f.host.blur(); f.host.focus(); await tick();
  const form = addForm(f); await form.send(); await tick();
  old.resolve(reply(f.trip('trip-a'))); await tick();
  assert.deepEqual(commentIds(f), ['new-comment', 'comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 2);
  assert.equal(f.social.getState().trips['trip-a'].commentsCount, 2);
  form.host.unmount(); f.host.unmount();
});

test('a GET that sees a committed POST before its response arrives does not double-count the saved comment', async () => {
  const f = await app(), read = deferred(), post = deferred();
  f.handler((url, options) => url.endsWith('/comments')
    ? options.method === 'GET' ? read.promise : post.promise : f.defaultHandler(url, options));
  social(f.render(), 'message-circle').props.onPress(); toggle(f).props.onPress(); await tick();
  const form = addForm(f), work = form.send(); await tick();
  read.resolve(reply([added, existing])); await tick();
  assert.equal(social(f.render(), 'message-circle').props.count, 2);
  post.resolve(reply(added)); await work; await tick();
  assert.deepEqual(commentIds(f), ['new-comment', 'comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 2);
  assert.equal(f.social.getState().trips['trip-a'].commentsCount, 2);
  assert.equal(commentReads(f).length, 1);
  form.host.unmount(); f.host.unmount();
});

test('a GET that already reflects a pending deletion does not decrement the count again on DELETE response', async () => {
  const f = await app(), read = deferred(), remove = deferred();
  f.handler((url, options) => url.endsWith('/comments')
    ? options.method === 'GET' ? read.promise : reply(added)
    : options.method === 'DELETE' ? remove.promise : f.defaultHandler(url, options));
  const form = addForm(f); await form.send(); await tick();
  nodes(f.render(), 'CommentList')[0].props.onDeleteComment('new-comment');
  const work = f.alerts.at(-1)[2].find(b => b.style === 'destructive').onPress(); await tick();
  // This GET started after POST success and already sees the remote deletion.
  // Its authoritative count must not be decremented twice.
  read.resolve(reply([existing])); await tick();
  assert.deepEqual(commentIds(f), ['comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 1);
  remove.resolve(reply({})); await work;
  assert.deepEqual(commentIds(f), ['comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 1);
  assert.equal(f.social.getState().trips['trip-a'].commentsCount, 1);
  form.host.unmount(); f.host.unmount();
});

test('a post-confirmation full-list read is authoritative when another client removes the new comment', async () => {
  const f = await app(), read = deferred();
  f.handler((url, options) => url.endsWith('/comments')
    ? options.method === 'GET' ? read.promise : reply(added) : f.defaultHandler(url, options));
  const form = addForm(f); await form.send(); await tick();
  assert.deepEqual(commentIds(f), ['new-comment']);
  // The new comment was removed remotely after POST success, before this GET's
  // snapshot. No permanent local addition overlay may resurrect it.
  read.resolve(reply([existing])); await tick();
  assert.deepEqual(commentIds(f), ['comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 1);
  assert.equal(f.social.getState().trips['trip-a'].commentsCount, 1);
  toggle(f).props.onPress(); toggle(f).props.onPress(); await tick();
  assert.deepEqual(commentIds(f), ['comment']); assert.equal(commentReads(f).length, 1);
  form.host.unmount(); f.host.unmount();
});

test('main trip comment IDs also prevent double-counting a POST observed before its response arrives', async () => {
  const f = await app(), main = deferred(), post = deferred(), comments = deferred();
  f.handler((url, options) => url.includes('/v2/trips/json/') ? main.promise
    : url.endsWith('/comments') ? options.method === 'POST' ? post.promise : comments.promise : f.defaultHandler(url, options));
  f.host.blur(); f.host.focus(); await tick();
  const form = addForm(f), work = form.send(); await tick();
  main.resolve(reply({...f.trip('trip-a'), comments: ['new-comment', 'comment']})); await tick();
  post.resolve(reply(added)); await work; await tick();
  assert.equal(social(f.render(), 'message-circle').props.count, 2);
  assert.equal(f.social.getState().trips['trip-a'].commentsCount, 2);
  comments.resolve(reply([added, existing])); await tick();
  assert.deepEqual(commentIds(f), ['new-comment', 'comment']);
  assert.equal(social(f.render(), 'message-circle').props.count, 2);
  form.host.unmount(); f.host.unmount();
});
