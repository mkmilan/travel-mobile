const test = require('node:test');
const assert = require('node:assert/strict');
const { environment, account, tick } = require('./helpers/viewer-units-fixture.cjs');
const expected = units => units === 'imperial' ? { distance: '62.1 mi', speed: '31.1 mph' } : { distance: '100.0 km', speed: '50.0 km/h' };
const profileExpected = units => ({ summary: expected(units).distance, modal: expected(units).distance });
async function setup(t, units = 'metric') { const f = environment(); t.after(() => f.close()); await f.login(units); return f; }

for (const units of ['metric', 'imperial']) for (const owner of ['viewer', 'other']) for (const ownerUnits of ['metric', 'imperial']) {
  test(`${units} viewer / ${owner} owner / ${ownerUnits} owner preference: card, detail and profile use viewer units`, async t => {
    const f = await setup(t, units), trip = f.trip(owner, ownerUnits), before = JSON.stringify(trip);
    assert.deepEqual(f.card(trip).labels(), expected(units));
    assert.deepEqual((await f.detail(trip)).labels(), expected(units));
    assert.deepEqual(f.profile(trip).labels(), profileExpected(units));
    assert.equal(JSON.stringify(trip), before, 'canonical meters/milliseconds and owner preferences are never rewritten');
  });
}

for (const kind of ['my-trips', 'following', 'discover', 'search', 'own-profile', 'other-profile']) {
  test(`${kind}: already-mounted actual caller card updates both directions without parent refresh`, async t => {
    const f = await setup(t), owner = ['my-trips', 'own-profile'].includes(kind) ? 'viewer' : 'other';
    const { card, parent } = f.listCard(kind, f.trip(owner, 'imperial'));
    assert.deepEqual(card.labels(), expected('metric'));
    const renders = parent.renders;
    for (const units of ['imperial', 'metric']) {
      const before = card.view.renders;
      await f.units(units);
      assert.ok(card.view.renders > before, 'the mounted child must observe its actual units selector');
      assert.deepEqual(card.labels(), expected(units));
    }
    if (kind !== 'my-trips') assert.equal(parent.renders, renders, 'unit-only updates do not require a feed/search/profile parent rerender');
  });
}

test('loaded detail changes both numbers/labels in place without refetching the trip', async t => {
  const f = await setup(t), detail = await f.detail(f.trip());
  const requests = detail.requests(); // Existing initial-load and focus reads.
  for (const units of ['imperial', 'metric']) {
    await f.units(units);
    assert.deepEqual(detail.labels(), expected(units));
  }
  assert.equal(detail.requests(), requests);
});

for (const owner of ['viewer', 'other']) test(`${owner} profile overview and open Distance sheet update in place without fetching POIs`, async t => {
  const f = await setup(t), profile = f.profile(f.trip(owner, 'imperial'));
  for (const units of ['imperial', 'metric']) {
    const summaryRenders = profile.summary.renders, modalRenders = profile.modal.renders;
    await f.units(units);
    assert.ok(profile.summary.renders > summaryRenders && profile.modal.renders > modalRenders);
    assert.deepEqual(profile.labels(), profileExpected(units));
  }
  await tick(); assert.equal(profile.requests(), 0);
});

test('mounted cards/profiles default to metric on logout and follow the new account, rejecting old settings saves', async t => {
  const f = await setup(t, 'imperial'), card = f.card(f.trip()), profile = f.profile(f.trip());
  const oldSession = f.useAuthStore.getState().captureSession();
  await f.useAuthStore.getState().logout();
  assert.deepEqual(card.labels(), expected('metric'));
  assert.deepEqual(profile.labels(), profileExpected('metric'));
  await f.login('metric', 'next');
  assert.equal(await f.useAuthStore.getState().updateUser({ settings: { preferredUnits: 'imperial' } }, oldSession), false);
  assert.deepEqual(card.labels(), expected('metric'));
  await f.units('imperial');
  assert.deepEqual(card.labels(), expected('imperial'));
  assert.deepEqual(profile.labels(), profileExpected('imperial'));
});

test('persisted imperial hydration updates existing cards/summary/sheet from metric defaults', async t => {
  const first = await setup(t); await first.units('imperial');
  const f = environment(); t.after(() => f.close());
  for (const [key, value] of first.storage) f.storage.set(key, value);
  const card = f.card(f.trip()), profile = f.profile(f.trip());
  assert.deepEqual(card.labels(), expected('metric'));
  assert.deepEqual(profile.labels(), profileExpected('metric'));
  await f.useAuthStore.getState().syncFromStorage();
  assert.deepEqual(card.labels(), expected('imperial'));
  assert.deepEqual(profile.labels(), profileExpected('imperial'));
  assert.deepEqual((await f.detail(f.trip())).labels(), expected('imperial'));
  await f.units('metric'); assert.deepEqual(card.labels(), expected('metric'));
});

