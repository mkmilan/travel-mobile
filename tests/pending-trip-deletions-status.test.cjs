const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, nodes, native } = require('./helpers/component-fixture.cjs');
const { hooksFixture, authFixture } = require('./helpers/hooks-fixture.cjs');
const tick = () => new Promise(setImmediate);
const tripId = '1234567890abcdef12345678';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
function banner({ rows = [], discover = async () => [], read } = {}) {
  const host = hooksFixture(), auth = authFixture(), calls = [], alerts = [];
  const screen = fixture('src/components/PendingTripDeletions.js', 'PendingTripDeletions', {}, {
    ...native, ...host.hooks, ENABLE_SAFE_TRIP_DELETE: true, useAuthStore: auth.store,
    getPendingTripDeletions: async owner => { calls.push(['read', owner]); return read ? read(owner) : rows; },
    getPendingTripDeletionsApi: async (owner, options) => { calls.push(['discover', owner]); return discover(owner, options); },
    rememberPendingTripDeletion: async (...args) => calls.push(['remember', ...args]),
    deleteServerTrip: async (...args) => { calls.push(['delete', ...args]); throw Error('offline'); },
    Alert: { alert: (...args) => alerts.push(args) },
  });
  const render = () => host.render(() => screen.render());
  const copy = () => nodes(render(), 'Text').map(node => node.children.join('')).join('\n');
  return { host, auth, calls, alerts, render, copy };
}

test('failed discovery with no saved deletion shows only unknown status, never pending cleanup or a deletion failure', async () => {
  const f = banner({ discover: async () => { throw Error('offline'); } });
  assert.equal(f.render(), null);
  await tick();
  assert.match(f.copy(), /Could not check deletion status/);
  assert.match(f.copy(), /Reopen My Trips to check again/);
  assert.doesNotMatch(f.copy(), /Previously requested|pending|cleanup|Saved retries|failed|not completed/);
  assert.equal(nodes(f.render(), 'Pressable').length, 0);
  assert.equal(f.calls.some(call => call[0] === 'delete'), false);
  // Rendering status/error updates cannot restart focus discovery.
  f.render(); f.render(); await tick();
  assert.equal(f.calls.filter(call => call[0] === 'discover').length, 1);
});

test('failed discovery with saved rows preserves the real warning and owner-confirmed retry', async () => {
  const f = banner({ rows: [{ trip_id: tripId }], discover: async () => { throw Error('offline'); } });
  f.render(); await tick();
  assert.match(f.copy(), /Previously requested trip deletions/);
  assert.match(f.copy(), /Saved retries are kept/);
  const retry = nodes(f.render(), 'Pressable')[0];
  retry.props.onPress();
  assert.equal(f.calls.some(call => call[0] === 'delete'), false);
  const confirm = f.alerts[0][2].find(button => button.style === 'destructive').onPress;
  f.auth.set({ user: { _id: 'other' }, token: 'other-token' });
  assert.equal(f.render(), null);
  await confirm();
  assert.equal(f.calls.some(call => call[0] === 'delete'), false);
});

test('successful empty discovery stays silent; reopening after a failed check clears the unknown status', async () => {
  let fail = false;
  const f = banner({ discover: async () => { if (fail) throw Error('offline'); return []; } });
  f.render(); await tick(); assert.equal(f.render(), null);
  fail = true; f.host.blur(); f.host.focus(); await tick();
  assert.match(f.copy(), /Could not check deletion status/);
  fail = false; f.host.blur(); f.host.focus(); await tick();
  assert.equal(f.render(), null);
  assert.equal(f.calls.filter(call => call[0] === 'discover').length, 3);
  assert.equal(f.calls.some(call => call[0] === 'delete'), false);
});

test('late discovery outcomes from the previous account cannot display status or persist rows', async () => {
  for (const reject of [false, true]) {
    const pending = deferred();
    const f = banner({ discover: owner => owner === 'actor' ? pending.promise : [] });
    f.render(); await tick();
    f.auth.set({ user: { _id: 'other' }, token: 'other-token' });
    assert.equal(f.render(), null); await tick();
    if (reject) pending.reject(Error('old failure'));
    else pending.resolve([{ tripId }]);
    await tick();
    assert.equal(f.render(), null);
    assert.equal(f.calls.some(call => ['remember', 'delete'].includes(call[0])), false);
  }
});

test('unavailable local status does not invent a saved deletion or dispatch discovery/deletion', async () => {
  const f = banner({ read: async () => { throw Error('disk unavailable'); } });
  f.render(); await tick();
  assert.match(f.copy(), /Could not check deletion status/);
  assert.doesNotMatch(f.copy(), /Previously requested|Saved retries|cleanup/);
  assert.equal(f.calls.some(call => ['discover', 'delete'].includes(call[0])), false);
});
