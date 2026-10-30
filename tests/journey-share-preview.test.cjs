const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, load, read, nodes, native } = require('./helpers/component-fixture.cjs');
const { hooksFixture } = require('./helpers/hooks-fixture.cjs');
const theme = load('src/theme.js', 'theme');
const utils = load('src/utils/journeyShare.js', '({canPrepareJourneyShare,canShareJourney,journeyShareTitle,journeySharePhotoId,journeyShareWarning,createJourneyShareController})');
const { kmOrMiles } = load('src/utils/format.js', '({kmOrMiles})');
const { createPhotoSource } = load('src/utils/photoSource.js', '({createPhotoSource})');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const json = value => JSON.parse(JSON.stringify(value));
const photoId = 'a'.repeat(24);
const text = tree => nodes(tree, 'Text').map(node => node.children.join('')).join('\n');
const button = (tree, label) => nodes(tree, 'Pressable').find(node => text(node) === label || node.props.accessibilityLabel === label);
const ownTrip = (patch = {}) => ({ _id: 'trip', user: { _id: 'owner', settings: { preferredUnits: 'imperial' } }, title: '東京 🌍 journey', distanceMeters: 100000, photos: [], defaultTripVisibility: 'public', ...patch });

function preview(patch = {}, options = {}) {
  const host = hooksFixture(), captures = [], shares = [], discarded = [], timers = new Map(), sources = [];
  let current = true, closed = 0, prune = 0, timerId = 0, mediaKey = 'session-a', token = 'synthetic-token-a';
  const props = { trip: ownTrip(patch), units: 'metric', isCurrent: () => current, onClose: () => { closed++; current = false; } };
  const screen = fixture('src/components/sharing/JourneySharePreview.js', 'JourneySharePreview', props, {
    ...native, ...host.hooks, ...utils, theme, kmOrMiles, StyleSheet: { create: x => x, absoluteFillObject: {} }, Constants: { expoConfig: { name: 'Travel Test' } },
    useWindowDimensions: () => ({ width: 400 }), BottomModal: 'BottomModal', ModalHeader: 'ModalHeader', JourneyShareCard: 'JourneyShareCard',
    usePhotoSource: () => ({ mediaKey, getPhotoSource: id => { const source = createPhotoSource(id, 'https://fixture.invalid/api', token, mediaKey); sources.push(source); return source; } }),
    setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; }, clearTimeout: id => timers.delete(id),
    captureJourneyImage: async view => { captures.push(view); return options.capture ? options.capture(view) : `file:///cache/preview-${captures.length}.png`; },
    shareJourneyImage: async (uri, guard) => { shares.push({ uri, guard }); return options.share ? options.share(uri, guard) : 'closed'; },
    discardJourneyImage: async uri => { discarded.push(uri); }, pruneJourneyImages: async () => { prune++; },
  });
  const render = () => host.render(() => screen.render());
  const layout = () => nodes(render(), 'View').find(node => node.props.onLayout).props.onLayout({ nativeEvent: { layout: { width: 352, height: 440 } } });
  const card = () => nodes(render(), 'JourneyShareCard')[0];
  const image = () => nodes(render(), 'Image')[0];
  const settle = async () => { render(); await tick(); render(); };
  const ready = async () => { layout(); await settle(); const imageNode = image(); assert.ok(imageNode, 'generated PNG must exist'); imageNode.props.onLoad(); render(); };
  return { props, render, layout, card, image, ready, settle, captures, shares, discarded, sources, timers, host,
    expirePhotos() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); } },
    closed: () => closed, prune: () => prune, stale: () => { current = false; }, session: () => { mediaKey = 'session-b'; token = 'synthetic-token-b'; } };
}

test('missing-photo preview renders a branded allowlisted card and waits for layout and generated PNG display', async () => {
  const f = preview(); let tree = f.render();
  assert.equal(f.captures.length, 0); assert.equal(f.prune(), 1); assert.equal(button(tree, 'Share image').props.disabled, true);
  const card = f.card(); assert.equal(card.props.title, '東京 🌍 journey'); assert.equal(card.props.distance, '100.0 km'); assert.equal(card.props.appName, 'Travel Test'); assert.equal(card.props.photoSource, undefined);
  assert.match(text(tree), /No trip photo/); assert.match(text(tree), /No route or location metadata/); assert.match(text(tree), /title or photo may still reveal places/);
  f.layout(); await f.settle(); tree = f.render(); assert.equal(f.captures.length, 1); assert.equal(f.shares.length, 0); assert.equal(button(tree, 'Share image').props.disabled, true);
  button(tree, 'Share image').props.onPress(); assert.equal(f.shares.length, 0);
  f.image().props.onLoad(); tree = f.render(); assert.equal(button(tree, 'Share image').props.disabled, false);
  button(tree, 'Share image').props.onPress(); await tick(); assert.equal(f.shares.length, 1);
  assert.equal(f.shares[0].uri, 'file:///cache/preview-1.png'); f.host.unmount(); assert.deepEqual(f.discarded, ['file:///cache/preview-1.png']);
});