test('missing, unrecognized and null viewer preferences always default to metric', async t => {
  const f = environment(); t.after(() => f.close());
  const card = f.card(f.trip('other', 'imperial'));
  for (const units of [undefined, null, '', 'miles', {}, 'METRIC']) {
    await f.useAuthStore.getState().login(account('viewer', units));
    assert.equal(f.useViewerUnits(), 'metric');
    assert.deepEqual(card.labels(), expected('metric'));
    assert.equal(f.format.kmOrMiles(100000), '100.0 km');
    assert.equal(f.format.calcAvgSpeed(100000, 7200000), '50.0');
  }
});

test('exact mile conversion and explicit pure formatting override the store without mutating it', async t => {
  const f = await setup(t, 'imperial');
  assert.equal(f.format.metersToMiles(100000), '62.1');
  assert.equal(f.format.kmOrMiles(1609.344, 'imperial'), '1.0 mi');
  assert.equal(f.format.calcAvgSpeed(1609.344, 3600000, 'imperial'), '1.0');
  assert.equal(f.format.kmOrMiles(100000), '62.1 mi');
  assert.equal(f.format.calcAvgSpeed(100000, 7200000), '31.1');
  const state = f.useAuthStore.getState();
  // Explicit arguments must not need or read any account state.
  const original = f.useAuthStore.getState;
  f.useAuthStore.getState = () => { throw Error('unexpected implicit unit lookup'); };
  try {
    for (const units of ['metric', 'imperial']) {
      assert.equal(f.format.kmOrMiles(100000, units), expected(units).distance);
      assert.equal(`${f.format.calcAvgSpeed(100000, 7200000, units)} ${f.format.speedUnit(units)}`, expected(units).speed);
      assert.equal(f.profileDistance(100000, units), expected(units).distance);
    }
  } finally { f.useAuthStore.getState = original; }
  assert.equal(f.useAuthStore.getState(), state);
});

test('profile metric short-distance rounding is retained; imperial totals always use one-decimal miles', async t => {
  const f = await setup(t);
  for (const [meters, metric, imperial] of [[0, '0 m', '0.0 mi'], [0.5, '1 m', '0.0 mi'], [543.413, '543 m', '0.3 mi'],
    [999.5, '1000 m', '0.6 mi'], [1000, '1.0 km', '0.6 mi'], [1250, '1.3 km', '0.8 mi'], [100000, '100.0 km', '62.1 mi']]) {
    assert.equal(f.profileDistance(meters), metric);
    assert.equal(f.profileDistance(meters, 'metric'), metric);
    assert.equal(f.profileDistance(meters, 'imperial'), imperial);
  }
});

for (const units of ['metric', 'imperial']) test(`${units}: zero/missing/invalid measurements never show NaN, infinity or negative statistics`, async t => {
  const f = await setup(t, units), unit = f.format.speedUnit(units);
  assert.equal(f.format.kmOrMiles(0, units), units === 'imperial' ? '0.0 mi' : '0.0 km');
  assert.equal(f.format.calcAvgSpeed(0, 7200000, units), '–', 'retain historical zero-distance speed fallback');
  assert.equal(f.format.calcAvgSpeed(100000, 0, units), '–');
  assert.equal(f.format.msToDuration(0), '–'); assert.equal(f.format.msToDuration(7200000), '2h 0m');
  assert.equal(f.format.metersToKm(0), '–'); assert.equal(f.format.metersToMiles(0), '–');
  for (const invalid of [null, undefined, NaN, Infinity, -Infinity, -1, '100000', {}, []]) {
    assert.equal(f.format.kmOrMiles(invalid, units), '–');
    assert.equal(f.profileDistance(invalid, units), '–');
    assert.equal(f.format.metersToKm(invalid), '–'); assert.equal(f.format.metersToMiles(invalid), '–');
    assert.equal(f.format.calcAvgSpeed(invalid, 7200000, units), '–');
    assert.equal(f.format.calcAvgSpeed(100000, invalid, units), '–');
    assert.equal(f.format.msToDuration(invalid), '–');
  }
  assert.equal(f.format.calcAvgSpeed(Number.MAX_VALUE, Number.MIN_VALUE, units), '–');
  const zero = f.trip('other', 'metric', { distanceMeters: 0 });
  assert.equal(f.card(zero).labels().speed, `– ${unit}`);
  assert.equal((await f.detail(zero)).labels().speed, `– ${unit}`);
  const missing = f.trip('other', 'metric', { distanceMeters: null, durationMillis: null });
  assert.deepEqual(f.card(missing).labels(), { distance: '–', speed: `– ${unit}` });
  assert.deepEqual((await f.detail(missing)).labels(), { distance: '–', speed: `– ${unit}` });
});
