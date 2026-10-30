const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture, load, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const {hooksFixture, authFixture} = require('./helpers/hooks-fixture.cjs');
const {getFitRegion} = load('src/utils/geo.js', '({getFitRegion})');
const plain = v => JSON.parse(JSON.stringify(v));
const routeCoordinates = [[20, 10], [24, 12]];
const options = {requireLocationSelection: true, routeCoordinates};
const button = (tree, id) => nodes(tree, 'Pressable').find(n => n.props.testID === `recommendation-${id}`);
const text = tree => nodes(tree, 'Text').flatMap(n => n.children).join(' ').replace(/\s+/g, ' ');
const tap = (tree, latitude, longitude) => nodes(tree, 'MapView')[0].props.onPress({nativeEvent: {coordinate: {latitude, longitude}}});
function form(submit = async () => ({_id: 'created'})) {
  const host = hooksFixture(), auth = authFixture(), requests = [], alerts = [];
  let keyboardDismissals = 0;
  const component = fixture('src/components/modals/AddRecommendationModal.js', 'AddRecommendationModal', {
    onSubmit: async (...args) => {requests.push(args); return submit(...args);},
  }, {
    ...native, ...host.hooks, theme, getFitRegion, useAuthStore: auth.store,
    StyleSheet: {create: x => x, absoluteFill: {}}, BottomModal: 'BottomModal', ModalHeader: 'ModalHeader',
    MapView: 'MapView', Marker: 'Marker', Polyline: 'Polyline', StarRating: 'StarRating',
    Ionicons: 'Ionicons', TripPhotoThumb: 'TripPhotoThumb', RECOMMENDATION_CATEGORIES: [], RECOMMENDATION_TAGS: [],
    Keyboard: {dismiss: () => keyboardDismissals++}, Alert: {alert: (...args) => alerts.push(args)}, console: {error() {}},
    usePhotoManager: () => ({photos: [], getPhotos: () => [], uploading: false, setPhotos() {}, uploadPendingPhotos: async () => {}}),
  });
  const render = () => host.render(() => component.render());
  render();
  const open = (opts = options, trip = 'saved-trip', location = null) => {component.ref.current.open(location, trip, opts); return render();};
  const pick = () => {button(render(), 'location-open').props.onPress(); return render();};
  const confirm = () => {button(render(), 'location-confirm').props.onPress(); return render();};
  const fill = () => {
    const tree = render();
    nodes(tree, 'TextInput')[0].props.onChangeText('Cafe'); nodes(tree, 'TextInput')[1].props.onChangeText('Nice place');
    nodes(tree, 'StarRating')[0].props.onRatingChange(4);
    nodes(tree).find(n => n.props.onCategoryChange).props.onCategoryChange('CAFE');
    nodes(tree).find(n => n.props.onTagsChange).props.onTagsChange(['QUIET']);
    return render();
  };
  return {host, auth, requests, alerts, component, render, open, pick, confirm, fill, keyboardDismissals: () => keyboardDismissals};
}