test('real card contains only title, distance and app branding texts, no location or auth data', () => {
  const source = createPhotoSource(photoId, 'https://fixture.invalid/api', 'synthetic-secret', 'non-secret-cache-key');
  const props = { width: 352, title: 'Unicode 🧭 東京', distance: '0.0 km', appName: 'Travel Test', photoSource: source,
    trip: { description: 'PRIVATE DESCRIPTION', coordinates: [123, 45] }, onPhotoLoad() {}, onPhotoError() {} };
  const screen = fixture('src/components/sharing/JourneyShareCard.js', 'JourneyShareCard', props, { ...native, theme, StyleSheet: { create: x => x, absoluteFillObject: {} } });
  const tree = screen.render(); assert.equal(tree.props.collapsable, false); assert.equal(tree.props.testID, 'journey-image-card');
  assert.deepEqual(nodes(tree, 'Text').map(node => node.children.join('')), ['Unicode 🧭 東京', '0.0 km', 'Travel Test']);
  assert.equal(nodes(tree, 'Image')[0].props.source, source); assert.equal(nodes(tree, 'Text')[0].props.numberOfLines, 3); assert.equal(nodes(tree, 'Text')[0].props.ellipsizeMode, 'tail');
  assert.doesNotMatch(text(tree), /PRIVATE|synthetic-secret|fixture.invalid|123/);
});

test('saved photo source uses header authentication and capture waits for load', async () => {
  const f = preview({ photos: [photoId] }); f.layout(); await f.settle();
  assert.equal(f.captures.length, 0); assert.equal(f.timers.size, 1); assert.equal([...f.timers.values()][0].ms, 8000);
  const source = f.card().props.photoSource; assert.equal(source.headers.Authorization, 'Bearer synthetic-token-a'); assert.doesNotMatch(source.uri, /synthetic-token/); assert.equal(source.cache, 'reload');
  f.card().props.onPhotoLoad(); await f.settle(); assert.equal(f.captures.length, 1); assert.equal(f.timers.size, 0); assert.equal(f.card().props.photoSource, source);
  f.host.unmount();
});

for (const failure of ['error', 'timeout', 'skip']) test(`photo ${failure} generates explicit decorative fallback without waiting indefinitely`, async () => {
  const f = preview({ photos: [photoId] }); f.layout(); f.render(); const oldLoad = f.card().props.onPhotoLoad;
  if (failure === 'error') f.card().props.onPhotoError();
  if (failure === 'timeout') f.expirePhotos();
  if (failure === 'skip') button(f.render(), 'Use illustration instead').props.onPress();
  await f.settle(); assert.equal(f.captures.length, 1); assert.equal(f.card().props.photoSource, undefined); assert.match(text(f.render()), /Photo unavailable/);
  oldLoad(); await f.settle(); assert.equal(f.card().props.photoSource, undefined, 'late original load cannot undo selected fallback'); assert.equal(f.captures.length, 1);
  f.host.unmount();
});

for (const visibility of ['private', 'followers_only', undefined, 'unknown']) test(`${visibility}: preview requires explicit privacy consent before sharing and changes no trip data`, async () => {
  const f = preview({ defaultTripVisibility: visibility }), original = JSON.stringify(f.props.trip); await f.ready(); let tree = f.render();
  assert.match(text(tree), /leaves the app’s privacy controls/); const checkbox = nodes(tree, 'Pressable').find(node => node.props.accessibilityRole === 'checkbox');
  assert.equal(checkbox.props.accessibilityState.checked, false); assert.equal(button(tree, 'Share image').props.disabled, true);
  button(tree, 'Share image').props.onPress(); assert.equal(f.shares.length, 0);
  checkbox.props.onPress(); tree = f.render(); assert.equal(button(tree, 'Share image').props.disabled, false);
  button(tree, 'Share image').props.onPress(); await tick(); assert.equal(f.shares.length, 1); assert.equal(JSON.stringify(f.props.trip), original);
  f.host.unmount();
});

