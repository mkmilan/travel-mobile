const test = require('node:test');
const assert = require('node:assert/strict');
const {nodes, read} = require('./helpers/component-fixture.cjs');
const {detail, rec, nativeMap, expanded, getPlaceCoordinate} = require('./helpers/place-detail-fixture.cjs');
const preview = tree => nodes(tree, 'Pressable').find(node => node.props.testID === 'place-map-preview');
const plain = value => JSON.parse(JSON.stringify(value));
const route = [{lat: 10, lon: 20}, {lat: 11, lon: 21}];

test('place coordinates reject malformed/nonfinite/out-of-range data, while accepting zero and boundaries', () => {
  for (const coordinates of [undefined, null, {}, '', [], [1], [1, 2, 3], ['1', 2], [1, '2'], [null, 0], [0, undefined], [true, 0], [NaN, 0], [0, Infinity], [181, 0], [-181, 0], [0, 91], [0, -91]]) {
    assert.equal(getPlaceCoordinate({coordinates}), null);
    assert.equal(preview(detail({recommendation: {...rec(), location: {coordinates}}}).render()), undefined);
  }
  for (const recommendation of [null, {}, {_id: 'empty', location: {}}]) assert.equal(preview(detail({recommendation}).render()), undefined);
  for (const coordinates of [[0, 0], [180, 90], [-180, -90], [0, 10], [20, 0]]) {
    assert.deepEqual(plain(getPlaceCoordinate({coordinates})), {lat: coordinates[1], lon: coordinates[0]});
    assert.ok(preview(detail({recommendation: rec(coordinates)}).render()));
  }
});

test('standalone place preview is an accessible 220px tap target, with no Open map button or native gesture interception', () => {
  for (const tripRouteCoordinates of [undefined, null, [], [{lat: NaN, lon: 2}]]) {
    const screen = detail({tripRouteCoordinates, recommendation: rec([0, 0])});
    const tree = screen.render(), target = preview(tree);
    assert.equal(target.props.accessibilityRole, 'button');assert.match(target.props.accessibilityLabel, /larger map/);
    assert.equal(target.props.style.height, 220);
    assert.equal(target.children[0].props.pointerEvents, 'none');
    assert.equal(target.children[0].props.importantForAccessibility, 'no-hide-descendants');
    assert.ok(!nodes(tree, 'Text').some(node => /Open map/i.test(node.children.join(''))));
    const map = nativeMap(nodes(target, 'InteractiveTripMap')[0].props);
    assert.deepEqual(plain(nodes(map, 'Marker')[0].props.coordinate), {latitude: 0, longitude: 0});
    assert.equal(nodes(map, 'Polyline').length, 0);
    target.props.onPress();const opened = expanded(screen.render());
    assert.deepEqual(plain(nodes(opened.map, 'MapView')[0].props.initialRegion), {latitude: 0, longitude: 0, latitudeDelta: .002, longitudeDelta: .002});
  }
});

test('off-route place is centered in preview and expanded shared map, without changing ordinary trip framing or controls', () => {
  const screen = detail({tripRouteCoordinates: route, recommendation: rec([-40, -30])});
  const tree = screen.render();const before = nativeMap(nodes(tree, 'InteractiveTripMap')[0].props);
  preview(tree).props.onPress();const after = expanded(screen.render()).map;
  for (const map of [before, after]) {
    const view = nodes(map, 'MapView')[0];assert.equal(view.props.initialRegion.latitude, -30);assert.equal(view.props.initialRegion.longitude, -40);
    assert.equal(nodes(map, 'Marker')[0].props.title, 'Riverside cafe');assert.equal(nodes(map, 'Polyline').length, 1);
    assert.equal(view.props.showsUserLocation, false);assert.equal(view.props.showsMyLocationButton, false);assert.equal(view.props.toolbarEnabled, false);
    for (const key of ['googleMapId', 'scrollEnabled', 'zoomEnabled', 'onPress']) assert.equal(view.props[key], undefined);
  }
  const trip = nodes(nativeMap({routeCoords: route, recommendationMarkers: [{lat: -30, lon: -40}]}), 'MapView')[0];
  assert.equal(trip.props.initialRegion.latitude, 10.5);assert.equal(trip.props.initialRegion.longitude, 20.5);assert.equal(trip.props.key, route.length);
});

test('repeat taps reuse one native sheet; header Close, backdrop and Android Back return to detail before closing it', () => {
  for (const dismiss of ['header', 'backdrop', 'back']) {
    const screen = detail();
    for (let i = 0; i < 3; i++) {
      const open = preview(screen.render()).props.onPress;open();open();
      const tree = screen.render(), {shell, content} = expanded(tree);
      assert.equal(nodes(shell, 'Modal').length, 1);assert.equal(nodes(shell, 'BottomModal').length, 0);
      assert.equal(nodes(tree, 'ScrollView').length, 0);assert.equal(tree.props.style.padding, 0);
      if (dismiss === 'header') nodes(content, 'ModalHeader')[0].props.onClose();
      if (dismiss === 'back') shell.props.onRequestClose();
      if (dismiss === 'backdrop') nodes(shell, 'Pressable').find(node => node.props.testID === 'bottom-modal-backdrop').props.onPress();
      assert.ok(preview(screen.render()));assert.equal(screen.closes(), 0);
    }
    screen.render().props.onClose();assert.equal(screen.closes(), 1);
  }
});

test('place/visibility/session changes invalidate expanded state and old preview callbacks', () => {
  for (const change of ['place', 'hidden', 'close', 'account', 'same-token-login', 'unmount']) {
    const screen = detail();const oldOpen = preview(screen.render()).props.onPress;
    oldOpen();assert.equal(nodes(screen.render(), 'MapModalContent').length, 1);
    if (change === 'place') {screen.props.recommendation = rec([21, 11], 'new');screen.render();}
    if (change === 'hidden') {screen.props.isVisible = false;screen.render();screen.props.isVisible = true;screen.render();}
    if (change === 'close') {screen.render().props.onClose();screen.render().props.onClose();}
    if (change === 'account') screen.auth.set({token: 'new', user: {_id: 'new'}});
    if (change === 'same-token-login') {screen.auth.set({token: null, user: null});screen.auth.set({token: 'session-one', user: {_id: 'actor'}});}
    if (change === 'unmount') screen.host.unmount();
    oldOpen();assert.equal(nodes(screen.render(), 'MapModalContent').length, 0);
  }
});

test('updated coordinates on the same place reset the native initial camera; invalidation removes its map', () => {
  const screen = detail();preview(screen.render()).props.onPress();
  const before = nodes(expanded(screen.render()).map, 'MapView')[0];
  screen.props.recommendation = rec([70, 40]);
  const after = nodes(expanded(screen.render()).map, 'MapView')[0];
  assert.notEqual(before.props.key, after.props.key);assert.equal(after.props.initialRegion.latitude, 40);assert.equal(after.props.initialRegion.longitude, 70);
  screen.props.recommendation = rec([Infinity, 1]);assert.equal(nodes(screen.render(), 'MapModalContent').length, 0);assert.equal(preview(screen.render()), undefined);
});

test('expanded place view introduces no editable picker, location request, route API or nested MapModal', () => {
  const source = read('src/components/modals/RecommendationDetailModal.js');
  assert.doesNotMatch(source, /<MapModal\s|requestForegroundPermissions|requestBackgroundPermissions|fitToCoordinates|draggable|googleMapId/);
});
