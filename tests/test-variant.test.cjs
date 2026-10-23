const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const path = require('node:path');
const source = fs.readFileSync('app.config.js', 'utf8')
  .replace('import * as dotenv from "dotenv";', '')
  .replace('export default', 'globalThis.result =');
function config(env) {
  let loadedEnv = false;
  const ctx = { process: { env }, dotenv: { config() { loadedEnv = true; } }, require: createRequire(path.resolve('app.config.js')) };
  vm.runInNewContext(source, ctx);
  return { app: JSON.parse(JSON.stringify(ctx.result.expo)), loadedEnv };
}
const plugin = (app, name) => app.plugins.find(p => Array.isArray(p) && p[0] === name)[1];
test('Travel Test isolates Android identity, runtime, updates and maps key', () => {
  const { app, loadedEnv } = config({ APP_VARIANT: 'test', API_URL: 'https://wrong.example/api', GOOGLE_MAPS_KEY: 'old-key', TEST_GOOGLE_MAPS_KEY: 'test-only-placeholder' });
  assert.equal(app.name, 'Travel Test');
  assert.equal(app.userInterfaceStyle, 'light');
  assert.equal(app.android.package, 'com.mkmilanmilan.travelmobile.test');
  assert.equal(app.scheme, 'travel-test');
  assert.equal(app.runtimeVersion, 'travel-test-sdk57-v1');
  assert.equal(app.updates.enabled, false);
  assert.equal(app.extra.API_URL, 'https://travel-server-test.onrender.com/api');
  assert.equal(app.extra.APP_ENV, 'test');
  assert.equal(plugin(app, 'expo-build-properties').android.usesCleartextTraffic, false);
  assert.equal(plugin(app, 'react-native-maps').androidGoogleMapsApiKey, 'test-only-placeholder');
  assert.equal(loadedEnv, false, 'must not load production or local development dotenv');
});
test('test variant never falls back to original maps key; cloud build fails without test key', () => {
  const { app } = config({ APP_VARIANT: 'test', GOOGLE_MAPS_KEY: 'old-key' });
  assert.equal(plugin(app, 'react-native-maps').androidGoogleMapsApiKey, undefined);
  assert.throws(() => config({ APP_VARIANT: 'test', EAS_BUILD: 'true' }), /TEST_GOOGLE_MAPS_KEY/);
  assert.throws(() => config({ EAS_BUILD_PROFILE: 'travel-test' }), /APP_VARIANT=test/);
});
test('old production identity and environment behavior remain unchanged', () => {
  const { app, loadedEnv } = config({ APP_ENV: 'production', API_URL: 'https://original.example/api', GOOGLE_MAPS_KEY: 'original-placeholder' });
  assert.equal(app.name, 'Travel mobile');
  assert.equal(app.userInterfaceStyle, 'light');
  assert.equal(app.android.package, 'com.mkmilanmilan.travelmobile');
  assert.equal(app.scheme, 'mobile');
  assert.equal(app.runtimeVersion, undefined);
  assert.equal(app.updates, undefined);
  assert.equal(app.extra.API_URL, 'https://original.example/api');
  assert.equal(app.extra.APP_ENV, 'production');
  assert.equal(plugin(app, 'react-native-maps').androidGoogleMapsApiKey, 'original-placeholder');
  assert.equal(loadedEnv, true);
});
test('explicit EAS test profile is standalone internal release APK with preview credentials environment', () => {
  const profile = JSON.parse(fs.readFileSync('eas.json', 'utf8')).build['travel-test'];
  assert.equal(profile.developmentClient, false);
  assert.equal(profile.distribution, 'internal');
  assert.equal(profile.environment, 'preview');
  assert.equal(profile.android.buildType, 'apk');
  assert.equal(profile.env.APP_VARIANT, 'test');
  assert.equal(profile.env.APP_ENV, 'production');
  assert.equal(profile.env.NODE_ENV, undefined, 'do not override Expo release NODE_ENV');
  assert.equal(profile.env.API_URL, 'https://travel-server-test.onrender.com/api');
  assert.equal(config(profile.env).app.name, 'Travel Test');
});
test('native introspection enforces APK identity, exclusive scheme and no OTA/cleartext', () => {
  const { execFileSync } = require('node:child_process');
  const native = JSON.parse(execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {
    env: { ...process.env, APP_VARIANT: 'test', APP_ENV: 'production', EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', TEST_GOOGLE_MAPS_KEY: 'test-only-placeholder', EAS_BUILD: 'false' },
    encoding: 'utf8', maxBuffer: 5 * 1024 * 1024,
  }));
  const manifest = native._internal.modResults.android.manifest.manifest;
  assert.equal(native.userInterfaceStyle, 'light');
  assert.equal(native._internal.modResults.ios.infoPlist.UIUserInterfaceStyle, 'Light');
  const appTheme = native._internal.modResults.android.styles.resources.style.find(style => style.$.name === 'AppTheme');
  assert.equal(appTheme.$.parent, 'Theme.AppCompat.Light.NoActionBar');
  assert.equal(manifest.$.package, 'com.mkmilanmilan.travelmobile.test');
  const app = manifest.application[0];
  assert.equal(app.$['android:usesCleartextTraffic'], 'false');
  const meta = Object.fromEntries(app['meta-data'].map(m => [m.$['android:name'], m.$['android:value']]));
  assert.equal(meta['expo.modules.updates.ENABLED'], 'false');
  assert.equal(meta['com.google.android.geo.API_KEY'], 'test-only-placeholder');
  const schemes = app.activity.flatMap(a => a['intent-filter'] || []).flatMap(f => f.data || []).map(d => d.$['android:scheme']);
  assert.deepEqual(schemes, ['travel-test']);
});