test('viewer units update preview in place, discard old image and block stale share callbacks before new PNG is displayed', async () => {
  const f = preview(); await f.ready(); const oldShare = button(f.render(), 'Share image').props.onPress;
  f.props.units = 'imperial'; let tree = f.render(); assert.equal(f.card().props.distance, '62.1 mi'); assert.equal(button(tree, 'Share image').props.disabled, true);
  oldShare(); assert.equal(f.shares.length, 0); await f.settle(); assert.equal(f.captures.length, 2); assert.deepEqual(f.discarded, ['file:///cache/preview-1.png']);
  f.image().props.onLoad(); tree = f.render(); assert.equal(button(tree, 'Share image').props.disabled, false);
  f.props.units = 'metric'; await f.settle(); assert.equal(f.card().props.distance, '100.0 km'); assert.equal(f.captures.length, 3);
  f.host.unmount();
});

for (const [value, expected] of [[0, '0.0 km'], [-1, '–'], [undefined, '–'], [null, '–'], [NaN, '–'], [Infinity, '–'], ['1000', '–']]) test(`distance ${String(value)} is rendered safely without invented metrics`, () => {
  const f = preview({ distanceMeters: value }); assert.equal(f.card().props.distance, expected); assert.doesNotMatch(text(f.render()), /NaN|Infinity|mph|km\/h/); f.host.unmount();
});

test('long Unicode title is bounded; export preserves card truncation and safe fallback text', () => {
  const f = preview({ title: '🚲東京'.repeat(100) }); assert.equal(Array.from(f.card().props.title).length, 180); assert.equal(f.card().props.title, '🚲東京'.repeat(60)); f.host.unmount();
});

test('capture errors and generated-PNG display failure keep sharing disabled and allow explicit retry', async () => {
  let fail = true; const f = preview({}, { capture: async () => { if (fail) throw Error('private-url-token'); return 'file:///retry.png'; } });
  f.layout(); await f.settle(); let tree = f.render(); assert.equal(button(tree, 'Share image').props.disabled, true); assert.match(text(tree), /Couldn’t create/); assert.doesNotMatch(text(tree), /private-url-token/);
  fail = false; button(tree, 'Create image again').props.onPress(); await f.settle(); f.image().props.onError(); tree = f.render();
  assert.equal(button(tree, 'Share image').props.disabled, true); assert.match(text(tree), /Couldn’t display/);
  button(tree, 'Create image again').props.onPress(); await f.settle(); f.image().props.onLoad(); assert.equal(button(f.render(), 'Share image').props.disabled, false); f.host.unmount();
});

for (const interruption of ['unmount', 'account']) test(`${interruption} while image generation is pending suppresses stale preview/share`, async () => {
  const pending = deferred(), f = preview({}, { capture: () => pending.promise }); f.layout(); f.render();
  if (interruption === 'unmount') f.host.unmount();
  if (interruption === 'account') f.stale();
  pending.resolve('file:///late.png'); await tick(); assert.equal(f.shares.length, 0); assert.deepEqual(f.discarded, ['file:///late.png']);
  assert.equal(f.closed(), interruption.endsWith('close') ? 1 : 0);
  if (interruption !== 'unmount') f.host.unmount();
});

test('rapid share taps enter one native menu, cancellation returns ready and no success claim is rendered', async () => {
  const pending = deferred(), f = preview({}, { share: () => pending.promise }); await f.ready(); const share = button(f.render(), 'Share image').props.onPress;
  share(); share(); assert.equal(f.shares.length, 1); assert.equal(button(f.render(), 'Opening share menu…').props.disabled, true);
  pending.resolve('closed'); await tick(); assert.equal(button(f.render(), 'Share image').props.disabled, false); assert.doesNotMatch(text(f.render()), /sent|posted|successfully/); f.host.unmount();
});

