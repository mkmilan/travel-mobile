const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, load, fixture, nodes, native } = require('./helpers/component-fixture.cjs');
const preferences = require('../src/constants/presentationPreferences');
const { theme } = load('src/theme.js', '({theme})');
const options = load('src/constants/settingsOptions.js', '({dateFormatOptions, languageOptions, preferredUnitOptions, themePreferenceOptions, timeFormatOptions, travelModeOptions, tripVisibilityOptions})');
const plain = value => JSON.parse(JSON.stringify(value));
const savedSettings = () => ({
  defaultTripVisibility:'followers_only', defaultTravelMode:'car', preferredUnits:'imperial',
  themePreference:'dark', language:'fr', dateFormat:'DD/MM/YYYY', timeFormat:'24h',
});
function authFixture(storedSettings = savedSettings()) {
  let state;
  const storage = new Map([
    ['user-data', JSON.stringify({_id:'fixture', username:'Fixture', settings:storedSettings})],
    ['auth-token', 'fixture-token'],
  ]);
  const useAuthStore = load('src/stores/auth.js', 'useAuthStore', {
    ...preferences,
    create: initialize => {
      state = initialize(patch => Object.assign(state, patch), () => state);
      const store = selector => selector(state);
      store.getState = () => state;
      return store;
    },
    SecureStore: {
      getItemAsync: async key => storage.get(key),
      setItemAsync: async (key, value) => storage.set(key, value),
      deleteItemAsync: async key => storage.delete(key),
    },
    stopActiveRecording:async()=>{},
    require:()=>({useTripSocialStore:{getState:()=>({reset(){}})}}),
  });
  return { state, storage, useAuthStore };
}
function settingsFixture({ enabled = false, fail = false } = {}) {
  const auth = authFixture();
  auth.state.user = {_id:'fixture', username:'Fixture', settings:savedSettings()};
  const requests = [], routes = [], errors = [];
  const component = fixture('app/(tabs)/me/settings.js', 'SettingsScreen', {}, {
    ...native, ...options, ...preferences,
    ENABLE_LANGUAGE_AND_THEME_PREFERENCES:enabled,
    useRequireAuth:()=>true, useAuthStore:auth.useAuthStore,
    useRouter:()=>({push:route=>routes.push(route)}),
    updateUserSettings:async(csrf, settings)=>{
      requests.push({csrf, settings:plain(settings)});
      if(fail) throw Error('Settings unavailable');
      return {settings:{...savedSettings(), ...settings}};
    },
    Alert:{alert:(...args)=>errors.push(args)},
    StyleSheet:{create:x=>x}, theme, Feather:'Feather', TransportIcon:'TransportIcon', ChoiceTabs:'ChoiceTabs',
  });
  return {...component, ...auth, requests, routes, errors};
}

test('presentation gate forces English/light regardless of saved preferences or dark system mode', () => {
  assert.equal(preferences.ENABLE_LANGUAGE_AND_THEME_PREFERENCES, false);
  for(const preference of [undefined, null, 'light', 'dark', 'system', 'invalid']) {
    assert.equal(preferences.getAppThemePreference(preference), 'light');
    for(const system of [null, 'light', 'dark']) assert.equal(preferences.resolveAppTheme(preference, system), 'light');
  }
  for(const language of [undefined, 'en', 'fr', 'es', 'de', 'it']) assert.equal(preferences.getAppLanguage(language), 'en');
});

test('future theme/language options and saved settings survive the reversible gate', () => {
  const module = {exports:{}};
  vm.runInNewContext(read('src/constants/presentationPreferences.js')
    .replace('const ENABLE_LANGUAGE_AND_THEME_PREFERENCES = false;', 'const ENABLE_LANGUAGE_AND_THEME_PREFERENCES = true;'), {module});
  const future = module.exports;
  assert.equal(future.getAppThemePreference('dark'), 'dark');
  assert.equal(future.getAppLanguage('fr'), 'fr');
  assert.equal(future.resolveAppTheme('system', 'dark'), 'dark');
  assert.equal(future.resolveAppTheme('system', null), 'light');
  assert.deepEqual(plain(future.getEditableSettings(savedSettings())), savedSettings());
  assert.equal(options.languageOptions.length, 5);
  assert.equal(options.themePreferenceOptions.length, 3);
  assert.equal(nodes(settingsFixture({enabled:true}).render(), 'ChoiceTabs').length, 7);
});

test('auth startup, hydration, login, setters, update and logout stay English/light without rewriting stored account preferences', async () => {
  const {state, storage} = authFixture();
  const assertPresentation = () => {
    assert.equal(state.theme, 'light'); assert.equal(state.language, 'en');
  };
  assertPresentation();
  await state.syncFromStorage(); assertPresentation();
  assert.deepEqual(plain(state.user.settings), savedSettings());
  await state.login({_id:'fixture', username:'Fixture', token:'fixture-token', settings:savedSettings()});
  assertPresentation();
  state.setTheme('dark'); state.setLanguage('es'); assertPresentation();
  await state.updateUser({settings:{...savedSettings(), language:'de', preferredUnits:'metric'}});
  assertPresentation();
  const saved = JSON.parse(storage.get('user-data'));
  assert.equal(saved.settings.themePreference, 'dark');
  assert.equal(saved.settings.language, 'de');
  assert.equal(saved.settings.preferredUnits, 'metric');
  assert.equal(storage.get('auth-token'), 'fixture-token');
  await state.logout(); assertPresentation();
  assert.equal(state.user, null); assert.equal(storage.size, 0);
});

