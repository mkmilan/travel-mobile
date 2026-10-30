const test = require('node:test');
const assert = require('node:assert/strict');
const { load, read } = require('./helpers/component-fixture.cjs');
const json = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(setImmediate);
const policy = load('src/utils/journeyShare.js', '({canPrepareJourneyShare,canShareJourney,journeyShareTitle,journeySharePhotoId,journeyShareWarning,createJourneyShareController})');
const session = { isAuthenticated: true, isSessionChanging: false, token: 'synthetic-token', user: { _id: 'owner' } };
const ownTrip = { _id: 'trip', user: { _id: 'owner' }, title: 'My journey', photos: [] };

// These are JS/source fixture tests. They do not run native screenshot encoders,
// image caches, the OS share menu or a receiving application.
test('journey export policy requires authenticated owner and refuses viewer-only permission', () => {
  for (const visibility of ['public', 'private', 'followers_only', undefined]) {
    assert.equal(policy.canShareJourney({ ...ownTrip, defaultTripVisibility: visibility }, session), true);
    assert.equal(policy.canShareJourney({ ...ownTrip, user: { _id: 'someone-else' }, defaultTripVisibility: visibility }, session), false);
  }
  for (const next of [null, {}, { ...session, isAuthenticated: false }, { ...session, isSessionChanging: true }, { ...session, token: null }, { ...session, user: null }]) {
    assert.equal(policy.canShareJourney(ownTrip, next), false);
  }
  for (const trip of [null, {}, { ...ownTrip, _id: null }, { ...ownTrip, user: 'owner' }, { ...ownTrip, user: null }]) assert.equal(policy.canShareJourney(trip, session), false);
});

test('journey title fallback, control stripping and bounded Unicode preserve surrogate pairs', () => {
  assert.equal(policy.journeyShareTitle(null), 'My journey');
  assert.equal(policy.journeyShareTitle(' \n\t '), 'My journey');
  assert.equal(policy.journeyShareTitle('東京 🌍\nRoad\u0000trip'), '東京 🌍 Road trip');
  const title = policy.journeyShareTitle('🌍'.repeat(200));
  assert.equal(Array.from(title).length, 180);
  assert.equal(title, '🌍'.repeat(180));
});

test('only saved GridFS photo IDs are selected; URLs, paths, objects and tokens are rejected', () => {
  const first = 'a'.repeat(24), second = 'B'.repeat(24);
  assert.equal(policy.journeySharePhotoId({ photos: ['https://private.invalid/photo?token=secret', 'file:///photo.jpg', { uri: first }, 'Bearer synthetic', first, second] }), first);
  assert.equal(policy.journeySharePhotoId({ photos: [second] }), second);
  for (const photos of [undefined, null, {}, 'a'.repeat(24), [], ['https://private.invalid/p'], ['file:///x'], ['a'.repeat(23)], ['g'.repeat(24)]]) assert.equal(policy.journeySharePhotoId({ photos }), undefined);
});

test('private, followers and unknown visibility explain export outside privacy controls without mutating visibility', () => {
  for (const [visibility, expected] of [['private', 'private'], ['followers_only', 'followers-only'], [undefined, 'restricted'], ['invalid', 'restricted']]) {
    const warning = policy.journeyShareWarning(visibility);
    assert.match(warning, new RegExp(expected)); assert.match(warning, /leaves the app’s privacy controls/); assert.match(warning, /save or forward/); assert.match(warning, /stays unchanged/);
  }
  assert.match(policy.journeyShareWarning('public'), /saved or forwarded outside/);
});

function controller(options = {}) {
  let current = true; const changes = [], captures = [], shares = [], discarded = [];
  const api = policy.createJourneyShareController({ isCurrent: () => current,
    capture: async view => { captures.push(view); return options.capture ? options.capture(view) : 'file:///preview.png'; },
    share: async (uri, guard) => { shares.push({ uri, guard }); return options.share ? options.share(uri, guard) : 'closed'; },
    discard: async uri => { discarded.push(uri); }, onChange: patch => changes.push(json(patch)),
  });
  return { api, changes, captures, shares, discarded, stale: () => { current = false; } };
}