function action(patch = {}, options = {}) {
  const host = hooksFixture(), reads = []; let state = { user: { _id: 'owner', settings: { preferredUnits: 'metric' } }, token: 'session-a', sessionEpoch: 1, isAuthenticated: true, isSessionChanging: false }, allowed = true;
  const useAuthStore = Object.assign(selector => selector ? selector(state) : state, { getState: () => state });
  const props = { trip: ownTrip(), canAct: () => allowed, ...patch };
  const screen = fixture('src/components/sharing/JourneyShareAction.native.js', 'JourneyShareAction', props, {
    ...native, ...host.hooks, ...utils, theme, useAuthStore, StyleSheet: { create: x => x }, Feather: 'Feather', JourneySharePreview: 'JourneySharePreview', BottomModal: 'BottomModal', ModalHeader: 'ModalHeader',
    getTripJsonById: async id => { reads.push(id); return options.load ? options.load(id) : ownTrip({ _id: id }); },
    useViewerUnits: () => state.user?.settings?.preferredUnits === 'imperial' ? 'imperial' : 'metric',
  });
  const render = () => host.render(() => screen.render());
  return { props, host, render, reads, settle: async () => { await tick(); return render(); }, open: () => button(render(), 'Share journey')?.props.onPress(),
    setSession: patch => { state = { ...state, ...patch }; }, deny: () => { allowed = false; } };
}

test('share action mounts only for owned journeys and forwards viewer preference, not owner settings', () => {
  for (const patch of [{ user: { _id: 'other' } }, { user: null }, { _id: null }]) { const f = action({ trip: ownTrip(patch) }); assert.equal(f.render(), null); f.host.unmount(); }
  const f = action(); f.open(); f.open(); let tree = f.render(); assert.equal(nodes(tree, 'JourneySharePreview').length, 1); assert.equal(nodes(tree, 'JourneySharePreview')[0].props.units, 'metric');
  f.setSession({ user: { _id: 'owner', settings: { preferredUnits: 'imperial' } } }); tree = f.render(); assert.equal(nodes(tree, 'JourneySharePreview')[0].props.units, 'imperial');
  f.host.unmount();
});

for (const interruption of ['logout', 'account', 'token', 'epoch', 'changing', 'trip', 'denied', 'blur', 'unmount', 'close']) test(`action ${interruption} invalidates old preview guard without opening external export`, () => {
  const f = action(); f.open(); const original = nodes(f.render(), 'JourneySharePreview')[0]; assert.equal(original.props.isCurrent(), true);
  if (interruption === 'logout') f.setSession({ user: null, token: null, isAuthenticated: false });
  if (interruption === 'account') f.setSession({ user: { _id: 'other' } });
  if (interruption === 'token') f.setSession({ token: 'session-b' });
  if (interruption === 'epoch') f.setSession({ sessionEpoch: 2 });
  if (interruption === 'changing') f.setSession({ isSessionChanging: true });
  if (interruption === 'trip') { f.props.trip = ownTrip({ _id: 'new-trip' }); f.render(); }
  if (interruption === 'denied') f.deny();
  if (interruption === 'blur') f.host.blur();
  if (interruption === 'unmount') f.host.unmount();
  if (interruption === 'close') nodes(f.render(), 'BottomModal')[0].props.onClose();
  assert.equal(original.props.isCurrent(), false);
  if (interruption !== 'unmount') { assert.equal(nodes(f.render(), 'JourneySharePreview').length, 0); f.host.unmount(); }
});

test('action close/back then reopen creates a fresh preview and stale handlers cannot validate previous selection', () => {
  const f = action(); f.open(); const original = nodes(f.render(), 'JourneySharePreview')[0]; nodes(f.render(), 'BottomModal')[0].props.onClose();
  assert.equal(nodes(f.render(), 'JourneySharePreview').length, 0); f.open(); const next = nodes(f.render(), 'JourneySharePreview')[0];
  assert.equal(original.props.isCurrent(), false); assert.equal(next.props.isCurrent(), true); f.host.unmount();
});

