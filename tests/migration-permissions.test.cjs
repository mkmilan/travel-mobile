const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/recordingPermissions.js'), 'utf8');
const ensureRecordingPermissions = vm.runInNewContext(source.replace('export async function', 'async function') + '\nensureRecordingPermissions');
function fixture(overrides = {}) {
  const calls = [];
  let current = true;
  const granted = async () => ({ status: 'granted', canAskAgain: true });
  const location = {
    getForegroundPermissionsAsync: granted,
    requestForegroundPermissionsAsync: async () => { calls.push('foreground'); return granted(); },
    getBackgroundPermissionsAsync: granted,
    requestBackgroundPermissionsAsync: async () => { calls.push('background'); return granted(); },
    ...overrides,
  };
  return {
    calls,
    expire: () => { current = false; },
    args: { location, isCurrentSession: () => current, confirmBackground: async () => { calls.push('rationale'); return true; }, onBlocked: (...reason) => calls.push(reason) },
  };
}
test('existing foreground/background grants require no prompt', async () => {
  const f = fixture(); assert.equal(await ensureRecordingPermissions(f.args), true); assert.deepEqual(f.calls, []);
});
test('missing foreground grant prevents background prompt', async () => {
  const f = fixture({ getForegroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: false }) });
  assert.equal(await ensureRecordingPermissions(f.args), false); assert.deepEqual(f.calls, [['foreground', true]]);
});
test('background rationale precedes OS request', async () => {
  const f = fixture({ getBackgroundPermissionsAsync: async () => ({ status: 'undetermined', canAskAgain: true }) });
  assert.equal(await ensureRecordingPermissions(f.args), true); assert.deepEqual(f.calls, ['rationale', 'background']);
});
test('canceling rationale never requests background permission', async () => {
  const f = fixture({ getBackgroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: true }) });
  f.args.confirmBackground = async () => false;
  assert.equal(await ensureRecordingPermissions(f.args), false); assert.deepEqual(f.calls, []);
});
test('blocked background grant explains settings without re-prompt', async () => {
  const f = fixture({ getBackgroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: false }) });
  assert.equal(await ensureRecordingPermissions(f.args), false); assert.deepEqual(f.calls, [['background', true]]);
});
test('background denial never grants recording access', async () => {
  const f = fixture({ getBackgroundPermissionsAsync: async () => ({ status: 'undetermined' }), requestBackgroundPermissionsAsync: async () => ({ status: 'denied', canAskAgain: true }) });
  assert.equal(await ensureRecordingPermissions(f.args), false); assert.deepEqual(f.calls, ['rationale', ['background', false]]);
});
test('session change during rationale prevents OS request and recording', async () => {
  const f = fixture({ getBackgroundPermissionsAsync: async () => ({ status: 'undetermined' }) });
  f.args.confirmBackground = async () => { f.expire(); return true; };
  assert.equal(await ensureRecordingPermissions(f.args), false); assert.deepEqual(f.calls, []);
});
test('session change during permission response rejects access', async () => {
  const f = fixture({ getForegroundPermissionsAsync: async () => ({ status: 'undetermined' }) });
  f.args.location.requestForegroundPermissionsAsync = async () => { f.expire(); return { status: 'granted' }; };
  assert.equal(await ensureRecordingPermissions(f.args), false); assert.deepEqual(f.calls, []);
});
test('start and resume gate permissions before creating active recording state', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../app/(tabs)/record/index.js'), 'utf8');
  const start = screen.slice(screen.indexOf('const handleStart ='), screen.indexOf('const handlePauseResume ='));
  assert.ok(start.indexOf('await requestRecordingAccess(isCurrent)') < start.indexOf('await startTrip(uid,'));
  const resume = screen.slice(screen.indexOf('const handlePauseResume ='), screen.indexOf('const handleStop ='));
  assert.ok(resume.indexOf('await requestRecordingAccess(isCurrent)') < resume.indexOf('await setActiveTrip('));
  assert.match(start, /session\.sessionEpoch !== sessionEpoch/);
  assert.match(start, /recordingLifetime\.current === lifetime/);
});