test('new saved-trip recommendation has no default pin and cannot save before explicit confirmation', async () => {
  const f = form(); f.open(options, 'saved-trip', {lat: 10, lon: 20}); f.fill();
  let tree = f.render(); assert.equal(nodes(tree, 'MapView').length, 0);
  assert.match(text(tree), /Choose location on map/); assert.doesNotMatch(text(tree), /Lat:/);
  await button(tree, 'save').props.onPress(); assert.equal(f.requests.length, 0); assert.match(f.alerts.at(-1)[1], /select a location/);
  const oldSave = button(tree, 'save').props.onPress;
  tree = f.pick(); assert.equal(nodes(tree, 'Marker').length, 0); assert.equal(button(tree, 'location-confirm').props.disabled, true);
  assert.deepEqual(plain(nodes(tree, 'Polyline')[0].props.coordinates), [{latitude: 10, longitude: 20}, {latitude: 12, longitude: 24}]);
  assert.deepEqual(plain(nodes(tree, 'MapView')[0].props.region), plain(getFitRegion([{lat: 10, lon: 20}, {lat: 12, lon: 24}])));
  assert.equal(nodes(tree, 'MapView')[0].props.showsUserLocation, false);
  assert.equal(f.keyboardDismissals(), 1);
  tap(tree, 0, 0); await oldSave(); assert.equal(f.requests.length, 0, 'candidate is not committed and cannot submit behind picker');
  tree = f.render(); assert.equal(button(tree, 'location-confirm').props.disabled, false);
  assert.deepEqual(plain(nodes(tree, 'Marker')[0].props.coordinate), {latitude: 0, longitude: 0});
  tree = f.confirm(); assert.match(text(tree), /Lat: 0.0000 Lon: 0.0000/);
  await button(tree, 'save').props.onPress();
  assert.equal(f.requests.length, 1); assert.deepEqual(plain(f.requests[0]), [{latitude: 0, longitude: 0, primaryCategory: 'CAFE', attributeTags: ['QUIET'], rating: 4, name: 'Cafe', description: 'Nice place', associatedTrip: 'saved-trip', photoIds: []}, false, false]);
  assert.equal(f.render().props.visible, false); f.host.unmount();
});

test('repeated taps move one candidate, allow off-route locations and confirm the latest tap', async () => {
  const f = form(); f.open(); f.fill(); const tree = f.pick();
  tap(tree, 10, 20); tap(tree, -90, -180); tap(tree, 45, 130);
  button(tree, 'location-confirm').props.onPress(); // latest ref wins even before another render
  const confirmed = f.render(); assert.match(text(confirmed), /Lat: 45.0000 Lon: 130.0000/);
  const reopened = f.pick(); assert.equal(nodes(reopened, 'Marker').length, 1);
  assert.deepEqual(plain(nodes(reopened, 'Marker')[0].props.coordinate), {latitude: 45, longitude: 130});
  assert.equal(nodes(reopened, 'Polyline').length, 1);
  assert.equal(nodes(reopened, 'MapView')[0].props.region.latitude, 27.5, 'reopen frames route and off-route confirmed choice');
  f.host.unmount();
});

for (const cancel of ['button', 'header', 'android-back']) {
  test(`${cancel} cancels the candidate without overwriting a confirmed location or dismissing the form`, async () => {
    const f = form(); f.open(); f.fill(); tap(f.pick(), 1, 2); f.confirm();
    const picker = f.pick(); tap(picker, 30, 40);
    if (cancel === 'button') button(picker, 'location-cancel').props.onPress();
    else if (cancel === 'header') nodes(picker, 'ModalHeader')[0].props.onClose();
    else {
      // Run actual BottomModal and invoke the native Modal's Android-back bridge.
      const nativeModal = fixture('src/components/modals/BottomModal.js', 'BottomModal', picker.props, {
        ...native, theme, StyleSheet: {create: x => x}, Platform: {OS: 'android'}, Dimensions: {get: () => ({height: 800})},
        Animated: {Value: function () {}, View: 'AnimatedView', timing: () => ({start() {}})},
      }).render();
      nativeModal.props.onRequestClose();
    }
    let tree = f.render(); assert.equal(tree.props.visible, true); assert.match(text(tree), /Lat: 1.0000 Lon: 2.0000/);
    assert.equal(nodes(tree, 'TextInput')[0].props.value, 'Cafe');
    assert.deepEqual(plain(nodes(f.pick(), 'Marker')[0].props.coordinate), {latitude: 1, longitude: 2});
    button(f.render(), 'location-cancel').props.onPress(); tree = f.render(); await button(tree, 'save').props.onPress();
    assert.equal(f.requests[0][0].latitude, 1); assert.equal(f.requests[0][0].longitude, 2); f.host.unmount();
  });
}

test('cancel before first confirmation leaves the form unselected, including picker reopen', async () => {
  const f = form(); f.open(); f.fill(); const picker = f.pick(); tap(picker, 12, 34);
  picker.props.onClose(); assert.equal(f.render().props.visible, true); assert.doesNotMatch(text(f.render()), /Lat:/);
  const reopened = f.pick(); assert.equal(nodes(reopened, 'Marker').length, 0); assert.equal(button(reopened, 'location-confirm').props.disabled, true);
  button(reopened, 'location-cancel').props.onPress(); await button(f.render(), 'save').props.onPress(); assert.equal(f.requests.length, 0); f.host.unmount();
});