test('journey controller captures once, explicitly shares later, and ignores rapid duplicate taps', async () => {
  const capture = deferred(), share = deferred(), f = controller({ capture: () => capture.promise, share: () => share.promise });
  const preparing = f.api.prepare('card-view'); await f.api.prepare('card-view'); await f.api.share();
  assert.deepEqual(f.captures, ['card-view']); assert.equal(f.shares.length, 0);
  capture.resolve('file:///preview.png'); await preparing;
  assert.deepEqual(f.changes.map(patch => patch.status), ['preparing', 'ready']);
  await f.api.prepare('other-view'); assert.equal(f.captures.length, 1);
  const sharing = f.api.share(); await f.api.share(); assert.equal(f.shares.length, 1);
  share.resolve('closed'); await sharing;
  assert.deepEqual(f.changes.at(-1), { status: 'ready', uri: 'file:///preview.png', error: null });
  f.api.cancel(); assert.deepEqual(f.discarded, ['file:///preview.png']);
  await f.api.prepare('late'); await f.api.share(); assert.equal(f.captures.length, 1); assert.equal(f.shares.length, 1);
});

test('journey controller capture failure is safe, generic and retryable without leaking errors', async () => {
  let fail = true; const f = controller({ capture: async () => { if (fail) throw Error('secret-private-url-token'); return 'file:///retry.png'; } });
  await f.api.prepare('view');
  assert.equal(f.changes.at(-1).status, 'error'); assert.match(f.changes.at(-1).error, /try again/); assert.doesNotMatch(JSON.stringify(f.changes), /secret-private/);
  fail = false; await f.api.prepare('view'); assert.equal(f.captures.length, 2); assert.equal(f.changes.at(-1).uri, 'file:///retry.png');
});

test('journey controller unavailable, cancelled and failed native menus never claim posting success', async () => {
  for (const outcome of ['unavailable', 'closed', 'cancelled', 'reject']) {
    const f = controller({ share: async () => { if (outcome === 'reject') throw Error('secret-private-url'); return outcome; } });
    await f.api.prepare('view'); await f.api.share();
    const last = f.changes.at(-1); assert.equal(last.status, 'ready');
    assert.equal(!!last.error, outcome === 'unavailable' || outcome === 'reject');
    assert.doesNotMatch(JSON.stringify(f.changes), /posted|sent successfully|secret-private/);
    await f.api.share(); assert.equal(f.shares.length, 2, 'native failure/cancel permits explicit retry');
  }
});

for (const interruption of ['cancel', 'stale']) test(`journey controller ${interruption} during capture discards late bytes and never opens sharing`, async () => {
  const pending = deferred(), f = controller({ capture: () => pending.promise });
  const work = f.api.prepare('view'); interruption === 'cancel' ? f.api.cancel() : f.stale();
  const before = f.changes.length; pending.resolve('file:///late.png'); await work; await f.api.share();
  assert.deepEqual(f.discarded, ['file:///late.png']); assert.equal(f.changes.length, before); assert.equal(f.shares.length, 0);
});

for (const interruption of ['cancel', 'stale']) test(`journey controller ${interruption} during native menu suppresses settlement into later UI`, async () => {
  const pending = deferred(), f = controller({ share: () => pending.promise }); await f.api.prepare('view');
  const work = f.api.share(); interruption === 'cancel' ? f.api.cancel() : f.stale();
  assert.equal(f.shares[0].guard(), false);
  const before = f.changes.length; pending.reject(Error('old failure')); await work;
  assert.equal(f.changes.length, before); await f.api.share(); assert.equal(f.shares.length, 1);
});

