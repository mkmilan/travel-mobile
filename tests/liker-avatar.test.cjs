const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, nodes, theme, native } = require('./helpers/component-fixture.cjs');
const styles = { create: value => value, compose: (left, right) => [left, right] };

test('detail likers use shared avatar with raw photo ID and preserve close-before-navigation', () => {
  const calls = [], user = { _id: 'fixture-user', username: 'Milan', profilePictureUrl: 'a'.repeat(24) };
  const modal = fixture('src/components/modals/LikersModal.js', 'LikersModal', {
    isVisible: true, likers: [user], onClose: () => calls.push('close'),
  }, { ...native, theme, StyleSheet: styles, Avatar: 'Avatar', BottomModal: 'BottomModal', ModalHeader: 'ModalHeader',
    useRouter: () => ({ push: path => calls.push(path) }),
  });
  const list = nodes(modal.render(), 'FlatList')[0];
  const row = list.props.renderItem({ item: user });
  const avatar = nodes(row, 'Avatar')[0];
  assert.equal(avatar.props.user, user);
  assert.equal(avatar.props.size, 40);
  assert.equal(nodes(row, 'Image').length, 0);
  row.props.onPress();
  assert.deepEqual(calls, ['close', '/user/fixture-user']);
});

test('shared avatar resolves raw IDs through authenticated photo source and remounts after session change', () => {
  const user = { username: 'Milan', profilePictureUrl: 'a'.repeat(24) };
  let session = 'one'; const requested = [];
  const avatar = fixture('src/components/ui/Avatar.js', 'Avatar', { user }, {
    ...native, theme, StyleSheet: styles,
    usePhotoSource: () => ({ mediaKey: session, getPhotoSource: id => {
      requested.push(id); return { uri: `https://fixture.invalid/api/photos/${id}`, headers: { Authorization: `Bearer ${session}` } };
    } }),
  });
  const first = nodes(avatar.render(), 'Image')[0];
  session = 'two';
  const second = nodes(avatar.render(), 'Image')[0];
  assert.deepEqual(requested, [user.profilePictureUrl, user.profilePictureUrl]);
  assert.equal(first.props.source.headers.Authorization, 'Bearer one');
  assert.equal(second.props.source.headers.Authorization, 'Bearer two');
  assert.notEqual(first.props.key, second.props.key);
});

test('shared avatar keeps a username fallback for a liker without a photo', () => {
  const avatar = fixture('src/components/ui/Avatar.js', 'Avatar', { user: { username: 'Milan' } }, {
    ...native, theme, StyleSheet: styles, usePhotoSource: () => ({ mediaKey: 'session', getPhotoSource: () => null }),
  });
  const tree = avatar.render();
  assert.equal(nodes(tree, 'Image').length, 0);
  assert.deepEqual(Array.from(nodes(tree, 'Text')[0].children), ['M']);
});