test('missing/empty/malformed routes stay usable without pins; invalid route points never reach the polyline', () => {
  for (const raw of [undefined, null, {}, '', [], [null, {}, [], ['x', 1], [1, NaN], [Infinity, 2], [181, 0], [0, 91]]]) {
    const f = form(); f.open({requireLocationSelection: true, routeCoordinates: raw}); const tree = f.pick();
    assert.equal(nodes(tree, 'Marker').length, 0); assert.equal(nodes(tree, 'Polyline').length, 0);
    assert.deepEqual(plain(nodes(tree, 'MapView')[0].props.region), {latitude: 0, longitude: 0, latitudeDelta: 120, longitudeDelta: 120});
    tap(tree, 0, 0); assert.match(text(f.confirm()), /Lat: 0.0000 Lon: 0.0000/); f.host.unmount();
  }
  for (const route of [[[0, 0]], [[0, 0], null, [12, 13], [181, 10], ['3', 2]]]) {
    const f = form(); f.open({requireLocationSelection: true, routeCoordinates: route}); const tree = f.pick();
    assert.equal(nodes(tree, 'Polyline').length, route.length === 1 ? 0 : 1);
    if (route.length > 1) assert.deepEqual(plain(nodes(tree, 'Polyline')[0].props.coordinates), [{latitude: 0, longitude: 0}, {latitude: 13, longitude: 12}]);
    assert.equal(nodes(tree, 'Marker').length, 0); f.host.unmount();
  }
});

test('invalid taps cannot enable confirmation, replace a valid candidate or escape the save guard', () => {
  const f = form(); f.open(); const tree = f.pick(), press = nodes(tree, 'MapView')[0].props.onPress;
  const bad = [null, {}, {nativeEvent: {}}, ...[[null, 0], ['1', 2], [NaN, 0], [0, Infinity], [91, 0], [-91, 0], [0, 181], [0, -181]].map(([latitude, longitude]) => ({nativeEvent: {coordinate: {latitude, longitude}}}))];
  bad.forEach(press); button(tree, 'location-confirm').props.onPress();
  assert.equal(nodes(f.render(), 'Marker').length, 0); assert.equal(button(f.render(), 'location-confirm').props.disabled, true);
  tap(tree, 90, 180); bad.forEach(press); assert.deepEqual(plain(nodes(f.render(), 'Marker')[0].props.coordinate), {latitude: 90, longitude: 180});
  assert.match(text(f.confirm()), /Lat: 90.0000 Lon: 180.0000/); f.host.unmount();
});

test('new form/trip resets choice, route and candidate; callbacks retained from a cancelled picker are inert', () => {
  const f = form(); f.open(); f.fill(); const first = f.pick(); tap(first, 1, 2); f.confirm();
  const old = f.pick(); tap(old, 3, 4);
  f.open({requireLocationSelection: true, routeCoordinates: [[70, 40], [72, 42]]}, 'other-trip');
  tap(old, 9, 8); button(old, 'location-confirm').props.onPress(); old.props.onClose();
  let tree = f.render(); assert.equal(tree.props.visible, true); assert.doesNotMatch(text(tree), /Lat:/); assert.equal(nodes(tree, 'TextInput')[0].props.value, '');
  tree = f.pick(); assert.equal(nodes(tree, 'Marker').length, 0); assert.equal(nodes(tree, 'MapView')[0].props.region.latitude, 41);
  const late = tree; tree.props.onClose(); tree = f.pick();
  tap(late, 11, 12); button(late, 'location-confirm').props.onPress(); late.props.onClose();
  assert.equal(button(f.render(), 'location-confirm').props.disabled, true); assert.equal(nodes(f.render(), 'Marker').length, 0);
  f.host.unmount();
});

