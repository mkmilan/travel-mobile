const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture, nodes, native} = require('./helpers/component-fixture.cjs');
const {hooksFixture} = require('./helpers/hooks-fixture.cjs');

function gallery(extra = {}) {
  const host = hooksFixture();
  const props = {photoIds: ['a', 'b'], canDelete: true, deleteDisabled: false, ...extra};
  const alerts = [];
  const screen = fixture('src/components/trip/PhotoGallery.js', 'PhotoGallery', props, {
    ...native, ...host.hooks, Image: 'Image', ImageViewing: 'ImageViewing',
    Dimensions: {get: () => ({width: 400})}, StyleSheet: {create: value => value},
    usePhotoSource: () => ({mediaKey: 'stable', getPhotoSource: id => id === 'invalid' ? undefined : {uri: `fixture:${id}`}}),
    Alert: {alert: (...args) => alerts.push(args)},
  });
  const render = () => host.render(() => screen.render());
  const viewer = () => nodes(render(), 'ImageViewing')[0].props;
  const thumbnail = id => nodes(render(), 'FlatList')[0].props.renderItem({item: id}).props;
  render(); // initial media lifetime
  return {props, render, viewer, thumbnail, alerts};
}

test('MOB-041 confirmed deletion dismisses an opened pending photo before rendering an invalid index', async () => {
  let settle;
  const pending = new Promise(resolve => {settle = resolve;});
  const screen = gallery({onDelete: async id => {await pending; screen.props.photoIds = screen.props.photoIds.filter(value => value !== id);}});
  screen.thumbnail('a').onLongPress();
  const deleting = screen.alerts[0][2].find(button => button.text === 'Delete').onPress();
  screen.props.deleteDisabled = true;
  screen.thumbnail('a').onPress();
  assert.equal(screen.viewer().visible, true);
  settle(); await deleting;
  const after = screen.viewer();
  assert.equal(after.visible, false);
  assert.equal(after.imageIndex, 0);
  assert.deepEqual(Array.from(after.images, photo => photo.uri), ['fixture:b']);
  screen.props.photoIds = ['a', 'b'];
  assert.equal(screen.viewer().visible, false, 'returning data must not reopen an obsolete selection');
  screen.thumbnail('b').onPress();
  assert.equal(screen.viewer().visible, true);
  assert.equal(screen.viewer().imageIndex, 1);
});

test('MOB-041 failed removal leaves the still-present photo preview usable', async () => {
  let settle;
  const pending = new Promise(resolve => {settle = resolve;});
  const screen = gallery({onDelete: async () => {await pending; return false;}});
  screen.thumbnail('a').onLongPress();
  const deleting = screen.alerts[0][2].find(button => button.text === 'Delete').onPress();
  screen.props.deleteDisabled = true;
  screen.thumbnail('a').onPress(); settle(); await deleting;
  const after = screen.viewer();
  assert.equal(after.visible, true); assert.equal(after.imageIndex, 0);
  assert.equal(after.images[0].uri, 'fixture:a');
});

test('MOB-041 refresh retains selection by ID across reorder but closes missing or empty selections', () => {
  const screen = gallery(); screen.thumbnail('b').onPress();
  screen.props.photoIds = ['b', 'a'];
  let after = screen.viewer();
  assert.equal(after.visible, true); assert.equal(after.imageIndex, 0); assert.equal(after.images[0].uri, 'fixture:b');
  screen.props.photoIds = ['a']; after = screen.viewer();
  assert.equal(after.visible, false); assert.equal(after.imageIndex, 0);
  screen.props.photoIds = ['a', 'b']; assert.equal(screen.viewer().visible, false);
  screen.thumbnail('a').onPress(); screen.props.photoIds = [];
  assert.equal(screen.viewer().visible, false); assert.equal(screen.viewer().imageIndex, 0);
});

test('MOB-041 filtered sources and shared close preserve valid indices, swipe and explicit reopen', () => {
  const screen = gallery({photoIds: ['invalid', 'a', 'b']}); screen.thumbnail('b').onPress();
  let after = screen.viewer(); assert.equal(after.visible, true); assert.equal(after.imageIndex, 1);
  assert.equal(after.swipeToCloseEnabled, true); assert.equal(after.doubleTapToZoomEnabled, false);
  after.onRequestClose(); assert.equal(screen.viewer().visible, false);
  screen.thumbnail('a').onPress(); assert.equal(screen.viewer().visible, true);
  screen.thumbnail('invalid').onPress(); after = screen.viewer();
  assert.equal(after.visible, false); assert.equal(after.imageIndex, 0);
});