test('native/web theme hooks and themed colors use the gated resolver instead of raw system mode', () => {
  const useResolvedTheme = load('src/hooks/useResolvedTheme.js', 'useResolvedTheme', {
    ...preferences, useAuthStore:selector=>selector({theme:'dark'}), useColorScheme:()=> 'dark',
  });
  assert.equal(useResolvedTheme(), 'light');
  assert.match(read('src/hooks/useColorScheme.js'), /useResolvedTheme as useColorScheme/);
  for(const hydrated of [false,true]) {
    const useWebScheme = load('src/hooks/useColorScheme.web.js', 'useColorScheme', {
      useResolvedTheme, useState:()=>[hydrated,()=>{}], useEffect:()=>{},
    });
    assert.equal(useWebScheme(), 'light');
  }
  const {Colors} = load('src/constants/Colors.js', '({Colors})');
  const useThemeColor = load('src/hooks/useThemeColor.js', 'useThemeColor', {useColorScheme:useResolvedTheme, Colors});
  assert.equal(useThemeColor({}, 'text'), Colors.light.text);
  assert.equal(useThemeColor({light:'light-fixture',dark:'dark-fixture'}, 'background'), 'light-fixture');
  assert.match(read('app/home/index.js'), /from "@\/src\/hooks\/useColorScheme"/);
});

test('profile name, bio and stat labels keep dark text on light surfaces even with a saved dark preference', () => {
  const {darkTheme} = load('src/theme.js', '({darkTheme})');
  const colors = preferences.resolveAppTheme('dark', 'dark') === 'dark' ? darkTheme.colors : theme.colors;
  const tree = fixture('src/screens/profile/ProfileSummary.js', 'ProfileSummary', {
    displayedUser:{username:'Fixture name', bio:'Fixture bio'},
    stats:{totalTrips:1,totalDistance:1,followers:1,following:1,recommendationCount:1,poi:1}, colors, isSelf:false,
  }, {...native,baseTheme:theme,StyleSheet:{create:x=>x},Feather:'Feather',Avatar:'Avatar',Link:'Link',profileDistance:String}).render();
  const style = node => Object.assign({}, ...[node.props.style].flat(Infinity));
  for(const label of ['Fixture name','Fixture bio']) {
    assert.equal(style(nodes(tree,'Text').find(node=>node.children.join('') === label)).color, theme.colors.text);
  }
  const cards = nodes(tree,'TouchableOpacity');
  assert.equal(cards.length, 6);
  for(const card of cards) {
    assert.equal(style(card).backgroundColor, '#fff');
    assert.deepEqual(nodes(card,'Text').map(node=>style(node).color), ['#333','#555']);
  }
});

test('settings hides only theme/language and saves all remaining choices without sending hidden preferences', async () => {
  const f = settingsFixture();
  let tree = f.render();
  const labels = nodes(tree, 'Text').map(node=>node.children.join(''));
  assert.deepEqual(labels, ['Default trip visibility','Default travel mode','Preferred units','Date format','Time format','Save settings']);
  const choices = nodes(tree, 'ChoiceTabs');
  assert.equal(choices.length, 5);
  const edits = ['private', 'walking', 'metric', 'YYYY-MM-DD', '12h'];
  choices.forEach((choice, index)=>choice.props.onChange(edits[index]));
  tree = f.render();
  await nodes(tree, 'TouchableOpacity')[0].props.onPress();
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].csrf, true);
  assert.deepEqual(f.requests[0].settings, {
    defaultTripVisibility:'private', defaultTravelMode:'walking', preferredUnits:'metric', dateFormat:'YYYY-MM-DD', timeFormat:'12h',
  });
  assert.equal(f.state.user.settings.themePreference, 'dark');
  assert.equal(f.state.user.settings.language, 'fr');
  assert.equal(f.state.theme, 'light'); assert.equal(f.state.language, 'en');
  assert.deepEqual(f.routes, ['/(tabs)/user/fixture']);
  assert.deepEqual(f.errors, []);
});

test('hidden settings filtering does not mutate account data or other privacy fields; failed save retains editable draft', async () => {
  const original = {...savedSettings(), additionalPrivacySetting:false};
  const payload = preferences.getEditableSettings(original);
  assert.equal(payload.additionalPrivacySetting, false);
  assert.equal(original.themePreference, 'dark'); assert.equal(original.language, 'fr');
  assert.equal('themePreference' in payload, false); assert.equal('language' in payload, false);
  const f = settingsFixture({fail:true});
  nodes(f.render(), 'ChoiceTabs')[0].props.onChange('private');
  await nodes(f.render(), 'TouchableOpacity')[0].props.onPress();
  assert.equal(nodes(f.render(), 'ChoiceTabs')[0].props.value, 'private');
  assert.deepEqual(f.errors, [['Error','Settings unavailable']]);
  assert.deepEqual(f.routes, []);
  assert.deepEqual(plain(f.state.user.settings), savedSettings());
});
