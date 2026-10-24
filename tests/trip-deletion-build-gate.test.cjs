const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/constants/featureFlags'), 'utf8');
function flag(value) {
  const context = {module: {exports: {}}, process: {env: {}}};
  if (value !== undefined) context.process.env.EXPO_PUBLIC_ENABLE_SAFE_TRIP_DELETE = value;
  vm.runInNewContext(source, context);
  return context.module.exports.ENABLE_SAFE_TRIP_DELETE;
}
test('safe trip deletion defaults off and accepts only explicit true string', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', true]) assert.equal(flag(value), false);
  assert.equal(flag('true'), true);
});
test('only travel-test build opts in to safe trip deletion', () => {
  const profiles = require('../eas.json').build;
  for (const [name, profile] of Object.entries(profiles)) {
    assert.equal(profile.env?.EXPO_PUBLIC_ENABLE_SAFE_TRIP_DELETE === 'true', name === 'travel-test');
  }
  assert.equal(profiles['travel-test'].env.APP_VARIANT, 'test');
  assert.equal(profiles['travel-test'].environment, 'preview');
});