// Run the actual adapter and installed swipe-index hook with a tiny keyed React
// host. Native list/layout/gestures remain mocked; momentum events are real hook
// inputs. Both keys matter: the gallery lifetime and EnhancedImageViewing's
// imageIndex key. A prop-only viewer mock cannot catch swipe/remount regressions.
function nativeViewer(screen) {
  const {load} = require('./helpers/component-fixture.cjs');
  let host, lifetime, mounts = 0;
  const h = (type, props, ...children) => ({type, props: props || {}, children: children.flat()});
  const hooks = Object.fromEntries(['useState', 'useRef', 'useCallback', 'useEffect'].map(name => [name, (...args) => host.hooks[name](...args)]));
  const useImageIndexChange = load('node_modules/react-native-image-viewing/dist/hooks/useImageIndexChange.js', 'useImageIndexChange', hooks);
  const Enhanced = load('src/components/SafeImageViewing.js', 'EnhancedImageViewing', {
    ...native, ...hooks, h, React: {createElement: h},
    SafeAreaInsetsContext: {Provider: 'InsetsReset'}, SafeAreaFrameContext: {Provider: 'FrameReset'},
    Animated: {View: 'AnimatedView'}, Dimensions: {get: () => ({width: 400, height: 800})},
    StyleSheet: {create: value => value}, VirtualizedList: 'VirtualizedList', ImageItem: 'ImageItem', StatusBarManager: 'StatusBarManager',
    useImageIndexChange, useAnimatedComponents: () => [[], [], () => {}], useRequestClose: fn => [1, fn],
  });
  const render = () => {
    const props = screen.viewer();
    const inner = Enhanced(props);
    const nextLifetime = JSON.stringify([props.key, inner.props.key]);
    if (nextLifetime !== lifetime) {host = hooksFixture(); lifetime = nextLifetime; mounts++;}
    return host.render(() => inner.type(inner.props));
  };
  const swipeTo = index => {
    nodes(render(), 'VirtualizedList')[0].props.onMomentumScrollEnd({nativeEvent: {contentOffset: {x: index * 400}}});
    render(); // index effect informs gallery about the actually viewed photo
    render(); // apply gallery rerender without resetting the native gesture/list
  };
  return {render, swipeTo, mounts: () => mounts};
}

test('MOB-041 actual horizontal swipe tracks selected ID without remount and closes when that photo disappears', () => {
  const screen = gallery(); screen.thumbnail('a').onPress();
  const viewer = nativeViewer(screen); viewer.render(); const opened = viewer.mounts();
  viewer.swipeTo(1);
  assert.equal(viewer.mounts(), opened, 'swipe must not remount native modal/list');
  screen.props.photoIds = ['a'];
  assert.equal(viewer.render(), null, 'removing currently viewed B must close even though initial A remains');
  screen.props.photoIds = ['a', 'b']; assert.equal(viewer.render(), null);
  screen.thumbnail('a').onPress();
  assert.equal(nodes(viewer.render(), 'VirtualizedList')[0].props.initialScrollIndex, 0);
});

test('MOB-041 actual swiped photo survives initial-photo removal and reorder at a valid native index', () => {
  const screen = gallery({photoIds: ['a', 'b', 'c']}); screen.thumbnail('a').onPress();
  const viewer = nativeViewer(screen); viewer.render(); viewer.swipeTo(1);
  screen.props.photoIds = ['c', 'b'];
  let list = nodes(viewer.render(), 'VirtualizedList')[0];
  assert.ok(list, 'removing initial A must not close current B');
  assert.equal(list.props.initialScrollIndex, 1); assert.equal(list.props.getItem(null, 1).uri, 'fixture:b');
  screen.props.photoIds = ['b', 'c'];
  list = nodes(viewer.render(), 'VirtualizedList')[0];
  assert.equal(list.props.initialScrollIndex, 0); assert.equal(list.props.getItem(null, 0).uri, 'fixture:b');
  const before = viewer.mounts(); viewer.swipeTo(1); assert.equal(viewer.mounts(), before);
  screen.props.photoIds = ['b']; assert.equal(viewer.render(), null, 'later swipes use refreshed photo identities');
});
