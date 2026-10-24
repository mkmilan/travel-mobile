const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, nodes, native, theme } = require('./helpers/component-fixture.cjs');
const { hooksFixture, authFixture } = require('./helpers/hooks-fixture.cjs');
const { create } = require('zustand');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tripId = '1234567890abcdef12345678';
const laterId = 'abcdef1234567890abcdef12';
const receipt = { tripId, deleted: true, cleanupPending: false };

function cleanupFixture({ reconcileWait } = {}) {
  const auth = authFixture(), host = hooksFixture(), pending = deferred();
  const alerts = [], deletes = [], reconciles = [], settles = [], writes = [];
  let rows = [{ trip_id: tripId }, { trip_id: laterId }];
  const store = load('src/stores/tripSocialStore.js', 'useTripSocialStore', { create, useAuthStore: auth.store });
  const social = Object.assign(select => select ? select(store.getState()) : store.getState(), { getState: store.getState });
  const screen = fixture('src/components/PendingTripDeletions.js', 'PendingTripDeletions', {}, {
    ...native, ...host.hooks, ENABLE_SAFE_TRIP_DELETE: true, useAuthStore: auth.store, useTripSocialStore: social,
    useState(initial) { const [state, set] = host.hooks.useState(initial); return [state, value => { writes.push(value); set(value); }]; },
    Alert: { alert: (...args) => alerts.push(args) },
    getPendingTripDeletions: async owner => { assert.equal(owner, 'actor'); return rows; },
    getPendingTripDeletionsApi: async () => [], rememberPendingTripDeletion: async () => {},
    deleteServerTrip: (id, owner, options) => { assert.equal(options.isCurrent(), true); deletes.push([id, owner, options]); return pending.promise; },
    reconcileDeletedServerTrip: async (id, owner) => { reconciles.push([id, owner]); if (reconcileWait) await reconcileWait.promise; },
    settlePendingTripDeletion: async (id, owner, value) => { settles.push([id, owner, value]); if (!value.cleanupPending) rows = rows.filter(row => row.trip_id !== id); },
  });
  const render = () => host.render(() => screen.render());
  return { auth, host, social, pending, deletes, reconciles, settles, writes, render, rows: () => rows,
    async start() {
      render(); await tick();
      assert.equal(deletes.length, 0, 'discovery must not automatically delete');
      nodes(render(), 'Pressable')[0].props.onPress();
      assert.equal(deletes.length, 0, 'opening confirmation must not delete');
      return { work: alerts.at(-1)[2].find(button => button.style === 'destructive').onPress() };
    },
  };
}

test('actual cleanup banner late receipt refreshes the loaded Feed after tab switch, without dispatching the next row', async () => {
  const f = cleanupFixture(), feedHost = hooksFixture(); let feedCalls = 0;
  const useProfileContext = load('src/hooks/useProfileContext.js', 'useProfileContext', { ...feedHost.hooks, useAuthStore: f.auth.store });
  const useProfileList = load('src/hooks/useProfileList.js', 'useProfileList', {
    ...feedHost.hooks, useProfileContext, createPagedList: load('src/utils/pagedList.js', 'createPagedList'), useTripSocialStore: f.social,
  });
  const feed = fixture('app/(tabs)/feed/index.js', 'FeedScreen', {}, {
    ...native, ...feedHost.hooks, theme, StyleSheet: { create: x => x }, useAuthStore: f.auth.store, useTripSocialStore: f.social, useProfileList,
    useRouter: () => ({ push() {} }), subscribeFollowChanges() {}, getFollowRevision: () => 0,
    RefreshControl: 'RefreshControl', ProfileListStatus: 'ProfileListStatus', TripCardContainer: 'TripCardContainer',
    CommentsSheet: 'CommentsSheet', LikersSheet: 'LikersSheet', RecommendationsSheet: 'RecommendationsSheet',
    getFeedTripJson: async () => { feedCalls++; return { items: f.social.getState().deletionRevision ? [] : [{ _id: tripId }] }; },
  });
  const renderFeed = () => feedHost.render(() => feed.render());
  renderFeed(); await tick(); assert.equal(nodes(renderFeed(), 'FlatList')[0].props.data.length, 1);
  feedHost.blur();
  const { work } = await f.start();
  f.host.blur(); feedHost.focus();
  const writeCount = f.writes.length;
  f.pending.resolve(receipt); await work;
  assert.equal(f.social.getState().deletionRevision, 1);
  assert.deepEqual(f.reconciles, [[tripId, 'actor']]);
  assert.deepEqual(f.settles, [[tripId, 'actor', receipt]]);
  assert.equal(f.deletes.length, 1); assert.equal(f.deletes[0][2].isCurrent(), false);
  assert.deepEqual(f.rows(), [{ trip_id: laterId }]);
  assert.equal(f.writes.length, writeCount, 'no late UI writes after blur');
  assert.equal(f.render(), null);
  assert.equal(nodes(renderFeed(), 'FlatList')[0].props.data.length, 0, 'stale feed removed immediately');
  await tick(); assert.equal(nodes(renderFeed(), 'FlatList')[0].props.data.length, 0); assert.equal(feedCalls, 2);
});

for (const [transition, change] of [
  ['other account', state => ({ ...state, user: { _id: 'other' }, token: 'other-token' })],
  ['logout', state => ({ ...state, user: null, token: null })],
  ['reauthentication in progress', state => ({ ...state, isSessionChanging: true })],
  ['same owner and token, new session epoch', state => ({ ...state, sessionEpoch: state.sessionEpoch + 1 })],
  ['same owner, new token', state => ({ ...state, token: 'new-token' })],
]) {
  test(`cleanup receipt cannot mutate caches or owner rows after ${transition}`, async () => {
    const f = cleanupFixture(); const { work } = await f.start();
    f.host.blur(); f.auth.set(change(f.auth.store.getState())); const writeCount = f.writes.length;
    f.pending.resolve(receipt); await work;
    assert.equal(f.social.getState().deletionRevision, 0);
    assert.deepEqual(f.reconciles, []); assert.deepEqual(f.settles, []);
    assert.equal(f.deletes.length, 1); assert.equal(f.rows().length, 2);
    assert.equal(f.writes.length, writeCount);
  });
}

test('cleanup cannot settle an old-session receipt if reauthentication begins while reconciliation is pending', async () => {
  const reconcileWait = deferred(), f = cleanupFixture({ reconcileWait });
  const { work } = await f.start(); f.pending.resolve(receipt); await tick();
  assert.deepEqual(f.reconciles, [[tripId, 'actor']]);
  f.auth.set({ ...f.auth.store.getState(), sessionEpoch: 1 });
  reconcileWait.resolve(); await work;
  assert.deepEqual(f.settles, []); assert.equal(f.deletes.length, 1);
});
