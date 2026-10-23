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