function filesFixture(options = {}) {
  let now = 2 * 86400000, random = 0; const files = new Set(options.files || []), copied = [], deleted = [], captures = [], released = [], shares = [], dirs = [];
  const FileSystem = { cacheDirectory: options.cache === undefined ? 'file:///cache/' : options.cache,
    makeDirectoryAsync: async (...args) => { dirs.push(args); if (options.mkdir) await options.mkdir(); },
    readDirectoryAsync: async directory => [...files].filter(file => file.startsWith(directory)).map(file => file.slice(directory.length)),
    deleteAsync: async (uri, settings) => { deleted.push({ uri, settings }); files.delete(uri); },
    copyAsync: async pair => { copied.push(json(pair)); if (options.copy) await options.copy(pair); files.add(pair.to); },
  };
  const api = load('src/services/journeyShareFiles.js', '({captureJourneyImage,shareJourneyImage,discardJourneyImage,pruneJourneyImages,SHARE_RETENTION_MS})', {
    FileSystem, Platform: { OS: options.platform || 'android' }, PixelRatio: { get: () => options.scale || 3 }, requestAnimationFrame: callback => callback(), Date: { now: () => now }, Math: { random: () => (++random) / 1000 },
    captureRef: async (view, settings) => { captures.push({ view, settings: json(settings) }); return options.capture ? options.capture(view, settings) : '/native/screenshot.png'; },
    releaseCapture: uri => released.push(uri), Sharing: { isAvailableAsync: async () => options.available ? options.available() : true,
      shareAsync: async (uri, settings) => { shares.push({ uri, settings: json(settings) }); if (options.share) return options.share(uri, settings); } },
  });
  return { api, files, copied, deleted, captures, released, shares, dirs, setNow: value => { now = value; } };
}