test('card container forwards saved trip and existing action guard; default/web entry never creates upload links', () => {
  assert.match(read('src/components/TripCardContainer.js'), /shareTrip=\{trip\}/); assert.match(read('src/components/TripCardContainer.js'), /canShareAction=\{canAct\}/);
  assert.match(read('src/components/TripCard.js'), /<JourneyShareAction trip=\{shareTrip\} canAct=\{canShareAction\} ownerIdHint=\{shareOwnerId\}/);
  assert.doesNotMatch(read('src/components/TripCardContainer.js'), /console\.log\("share trip/);
  assert.equal(load('src/components/sharing/JourneyShareAction.js', 'JourneyShareAction')(), null);
});

test('retry photo ignores late callbacks from prior image attempts and captures only after the new load', async () => {
  const f = preview({ photos: [photoId] }); f.layout(); f.render(); const oldCard = f.card(); oldCard.props.onPhotoError(); await f.settle();
  button(f.render(), 'Retry photo').props.onPress(); f.render(); const newCard = f.card(); const before = f.captures.length;
  oldCard.props.onPhotoLoad(); await f.settle(); assert.equal(f.captures.length, before); assert.match(text(f.render()), /Loading your photo/);
  oldCard.props.onPhotoError(); await f.settle(); assert.equal(f.captures.length, before); assert.match(text(f.render()), /Loading your photo/);
  newCard.props.onPhotoLoad(); await f.settle(); assert.equal(f.captures.length, before + 1); f.host.unmount();
});

test('tap share action stops parent trip-card navigation and passes current saved trip to preview', () => {
  const f = action(); let stopped = 0; button(f.render(), 'Share journey').props.onPress({ stopPropagation: () => { stopped++; } });
  assert.equal(stopped, 1); assert.equal(nodes(f.render(), 'JourneySharePreview')[0].props.trip, f.props.trip); f.host.unmount();
});

test('one shared native modal owns Back/dismiss and header close for loading and image preview', () => {
  assert.match(read('src/components/modals/BottomModal.js'), /onRequestClose=\{onClose\}/);
  assert.match(read('src/components/sharing/JourneyShareAction.native.js'), /<BottomModal visible onClose=\{closeSelection\}/);
  assert.match(read('src/components/sharing/JourneyShareAction.native.js'), /<ModalHeader title="Share journey" onClose=\{closeSelection\}/);
  assert.doesNotMatch(read('src/components/sharing/JourneySharePreview.js'), /<BottomModal|<ModalHeader/);
});

for (const failure of ['capture', 'preview-display']) for (const settlement of ['load', 'error', 'timeout']) test(`${failure} retry remounts authenticated photo and waits for its new ${settlement} before recapturing`, async () => {
  let captureCalls = 0;
  const f = preview({ photos: [photoId] }, { capture: async () => {
    captureCalls++;
    if (failure === 'capture' && captureCalls === 1) throw Error('synthetic capture failed');
    return `file:///capture-${captureCalls}.png`;
  } });
  f.layout(); f.render(); const originalCard = f.card(); originalCard.props.onPhotoLoad(); await f.settle();
  assert.equal(f.captures.length, 1);
  if (failure === 'preview-display') { f.image().props.onError(); f.render(); }
  button(f.render(), 'Create image again').props.onPress(); await f.settle(); const retryCard = f.card();
  assert.notEqual(retryCard.props.key, originalCard.props.key, 'native photo is remounted');
  assert.equal(retryCard.props.photoSource.headers.Authorization, 'Bearer synthetic-token-a');
  assert.equal(retryCard.props.photoSource.cache, 'reload');
  assert.equal(f.captures.length, 1, 'the remounted photo must settle before recapture');
  assert.equal(button(f.render(), 'Share image').props.disabled, true); assert.match(text(f.render()), /Loading your photo/);
  originalCard.props.onPhotoLoad(); originalCard.props.onPhotoError(); await f.settle(); assert.equal(f.captures.length, 1, 'stale callbacks cannot satisfy reload');
  if (settlement === 'load') retryCard.props.onPhotoLoad();
  if (settlement === 'error') retryCard.props.onPhotoError();
  if (settlement === 'timeout') f.expirePhotos();
  await f.settle(); assert.equal(f.captures.length, 2);
  assert.equal(!!f.card().props.photoSource, settlement === 'load');
  assert.equal(button(f.render(), 'Share image').props.disabled, true, 'recaptured PNG itself must display');
  f.image().props.onLoad(); assert.equal(button(f.render(), 'Share image').props.disabled, false);
  f.host.unmount();
});

test('live store units change invalidates old preview handoff guard before action rerender', () => {
  const f = action(); f.open(); const metric = nodes(f.render(), 'JourneySharePreview')[0];
  assert.equal(metric.props.units, 'metric'); assert.equal(metric.props.isCurrent(), true);
  f.setSession({ user: { _id: 'owner', settings: { preferredUnits: 'imperial' } } });
  assert.equal(metric.props.isCurrent(), false, 'native handoff cannot proceed with stale viewer units before React rerenders');
  const imperial = nodes(f.render(), 'JourneySharePreview')[0]; assert.equal(imperial.props.units, 'imperial'); assert.equal(imperial.props.isCurrent(), true);
  f.setSession({ user: { _id: 'owner', settings: { preferredUnits: 'metric' } } }); assert.equal(imperial.props.isCurrent(), false);
  f.host.unmount();
});

for (const change of ['trip', 'account', 'token', 'epoch']) test(`retained share entry cannot open after ${change} changes`, () => {
  const f = action(), oldOpen = button(f.render(), 'Share journey').props.onPress;
  if (change === 'trip') { f.props.trip = ownTrip({ _id: 'new-trip' }); f.render(); }
  if (change === 'account') f.setSession({ user: { _id: 'other' } });
  if (change === 'token') f.setSession({ token: 'session-b' });
  if (change === 'epoch') f.setSession({ sessionEpoch: 2 });
  oldOpen(); assert.equal(nodes(f.render(), 'JourneySharePreview').length, 0); f.host.unmount();
});

for (const projection of ['my-trips', 'feed', 'profile']) test(`${projection} projection hydrates one full journey and verifies owner before creating any image preview`, async () => {
  const pending = deferred(), listed = ownTrip({ photos: undefined });
  if (projection === 'my-trips') delete listed.user;
  const full = ownTrip({ photos: [photoId], title: 'Hydrated journey', defaultTripVisibility: 'private' });
  const f = action({ trip: listed, ownerIdHint: projection === 'my-trips' ? 'owner' : undefined }, { load: () => pending.promise });
  f.open(); f.open(); let tree = f.render(); assert.deepEqual(f.reads, ['trip']); assert.equal(nodes(tree, 'JourneySharePreview').length, 0);
  assert.equal(nodes(tree, 'BottomModal').length, 1); assert.equal(nodes(tree, 'ModalHeader').length, 1); assert.match(text(tree), /Preparing your journey/);
  pending.resolve(full); await f.settle(); tree = f.render(); const content = nodes(tree, 'JourneySharePreview')[0];
  assert.equal(content.props.trip, full); assert.equal(content.props.isCurrent(), true); assert.equal(content.props.trip.photos[0], photoId); assert.equal(content.props.trip.defaultTripVisibility, 'private');
  assert.equal(nodes(tree, 'BottomModal').length, 1); assert.doesNotMatch(text(tree), /Preparing your journey/); f.host.unmount();
});

test('full detail/search trip reuses saved owner+photo payload without fetching or widening permission', () => {
  const f = action(); f.open(); const content = nodes(f.render(), 'JourneySharePreview')[0];
  assert.equal(content.props.trip, f.props.trip); assert.equal(content.props.isCurrent(), true); assert.equal(f.reads.length, 0); f.host.unmount();
  const other = action({ trip: ownTrip({ user: { _id: 'other' } }), ownerIdHint: 'owner' }); assert.equal(other.render(), null); other.open(); assert.equal(other.reads.length, 0); other.host.unmount();
});

for (const result of ['wrong-id', 'wrong-owner', 'missing-owner', 'permission-error', 'network-error']) test(`hydration ${result} never renders image preview and provides a generic retry/cancel state`, async () => {
  const projection = { _id: 'trip', title: 'Own-list row' };
  const f = action({ trip: projection, ownerIdHint: 'owner' }, { load: async () => {
    if (result === 'permission-error') throw Error('403 private-url?token=secret');
    if (result === 'network-error') throw Error('offline: Bearer token-secret');
    if (result === 'wrong-id') return ownTrip({ _id: 'other-trip' });
    if (result === 'wrong-owner') return ownTrip({ user: { _id: 'other' } });
    return { _id: 'trip', photos: [] };
  } });
  f.open(); await f.settle(); const tree = f.render(); assert.equal(nodes(tree, 'JourneySharePreview').length, 0);
  assert.equal(nodes(tree, 'Text').filter(node => node.props.accessibilityRole === 'alert').length, 1);
  assert.ok(button(tree, 'Try again')); assert.ok(button(tree, 'Cancel')); assert.doesNotMatch(text(tree), /private-url|token-secret|token=secret|403/); f.host.unmount();
});

for (const interruption of ['cancel', 'modal-back', 'header', 'blur', 'unmount', 'account', 'token', 'epoch', 'new-trip', 'denied']) test(`hydration ${interruption} ignores late data and errors and cannot reopen its modal`, async () => {
  for (const rejects of [false, true]) {
    const pending = deferred(), f = action({ trip: ownTrip({ photos: undefined }) }, { load: () => pending.promise }); f.open(); const tree = f.render();
    if (interruption === 'cancel') button(tree, 'Cancel').props.onPress();
    if (interruption === 'modal-back') nodes(tree, 'BottomModal')[0].props.onClose();
    if (interruption === 'header') nodes(tree, 'ModalHeader')[0].props.onClose();
    if (interruption === 'blur') f.host.blur();
    if (interruption === 'unmount') f.host.unmount();
    if (interruption === 'account') f.setSession({ user: { _id: 'other' }, token: 'session-b', sessionEpoch: 2 });
    if (interruption === 'token') f.setSession({ token: 'session-b' });
    if (interruption === 'epoch') f.setSession({ sessionEpoch: 2 });
    if (interruption === 'new-trip') { f.props.trip = ownTrip({ _id: 'new-trip', photos: undefined }); f.render(); }
    if (interruption === 'denied') f.deny();
    rejects ? pending.reject(Error('late private fetch error')) : pending.resolve(ownTrip({ photos: [photoId] })); await tick();
    assert.equal(f.reads.length, 1);
    if (interruption !== 'unmount') { const next = f.render(); assert.equal(nodes(next, 'JourneySharePreview').length, 0); assert.equal(nodes(next, 'BottomModal').length, 0); assert.doesNotMatch(text(next), /late private/); f.host.unmount(); }
  }
});

test('hydration network retry is single-flight and retains the same selection until confirmed full data arrives', async () => {
  const second = deferred(); let attempts = 0; const full = ownTrip({ photos: [photoId] });
  const f = action({ trip: ownTrip({ photos: undefined }) }, { load: async () => { if (++attempts === 1) throw Error('offline'); return second.promise; } });
  f.open(); await f.settle(); const retry = button(f.render(), 'Try again').props.onPress; retry(); retry(); f.open();
  assert.equal(f.reads.length, 2); assert.equal(nodes(f.render(), 'JourneySharePreview').length, 0); assert.match(text(f.render()), /Preparing your journey/);
  second.resolve(full); await f.settle(); assert.equal(nodes(f.render(), 'JourneySharePreview')[0].props.trip, full); f.host.unmount();
});

test('cancel/reopen starts a new hydration identity and old result/retry cannot replace or block the new preview', async () => {
  const older = deferred(), newer = deferred(); let calls = 0;
  const f = action({ trip: ownTrip({ photos: undefined }) }, { load: () => (++calls === 1 ? older.promise : newer.promise) });
  f.open(); nodes(f.render(), 'BottomModal')[0].props.onClose(); f.render(); f.open(); assert.equal(f.reads.length, 2);
  older.resolve(ownTrip({ title: 'Old private payload', photos: [photoId] })); await f.settle(); assert.equal(nodes(f.render(), 'JourneySharePreview').length, 0);
  const fresh = ownTrip({ title: 'Fresh payload', photos: [photoId] }); newer.resolve(fresh); await f.settle(); assert.equal(nodes(f.render(), 'JourneySharePreview')[0].props.trip, fresh); f.host.unmount();
});

for (const closer of ['modal-back', 'header']) test(`${closer} invalidates a visible preview guard and pending capture is discarded on child unmount`, async () => {
  const f = action(); f.open(); const tree = f.render(), child = nodes(tree, 'JourneySharePreview')[0];
  const pending = deferred(), image = preview({}, { capture: () => pending.promise }); image.props.isCurrent = child.props.isCurrent;
  image.layout(); image.render(); assert.equal(image.captures.length, 1);
  nodes(tree, closer === 'header' ? 'ModalHeader' : 'BottomModal')[0].props.onClose(); assert.equal(child.props.isCurrent(), false);
  assert.equal(nodes(f.render(), 'JourneySharePreview').length, 0); image.host.unmount(); pending.resolve('file:///late-child.png'); await tick();
  assert.deepEqual(image.discarded, ['file:///late-child.png']); assert.equal(image.shares.length, 0); f.host.unmount();
});

test('only My Trips supplies explicit current-owner hint through shared card props', () => {
  assert.match(read('app/(tabs)/trips/index.js'), /shareOwnerId=\{user\?\._id\}/);
  assert.match(read('src/components/TripCardContainer.js'), /shareOwnerId=\{shareOwnerId\}/);
  assert.match(read('src/components/TripCard.js'), /ownerIdHint=\{shareOwnerId\}/);
  for (const file of ['app/(tabs)/feed/index.js', 'src/screens/profile/tabs/TripsTab.js', 'app/search/index.js']) assert.doesNotMatch(read(file), /shareOwnerId/);
});

for (const change of ['title', 'photo', 'visibility', 'distance']) test(`same-ID ${change} update invalidates old confirmed image preview instead of exporting a stale snapshot`, () => {
  const f = action(); f.open(); const original = nodes(f.render(), 'JourneySharePreview')[0]; assert.equal(original.props.isCurrent(), true);
  const patch = change === 'title' ? { title: 'Changed journey' } : change === 'photo' ? { photos: [photoId] } : change === 'visibility' ? { defaultTripVisibility: 'private' } : { distanceMeters: 5000 };
  f.props.trip = { ...f.props.trip, ...patch }; const next = f.render();
  assert.equal(original.props.isCurrent(), false); assert.equal(nodes(next, 'JourneySharePreview').length, 0); assert.equal(nodes(next, 'BottomModal').length, 0);
  f.open(); const reopened = nodes(f.render(), 'JourneySharePreview')[0]; assert.equal(reopened.props.trip, f.props.trip); assert.equal(reopened.props.isCurrent(), true); f.host.unmount();
});

test('benign same-ID like/comment count refresh does not interrupt the confirmed export preview', () => {
  const f = action(); f.open(); const original = nodes(f.render(), 'JourneySharePreview')[0];
  f.props.trip = { ...f.props.trip, likesCount: 8, commentsCount: 3 }; const next = nodes(f.render(), 'JourneySharePreview')[0];
  assert.ok(next); assert.equal(original.props.isCurrent(), true); assert.equal(next.props.isCurrent(), true); assert.equal(f.reads.length, 0); f.host.unmount();
});

for (const transition of ['units', 'photo-retry']) test(`retained PNG callbacks after ${transition} cannot clobber the newest displayed image or disable its share action`, async () => {
  const f = preview(transition === 'photo-retry' ? { photos: [photoId] } : {});
  f.layout(); f.render(); if (transition === 'photo-retry') f.card().props.onPhotoLoad(); await f.settle();
  const original = f.image(); original.props.onLoad(); assert.equal(button(f.render(), 'Share image').props.disabled, false);
  if (transition === 'units') { f.props.units = 'imperial'; await f.settle(); }
  else {
    original.props.onError(); f.render(); button(f.render(), 'Create image again').props.onPress(); await f.settle();
    f.card().props.onPhotoLoad(); await f.settle();
  }
  const newest = f.image(); assert.notEqual(newest.props.source.uri, original.props.source.uri); newest.props.onLoad();
  assert.equal(button(f.render(), 'Share image').props.disabled, false);
  original.props.onLoad(); f.render(); original.props.onError(); const tree = f.render();
  assert.equal(button(tree, 'Share image').props.disabled, false); assert.equal(nodes(tree, 'Text').some(node => node.props.accessibilityRole === 'alert'), false);
  assert.equal(f.image().props.source.uri, newest.props.source.uri); button(tree, 'Share image').props.onPress(); await tick();
  assert.equal(f.shares.length, 1); assert.equal(f.shares[0].uri, newest.props.source.uri); f.host.unmount();
});

for (const closeControl of ['modal-back', 'header']) test(`retained prior ${closeControl} dismissal cannot close a reopened image preview`, () => {
  const f = action(); f.open(); const oldTree = f.render(), oldPreview = nodes(oldTree, 'JourneySharePreview')[0];
  const dismiss = nodes(oldTree, closeControl === 'header' ? 'ModalHeader' : 'BottomModal')[0].props.onClose;
  dismiss(); f.render(); f.open(); const current = nodes(f.render(), 'JourneySharePreview')[0];
  assert.equal(oldPreview.props.isCurrent(), false); assert.equal(current.props.isCurrent(), true);
  dismiss(); const tree = f.render(); assert.equal(nodes(tree, 'JourneySharePreview').length, 1); assert.equal(current.props.isCurrent(), true); f.host.unmount();
});

test('retained loading Cancel callback cannot cancel a newer hydration or its confirmed preview', async () => {
  const old = deferred(), current = deferred(); let calls = 0;
  const f = action({ trip: ownTrip({ photos: undefined }) }, { load: () => ++calls === 1 ? old.promise : current.promise });
  f.open(); const cancelOld = button(f.render(), 'Cancel').props.onPress; cancelOld(); f.render(); f.open(); f.render();
  cancelOld(); assert.equal(nodes(f.render(), 'BottomModal').length, 1); assert.deepEqual(f.reads, ['trip', 'trip']);
  old.resolve(ownTrip({ title: 'Old result', photos: [photoId] })); await f.settle(); assert.equal(nodes(f.render(), 'JourneySharePreview').length, 0);
  const full = ownTrip({ title: 'New result', photos: [photoId] }); current.resolve(full); await f.settle(); cancelOld();
  assert.equal(nodes(f.render(), 'JourneySharePreview')[0].props.trip, full); f.host.unmount();
});