test('old picker callbacks cannot write or submit after account change or unmount', async () => {
  for (const change of ['account', 'unmount']) {
    const f = form(); f.open(); f.fill(); const oldSave = button(f.render(), 'save').props.onPress, old = f.pick(); tap(old, 1, 2);
    if (change === 'account') {f.auth.set({token: 'other', user: {_id: 'other'}}); f.render();} else f.host.unmount();
    tap(old, 3, 4); button(old, 'location-confirm').props.onPress(); old.props.onClose(); await oldSave();
    assert.equal(f.requests.length, 0); assert.deepEqual(plain(nodes(f.render(), 'Marker')[0].props.coordinate), {latitude: 1, longitude: 2});
    if (change === 'account') {assert.equal(f.render().props.visible, false); f.host.unmount();}
  }
});

test('recording GPS and existing recommendation edit keep their inline-map flow, including zero coordinates', async () => {
  for (const edit of [false, true]) for (const coordinates of [[2, 1], [0, 0]]) {
    const f = form();
    if (edit) f.component.ref.current.openEdit({_id: 'existing', name: 'Cafe', description: 'Nice place', rating: 4, primaryCategory: 'CAFE', attributeTags: ['QUIET'], location: {coordinates}, associatedTrip: 'saved-trip'});
    else {f.component.ref.current.open({lat: coordinates[1], lon: coordinates[0]}); f.fill();}
    let tree = f.render(); assert.equal(button(tree, 'location-open'), undefined); assert.equal(nodes(tree, 'Polyline').length, 0);
    assert.equal(nodes(tree, 'MapView')[0].props.showsUserLocation, true);
    assert.deepEqual(plain(nodes(tree, 'Marker')[0].props.coordinate), {latitude: coordinates[1], longitude: coordinates[0]});
    assert.match(text(tree), /Lat:/);
    tap(tree, 0, 0); tree = f.render(); await button(tree, 'save').props.onPress();
    assert.equal(f.requests[0][0].latitude, 0); assert.equal(f.requests[0][0].longitude, 0); assert.equal(f.requests[0][1], edit);
    if (edit) assert.equal(f.requests[0][0]._id, 'existing'); f.host.unmount();
  }
});

test('failed save preserves the confirmed point for retry and double taps remain single-flight', async () => {
  let reject, resolve, fail = true;
  const f = form(() => fail ? new Promise((a, b) => {resolve = a; reject = b;}) : Promise.resolve({_id: 'created'}));
  f.open(); f.fill(); tap(f.pick(), 5, 6); f.confirm(); const save = button(f.render(), 'save').props.onPress;
  const work = save(); await save(); assert.equal(f.requests.length, 1); assert.equal(button(f.render(), 'location-open').props.disabled, true);
  reject(Error('Offline')); await work; assert.equal(f.render().props.visible, true); assert.match(text(f.render()), /Lat: 5.0000 Lon: 6.0000/);
  fail = false; await button(f.render(), 'save').props.onPress(); assert.equal(f.requests.length, 2); assert.equal(f.requests[1][0].longitude, 6);
  assert.equal(f.render().props.visible, false); f.host.unmount();
});

test('create/edit forms use place labels without renaming user content or payload fields', () => {
  const f = form();
  let tree = f.open();
  assert.equal(nodes(tree, 'ModalHeader')[0].props.title, 'Add a place');
  assert.equal(nodes(tree, 'TextInput')[0].props.placeholder, 'Enter place name…');
  assert.ok(text(tree).includes('Save place'));
  tree.props.onClose();
  const existing = {_id: 'rec', name: 'My recommendation', description: 'Recommendation is my own text',
    rating: 4, primaryCategory: 'CAFE', attributeTags: [], location: {type: 'Point', coordinates: [0, 0]}};
  f.component.ref.current.openEdit(existing); tree = f.render();
  assert.equal(nodes(tree, 'ModalHeader')[0].props.title, 'Edit place');
  assert.ok(text(tree).includes('Update place'));
  assert.equal(nodes(tree, 'TextInput')[0].props.value, existing.name);
  assert.equal(nodes(tree, 'TextInput')[1].props.value, existing.description);
  tree.props.onClose(); f.host.unmount();
});
