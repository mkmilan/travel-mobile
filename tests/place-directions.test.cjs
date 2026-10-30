const test = require('node:test');
const assert = require('node:assert/strict');
const {nodes, read} = require('./helpers/component-fixture.cjs');
const {detail, rec, getGoogleMapsDirectionsUrl} = require('./helpers/place-detail-fixture.cjs');
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
const directions = tree => nodes(tree, 'Pressable').find(node => node.props.testID === 'place-directions');
const errors = tree => nodes(tree, 'Text').filter(node => node.props.accessibilityRole === 'alert');

test('Google Maps URL uses encoded saved latitude,longitude, not a name, key, origin, mode or Google Place ID', () => {
  for (const [lon, lat] of [[0, 0], [0, -2], [-122.4194, 37.7749], [180, 90], [-180, -90]]) {
    const location = Object.freeze({type: 'Point', coordinates: Object.freeze([lon, lat])});
    const url = getGoogleMapsDirectionsUrl(location);
    assert.equal(url, `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lon}`)}`);
    const parsed = new URL(url);
    assert.deepEqual(Array.from(parsed.searchParams.keys()), ['api', 'destination']);
    assert.equal(parsed.searchParams.get('destination'), `${lat},${lon}`);
    assert.deepEqual(location.coordinates, [lon, lat]);
  }
});

test('missing, malformed, string, nonfinite and out-of-range coordinates cannot expose or launch directions', () => {
  for (const location of [undefined, null, {}, ...[undefined, null, [], [1], [1, 2, 3], ['2', 1], [2, '1'], [true, 0], [null, 0], [NaN, 0], [0, Infinity], [181, 0], [-181, 0], [0, 91], [0, -91]].map(coordinates => ({coordinates}))]) {
    let opens = 0;
    assert.equal(getGoogleMapsDirectionsUrl(location), null);
    const screen = detail({recommendation: {...rec(), location}}, {Linking: {openURL: () => opens++}});
    assert.equal(directions(screen.render()), undefined);assert.equal(opens, 0);
  }
});

test('actual detail launches the external universal HTTPS URL once for repeated pending taps and stays open on return', async () => {
  let pending = deferred();const urls = [];
  const screen = detail({recommendation: rec([0, 0])}, {Linking: {openURL: url => {urls.push(url); return pending.promise;}}});
  const button = directions(screen.render());assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(nodes(button, 'Text')[0].children.join(''), 'Directions in Google Maps');
  const work = button.props.onPress();assert.equal(button.props.onPress(), work);assert.equal(urls.length, 1);
  assert.equal(directions(screen.render()).props.disabled, true);assert.equal(directions(screen.render()).props.accessibilityState.busy, true);
  pending.resolve();assert.equal(await work, true);
  let tree = screen.render();assert.equal(tree.props.visible, true);assert.equal(screen.closes(), 0);assert.equal(directions(tree).props.disabled, false);assert.equal(errors(tree).length, 0);
  assert.equal(urls[0], 'https://www.google.com/maps/dir/?api=1&destination=0%2C0');
  pending = deferred();const again = directions(tree).props.onPress();assert.equal(urls.length, 2);pending.resolve();await again;
  tree = screen.render();assert.equal(nodes(tree, 'ModalHeader')[0].props.title, 'Riverside cafe');assert.equal(screen.closes(), 0);
});

test('launch rejection or synchronous failure shows a safe error, keeps detail, and permits a successful retry', async () => {
  for (const synchronous of [false, true]) {
    let calls = 0;
    const screen = detail({}, {Linking: {openURL: () => {calls++;if (calls > 1) return Promise.resolve();if (synchronous) throw Error('private device error');return Promise.reject(Error('private device error'));}}});
    assert.equal(await directions(screen.render()).props.onPress(), false);
    let tree = screen.render();assert.equal(tree.props.visible, true);assert.equal(directions(tree).props.disabled, false);assert.equal(screen.closes(), 0);
    assert.equal(errors(tree)[0].children.join(''), 'Could not open Google Maps. Please try again.');
    assert.equal(await directions(tree).props.onPress(), true);tree = screen.render();assert.equal(errors(tree).length, 0);assert.equal(calls, 2);
  }
});

test('old launch callbacks and completions cannot open again or alter a closed, changed, or logged-out detail', async () => {
  for (const change of ['close', 'reopen', 'place', 'coordinates', 'missing', 'account', 'same-token-login', 'unmount']) {
    const pending = deferred();let calls = 0;
    const screen = detail({}, {Linking: {openURL: () => {calls++;return pending.promise;}}});
    const oldPress = directions(screen.render()).props.onPress;const work = oldPress();
    if (change === 'close' || change === 'reopen') {screen.render().props.onClose();if (change === 'reopen') {screen.props.isVisible = false;screen.render();screen.props.isVisible = true;screen.render();}}
    if (change === 'place') {screen.props.recommendation = rec([21, 11], 'replacement');screen.render();}
    if (change === 'coordinates') {screen.props.recommendation = rec([21, 11]);screen.render();}
    if (change === 'missing') {screen.props.recommendation = null;screen.render();}
    if (change === 'account') screen.auth.set({token: 'new', user: {_id: 'new'}});
    if (change === 'same-token-login') {screen.auth.set({token: null, user: null});screen.auth.set({token: 'session-one', user: {_id: 'actor'}});}
    if (change === 'unmount') screen.host.unmount();
    assert.equal(await oldPress(), false);assert.equal(calls, 1);
    pending.reject(Error('late failure'));assert.equal(await work, false);assert.equal(errors(screen.render()).length, 0);
  }
});

test('a previous place completion cannot unlock a newer in-flight destination or replace its error state', async () => {
  const first = deferred(), second = deferred();let calls = 0;
  const screen = detail({}, {Linking: {openURL: () => ++calls === 1 ? first.promise : second.promise}});
  const work = directions(screen.render()).props.onPress();
  screen.props.recommendation = rec([21, 11], 'replacement');
  const newer = directions(screen.render()).props.onPress();first.reject(Error('old'));await work;
  assert.equal(directions(screen.render()).props.disabled, true);assert.equal(errors(screen.render()).length, 0);
  second.resolve();assert.equal(await newer, true);assert.equal(directions(screen.render()).props.disabled, false);
});

test('directions do not use the in-app browser, package probing, permissions or paid Google services', () => {
  const source = read('src/components/modals/RecommendationDetailModal.js') + read('src/utils/placeLocation.js');
  assert.match(source, /await Linking\.openURL\(directionsUrl\)/);
  assert.doesNotMatch(source, /canOpenURL|openBrowserAsync|<ExternalLink|from .*ExternalLink|maps\.googleapis|places\.googleapis|routes\.googleapis|requestForegroundPermissions|requestBackgroundPermissions|GOOGLE_MAPS_KEY|destination_place_id/);
});
