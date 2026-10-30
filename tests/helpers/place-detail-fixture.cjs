const {load, fixture, nodes, native, theme} = require('./component-fixture.cjs');
const {hooksFixture, authFixture} = require('./hooks-fixture.cjs');
const style = {create: value => value, absoluteFill: {position: 'absolute'}, absoluteFillObject: {position: 'absolute'}};
const {getPlaceCoordinate, getGoogleMapsDirectionsUrl} = load('src/utils/placeLocation.js', '({getPlaceCoordinate, getGoogleMapsDirectionsUrl})');
const rec = (coordinates = [20, 10], id = 'place') => ({_id: id, name: 'Riverside cafe', location: {type: 'Point', coordinates}, photos: []});
const defaults = {...native, theme, StyleSheet: style, Feather: 'Feather', Ionicons: 'Ionicons', Avatar: 'Avatar',
  BottomModal: 'BottomModal', ModalHeader: 'ModalHeader', InteractiveTripMap: 'InteractiveTripMap', MapModalContent: 'MapModalContent', PhotoGallery: 'PhotoGallery',
  getPlaceCoordinate, getGoogleMapsDirectionsUrl, useRouter: () => ({push(){}}), usePhotoManager: () => ({photos: [], isDeleting: () => false})};
function detail(overrides = {}, dependencies = {}) {
  const host = hooksFixture(), auth = authFixture(); let closes = 0;
  const props = {isVisible: true, recommendation: rec(), tripRouteCoordinates: [], onClose: () => closes++, ...overrides};
  const useProfileContext = load('src/hooks/useProfileContext.js', 'useProfileContext', {...host.hooks, useAuthStore: auth.store});
  const component = fixture('src/components/modals/RecommendationDetailModal.js', 'RecommendationDetailModal', props,
    {...defaults, ...host.hooks, useProfileContext, useAuthStore: auth.store, ...dependencies});
  return {host, auth, props, render: () => host.render(() => component.render()), closes: () => closes};
}
function nativeMap(props) {
  return fixture('src/components/map/InteractiveTripMap.js', 'InteractiveTripMap', props,
    {...defaults, useMemo: fn => fn(), MapView: 'MapView', Marker: 'Marker', Polyline: 'Polyline'}).render();
}
function expanded(tree) {
  const node = nodes(tree, 'MapModalContent')[0];
  const content = fixture('src/components/modals/MapModal.js', 'MapModalContent', node.props, defaults).render();
  const map = nativeMap(nodes(content, 'InteractiveTripMap')[0].props);
  const shell = fixture('src/components/modals/BottomModal.js', 'BottomModal', {...tree.props, children: content}, {
    ...defaults, Platform: {OS: 'android'}, Dimensions: {get: () => ({height: 800})},
    Animated: {Value: function(value){this.value=value;}, View: 'Animated.View', timing: () => ({start(){}})},
  }).render();
  return {content, map, shell};
}
module.exports = {detail, rec, nativeMap, expanded, getPlaceCoordinate, getGoogleMapsDirectionsUrl};
