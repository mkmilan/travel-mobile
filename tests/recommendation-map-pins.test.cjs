const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const {hooksFixture} = require('./helpers/hooks-fixture.cjs');
const style = {create: x => x, absoluteFill: {position: 'absolute'}};
const route = [{latitude: 10, longitude: 20}, {latitude: 12, longitude: 24}];
const rec = (coordinates, name = 'Saved place', _id = 'rec') => ({_id, name, location: {type: 'Point', coordinates}});
const plain = value => JSON.parse(JSON.stringify(value));
function map(props = {}) {
  const modal = fixture('src/components/modals/MapModal.js', 'MapModal', props, {
    ...native, theme, StyleSheet: style, InteractiveTripMap: 'InteractiveTripMap', BottomModal: 'BottomModal', ModalHeader: 'ModalHeader',
  }).render();
  const content = modal.children[0];
  modal.children = [content.type(content.props)]; // Render the extracted shared content too.
  const mapProps = nodes(modal, 'InteractiveTripMap')[0].props;
  const tree = fixture('src/components/map/InteractiveTripMap.js', 'InteractiveTripMap', mapProps, {
    ...native, theme, StyleSheet: style, useMemo: f => f(), MapView: 'MapView', Marker: 'Marker', Polyline: 'Polyline',
  }).render();
  return {modal, tree, markers: nodes(tree, 'Marker'), view: nodes(tree, 'MapView')[0]};
}

test('trip map consumes saved GeoJSON [longitude, latitude] and uses a standard titled pin', () => {
  const saved = Object.freeze(rec(Object.freeze([20, 10]), '  Riverside cafe  '));
  const {markers, view} = map({routeCoords: route, recommendations: Object.freeze([saved])});
  assert.equal(markers.length, 1);
  assert.deepEqual(plain(markers[0].props.coordinate), {latitude: 10, longitude: 20});
  assert.equal(markers[0].props.title, 'Riverside cafe');
  assert.equal(markers[0].children.length, 0, 'no custom pin or callout; native title callout on tap');
  assert.equal(markers[0].props.onPress, undefined);
  assert.equal(markers[0].props.draggable, undefined);
  assert.equal(view.props.googleMapId, undefined);
  assert.deepEqual(saved.location.coordinates, [20, 10], 'display does not mutate saved coordinates');
});

test('missing, malformed, nonnumeric, nonfinite and out-of-range locations never reach native markers', () => {
  const bad = [null, undefined, {}, {location: {}}, ...[
    null, {}, '20,10', [], [20], [20, 10, 30], [null, 0], [0, undefined], ['', 0], [true, 0], ['20', '10'],
    [NaN, 0], [0, Infinity], [-Infinity, 0], [180.001, 0], [-180.001, 0], [0, 90.001], [0, -90.001],
  ].map(x => rec(x))];
  assert.equal(map({recommendations: bad}).markers.length, 0);
  for (const recommendations of [undefined, null, {}, 'bad', []]) assert.equal(map({recommendations}).markers.length, 0);
});

test('zero and geographic boundaries are valid; missing titles get a safe fallback', () => {
  const recommendations = [rec([0, 0], ''), rec([180, 90], null), rec([-180, -90], 17), rec([0, 12], '   '), rec([23, 0], 'Equator')];
  const {markers} = map({recommendations});
  assert.equal(markers.length, 5);
  assert.deepEqual(markers.map(p => p.props.title), ['Recommendation', 'Recommendation', 'Recommendation', 'Recommendation', 'Equator']);
  assert.deepEqual(plain(markers[0].props.coordinate), {latitude: 0, longitude: 0});
});

test('many pins, identical coordinates, duplicate/missing IDs remain distinct without clustering or moving locations', () => {
  const recommendations = Array.from({length: 100}, (_, i) => rec([20, 10], `Place ${i}`, i % 2 ? undefined : 'duplicate'));
  const {markers} = map({recommendations});
  assert.equal(markers.length, 100);
  assert.equal(new Set(markers.map(p => p.props.key)).size, 100);
  assert.ok(markers.every(p => JSON.stringify(plain(p.props.coordinate)) === JSON.stringify({latitude: 10, longitude: 20})));
  assert.equal(markers.at(-1).props.title, 'Place 99');
  // Exact overlaps intentionally retain native map behavior; no clustering/spiderfying.
});

test('route, viewport, map controls, header and close callback are preserved with and without recommendations', () => {
  let closed = 0;
  const base = map({routeCoords: route, visible: true, onClose: () => closed++});
  const added = map({routeCoords: route, recommendations: [rec([-100, -40])], visible: true, onClose: () => closed++});
  assert.deepEqual(plain(nodes(base.tree, 'Polyline')[0]), plain(nodes(added.tree, 'Polyline')[0]));
  assert.deepEqual(plain(base.view.props), plain(added.view.props));
  assert.equal(added.view.props.showsUserLocation, false);
  assert.equal(added.view.props.showsMyLocationButton, false);
  assert.equal(added.view.props.toolbarEnabled, false);
  assert.equal(nodes(added.modal, 'ModalHeader')[0].props.title, 'Route Map');
  nodes(added.modal, 'ModalHeader')[0].props.onClose(); added.modal.props.onClose(); assert.equal(closed, 2);
});

test('empty/invalid route falls back to recommendation coordinates, or the existing empty region', () => {
  for (const routeCoords of [[], null, [null, {}, {lat: NaN, lon: 0}]]) {
    const {tree, view} = map({routeCoords, recommendations: [rec([20, 10])]});
    assert.equal(nodes(tree, 'Polyline').length, 0);
    assert.deepEqual(plain(view.props.initialRegion), {latitude: 10, longitude: 20, latitudeDelta: 0.002, longitudeDelta: 0.002});
  }
  assert.deepEqual(plain(map().view.props.initialRegion), {latitude: 0, longitude: 0, latitudeDelta: 0.2, longitudeDelta: 0.2});
  assert.equal(nodes(map({routeCoords: [route[0]]}).tree, 'Polyline').length, 0);
});

test('rerendering actual map component replaces/removes markers instead of retaining prior trip pins', () => {
  const host = hooksFixture(), props = {routeCoords: route, recommendationMarkers: [{_id: 'a', lat: 10, lon: 20, name: 'A'}]};
  const component = fixture('src/components/map/InteractiveTripMap.js', 'InteractiveTripMap', props, {
    ...native, ...host.hooks, theme, StyleSheet: style, MapView: 'MapView', Marker: 'Marker', Polyline: 'Polyline',
  });
  const render = () => host.render(() => component.render());
  assert.equal(nodes(render(), 'Marker')[0].props.title, 'A');
  props.recommendationMarkers = [{_id: 'b', lat: 11, lon: 21, name: 'B'}];
  assert.deepEqual(nodes(render(), 'Marker').map(n => n.props.title), ['B']);
  props.recommendationMarkers = [];
  assert.equal(nodes(render(), 'Marker').length, 0); host.unmount();
});