test('native service captures only supplied view into new PNG, copies to neutral private cache name and releases original screenshot', async () => {
  const f = filesFixture(), view = { current: 'allowlisted-card' }, uri = await f.api.captureJourneyImage(view);
  assert.equal(f.captures[0].view, view);
  assert.deepEqual(f.captures[0].settings, { format: 'png', result: 'tmpfile', width: 1080, height: 1350 });
  assert.match(uri, /^file:\/\/\/cache\/journey-shares\/preview-\d+-[a-z0-9]+\.png$/);
  assert.equal(f.copied[0].from, 'file:///native/screenshot.png'); assert.deepEqual(f.released, ['/native/screenshot.png']);
  assert.equal(f.shares.length, 0);
  assert.doesNotMatch(read('src/services/journeyShareFiles.js'), /captureScreen\s*\(/);
});

test('capture respects existing file scheme, missing cache/copy failures reject and release temporary bytes', async () => {
  const source = 'file:///native/source.png', f = filesFixture({ capture: () => source }); await f.api.captureJourneyImage('view');
  assert.equal(f.copied[0].from, source);
  const noCache = filesFixture({ cache: null }); await assert.rejects(noCache.api.captureJourneyImage('view'), /cache unavailable/); assert.equal(noCache.captures.length, 0);
  const fail = filesFixture({ copy: async () => { throw Error('copy unavailable'); } }); await assert.rejects(fail.api.captureJourneyImage('view'), /copy unavailable/);
  assert.deepEqual(fail.released, ['/native/screenshot.png']); assert.equal(fail.deleted.length, 1); assert.equal(fail.files.size, 0);
});

test('native share exports only a fresh handoff PNG with image MIME/UTI and never the private media source', async () => {
  const f = filesFixture(), preview = await f.api.captureJourneyImage('view');
  assert.equal(await f.api.shareJourneyImage(preview, () => true), 'closed');
  assert.equal(f.shares.length, 1); const shared = f.shares[0];
  assert.notEqual(shared.uri, preview); assert.match(shared.uri, /\/shared-\d+-[a-z0-9]+\.png$/);
  assert.deepEqual(shared.settings, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share journey' });
  assert.equal(f.copied[1].from, preview); await f.api.discardJourneyImage(preview);
  assert.equal(f.files.has(preview), false); assert.equal(f.files.has(shared.uri), true, 'closing preview must not delete receiver handoff');
  await f.api.discardJourneyImage(shared.uri); assert.equal(f.files.has(shared.uri), true);
  for (const uri of ['https://private.invalid/photo?token=secret', 'file:///cache/outside.png', 'file:///cache/journey-shares/../outside.png']) {
    assert.equal(await f.api.shareJourneyImage(uri, () => true), 'cancelled'); await f.api.discardJourneyImage(uri);
  }
  assert.equal(f.shares.length, 1); assert.equal(f.deleted.length, 1);
});

test('native sharing checks session after availability and copying before any external handoff', async () => {
  for (const phase of ['availability', 'copy']) {
    const pending = deferred(); let current = true, copies = 0;
    const f = filesFixture({ available: () => phase === 'availability' ? pending.promise : true,
      copy: async () => { copies++; if (phase === 'copy' && copies === 2) await pending.promise; } });
    const preview = await f.api.captureJourneyImage('view'); const work = f.api.shareJourneyImage(preview, () => current); await tick(); current = false; pending.resolve(true);
    assert.equal(await work, 'cancelled'); assert.equal(f.shares.length, 0);
    assert.equal(f.files.size, 1, 'never-handed-off copy is removed');
  }
});

test('native unavailable sharing does not copy or invoke OS menu', async () => {
  const f = filesFixture({ available: () => false }); const preview = await f.api.captureJourneyImage('view');
  assert.equal(await f.api.shareJourneyImage(preview, () => true), 'unavailable'); assert.equal(f.copied.length, 1); assert.equal(f.shares.length, 0);
});

test('native error retains handed-off bytes conservatively and stale cleanup waits at least 24 hours', async () => {
  const f = filesFixture({ share: async () => { throw Error('native menu rejected after handoff'); } }); const preview = await f.api.captureJourneyImage('view');
  await assert.rejects(f.api.shareJourneyImage(preview, () => true), /native menu/); const shared = f.shares[0].uri;
  await f.api.discardJourneyImage(preview); assert.equal(f.files.has(shared), true);
  await f.api.pruneJourneyImages(3 * 86400000); assert.equal(f.files.has(shared), true, 'exactly 24h is retained');
  await f.api.pruneJourneyImages(3 * 86400000 + 1); assert.equal(f.files.has(shared), false);
});

test('cleanup never deletes active menus, live previews, unrelated files or recent handoffs', async () => {
  const pending = deferred(), f = filesFixture({ share: () => pending.promise, files: ['file:///cache/journey-shares/unrelated.png', 'file:///cache/journey-shares/shared-0-abc.png'] });
  const preview = await f.api.captureJourneyImage('view'); const work = f.api.shareJourneyImage(preview, () => true); await tick(); const shared = f.shares[0].uri;
  await f.api.pruneJourneyImages(5 * 86400000);
  assert.equal(f.files.has(preview), true); assert.equal(f.files.has(shared), true); assert.equal(f.files.has('file:///cache/journey-shares/unrelated.png'), true); assert.equal(f.files.has('file:///cache/journey-shares/shared-0-abc.png'), false);
  pending.resolve(); await work; await f.api.pruneJourneyImages(5 * 86400000); assert.equal(f.files.has(shared), false);
});

test('SDK57 view-shot iOS point sizing targets the same 1080 by 1350 output as Android pixels', async () => {
  for (const scale of [1, 2, 3]) {
    const f = filesFixture({ platform: 'ios', scale }); await f.api.captureJourneyImage('view');
    assert.equal(f.captures[0].settings.width * scale, 1080); assert.equal(f.captures[0].settings.height * scale, 1350);
  }
});

test('explicit own-list owner hint permits preparation only, never export, and cannot override known different owner', () => {
  const projection = { _id: 'trip', title: 'Own-list projection' };
  assert.equal(policy.canPrepareJourneyShare(projection, session, 'owner'), true);
  assert.equal(policy.canShareJourney(projection, session), false);
  for (const hint of [undefined, null, '', 'other']) assert.equal(policy.canPrepareJourneyShare(projection, session, hint), false);
  for (const next of [{ ...session, isAuthenticated: false }, { ...session, isSessionChanging: true }, { ...session, token: null }, { ...session, user: null }]) assert.equal(policy.canPrepareJourneyShare(projection, next, 'owner'), false);
  for (const user of [{ _id: 'other' }, {}, 'owner']) assert.equal(policy.canPrepareJourneyShare({ ...projection, user }, session, 'owner'), false);
  assert.equal(policy.canPrepareJourneyShare(ownTrip, session), true);
});
