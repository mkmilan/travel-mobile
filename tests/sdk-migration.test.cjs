const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
test('Expo 57 native dependencies match its installed compatibility table', () => {
  const pkg = JSON.parse(read('package.json'));
  const bundled = require('expo/bundledNativeModules.json');
  const semver = require('semver');
  for (const name of ['react', 'react-dom', 'react-native', 'expo-router', 'expo-location', 'expo-task-manager', 'expo-sqlite', 'react-native-maps', 'react-native-reanimated', 'react-native-worklets']) {
    const version = require(`${name}/package.json`).version;
    assert.ok(semver.satisfies(version, bundled[name]), `${name} ${version} expected ${bundled[name]}`);
    assert.ok(pkg.dependencies[name], `${name} must be explicit`);
  }
  assert.equal(Object.keys(pkg.dependencies).some(name => name.startsWith('@react-navigation/')), false);
});
test('image helper explicitly uses supported filesystem legacy compatibility API', () => {
  assert.match(read('src/utils/imageHelpers.js'), /from "expo-file-system\/legacy"/);
});
test('profile top tabs and consumers use one Expo Router navigation context', () => {
  for (const file of ['src/screens/profile/ProfileTabsLayout.js','src/screens/profile/tabs/RecommendationsTab.js','src/screens/profile/tabs/TripsTab.js','src/components/ProfileGallery.js','src/hooks/useProfileList.js','src/components/HapticTab.js','src/components/ui/TabBarBackground.ios.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /from ["']@react-navigation\//);
    assert.match(source, /from "expo-router(?:\/[^"]+)?"/);
  }
});
test('SDK config explicitly enables existing background tracking and avoids removed architecture flags', () => {
  const source = read('app.config.js');
  assert.match(source, /isIosBackgroundLocationEnabled: true/);
  assert.match(source, /isAndroidBackgroundLocationEnabled: true/);
  assert.match(source, /isAndroidForegroundServiceEnabled: true/);
  assert.doesNotMatch(source, /newArchEnabled|edgeToEdgeEnabled/);
});
