const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/component-fixture.cjs');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const page = (ids, hasMore = false) => ({ results: ids.map(_id => ({ _id })), hasMore });
const ids = list => Array.from(list.getSnapshot().items, item => item._id);
function setup(loader, enabled = true) {
  let current = true, now = 0, nextId = 0;
  const timers = new Map(), calls = [];
  const { createSearchList } = load('src/utils/searchList.js', '({createSearchList})', {
    setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, time: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const list = createSearchList({ loadPage: number => { calls.push(number); return loader(number); }, enabled, isCurrent: () => current });
  return { list, calls, timers, expire: () => { current = false; },
    async advance(ms) { now += ms; for (const [id, timer] of timers) if (timer.time <= now) { timers.delete(id); timer.callback(); } await tick(); },
  };
}

test('400ms debounce has no early request or false empty; Search submits once immediately', async () => {
  const f = setup(() => page(['one']));
  f.list.activate();
  assert.equal(f.list.getSnapshot().loaded, false); assert.equal(f.list.getSnapshot().loading, true);
  await f.advance(399); assert.deepEqual(f.calls, []);
  const first = f.list.submit(), second = f.list.submit(); assert.equal(first, second);
  await first; await f.advance(1);
  assert.deepEqual(f.calls, [1]); assert.deepEqual(ids(f.list), ['one']);
  assert.equal(f.list.getSnapshot().loading, false); assert.equal(f.timers.size, 0);
  await f.list.submit(); assert.deepEqual(f.calls, [1]);
});

test('blank/short queries never fetch from debounce, submit, refresh, retry or scroll', async () => {
  const f = setup(() => { throw Error('must not fetch'); }, false);
  f.list.activate(); await f.advance(1000);
  await f.list.submit(); await f.list.refresh(); await f.list.retry(); await f.list.loadMore();
  assert.deepEqual(f.calls, []); assert.deepEqual(ids(f.list), []);
  assert.equal(f.list.getSnapshot().loaded, true); assert.equal(f.list.getSnapshot().loading, false);
});

test('debounce cleanup prevents requests after navigation/unmount and new focus restarts cleanly', async () => {
  const f = setup(() => page(['one']));
  f.list.activate(); await f.advance(200); f.list.deactivate(); await f.advance(1000);
  assert.deepEqual(f.calls, []); assert.equal(f.timers.size, 0);
  f.list.activate(); await f.advance(399); assert.deepEqual(f.calls, []); await f.advance(1);
  assert.deepEqual(f.calls, [1]); assert.deepEqual(ids(f.list), ['one']);
});

test('rapid repeated activate/deactivate mirrors Strict Mode without double querying', async () => {
  const f = setup(() => page(['one']));
  f.list.activate(); f.list.deactivate(); f.list.activate(); await f.advance(400);
  assert.deepEqual(f.calls, [1]); assert.deepEqual(ids(f.list), ['one']);
});

test('single-flight pagination merges duplicate IDs, trusts server exhaustion and preserves refresh identity', async () => {
  const pending = deferred();
  const f = setup(number => number === 1 ? page(['one'], true) : pending.promise);
  f.list.activate(); await f.advance(400);
  const refreshIdentity = f.list.getSnapshot().refreshIdentity;
  const first = f.list.loadMore(), second = f.list.loadMore(); assert.equal(first, second);
  await tick(); assert.deepEqual(f.calls, [1, 2]);
  pending.resolve({ results: [{ _id: 'one', name: 'updated' }, { _id: 'two' }, { _id: 'two' }], hasMore: false }); await first;
  assert.deepEqual(ids(f.list), ['one', 'two']); assert.equal(f.list.getSnapshot().items[0].name, 'updated');
  assert.equal(f.list.getSnapshot().refreshIdentity, refreshIdentity);
  await f.list.loadMore(); assert.deepEqual(f.calls, [1, 2]);
});

test('failed page retries that same page without losing previous cards; no automatic retry loop', async () => {
  let fail = true;
  const f = setup(number => { if (number === 2 && fail) throw Error('offline'); return page([String(number)], number < 3); });
  f.list.activate(); await f.advance(400); await f.list.loadMore();
  assert.deepEqual(ids(f.list), ['1']); assert.equal(f.list.getSnapshot().error, 'offline');
  await f.list.loadMore(); assert.deepEqual(f.calls, [1, 2]);
  fail = false; await f.list.retry(); assert.deepEqual(f.calls, [1, 2, 2]); assert.deepEqual(ids(f.list), ['1', '2']);
  await f.list.loadMore(); assert.deepEqual(ids(f.list), ['1', '2', '3']); assert.equal(f.list.getSnapshot().hasMore, false);
});

test('synchronous initial failure and invalid envelope recover through explicit retry', async () => {
  for (const result of [null, { results: [], hasMore: 'yes' }, { results: {} }, Error('offline')]) {
    let invalid = true;
    const f = setup(() => { if (invalid && result instanceof Error) throw result; return invalid ? result : page(['ok']); });
    f.list.activate(); await f.advance(400);
    assert.ok(f.list.getSnapshot().error); assert.equal(f.list.getSnapshot().loaded, true); assert.equal(f.list.getSnapshot().loading, false);
    await f.list.loadMore(); assert.deepEqual(f.calls, [1]);
    invalid = false; await f.list.retry(); assert.deepEqual(ids(f.list), ['ok']); assert.equal(f.list.getSnapshot().error, null);
  }
});

test('pending responses and errors are rejected after scope replacement or deactivation', async () => {
  for (const rejection of [false, true]) for (const deactivate of [false, true]) {
    const pending = deferred(); const f = setup(() => pending.promise);
    f.list.activate(); await f.advance(400);
    if (deactivate) f.list.deactivate(); else f.expire();
    const before = f.list.getSnapshot();
    if (rejection) pending.reject(Error('old')); else pending.resolve(page(['private-old']));
    await tick(); assert.equal(f.list.getSnapshot(), before); assert.deepEqual(ids(f.list), []);
  }
});

test('refocus revalidates all loaded pages atomically without resetting pagination', async () => {
  let returning = false; const nextSecondPage = deferred();
  const f = setup(number => returning && number === 2 ? nextSecondPage.promise : page([`${returning ? 'fresh' : 'old'}-${number}`], number < 3));
  f.list.activate(); await f.advance(400); await f.list.loadMore();
  const before = f.list.getSnapshot().refreshIdentity;
  f.list.deactivate(); returning = true; f.list.activate(); await tick();
  assert.deepEqual(f.calls, [1, 2, 1, 2]); assert.deepEqual(ids(f.list), ['old-1', 'old-2']);
  nextSecondPage.resolve(page(['fresh-2'], true)); await tick();
  assert.deepEqual(ids(f.list), ['fresh-1', 'fresh-2']); assert.notEqual(f.list.getSnapshot().refreshIdentity, before);
  await f.list.loadMore(); assert.deepEqual(f.calls, [1, 2, 1, 2, 3]); assert.deepEqual(ids(f.list), ['fresh-1', 'fresh-2', 'fresh-3']);
});

test('a shortened search after return removes outdated pages and keeps server exhaustion', async () => {
  let returning = false;
  const f = setup(number => returning ? page([]) : page([String(number)], number < 3));
  f.list.activate(); await f.advance(400); await f.list.loadMore();
  f.list.deactivate(); returning = true; f.list.activate(); await tick();
  assert.deepEqual(f.calls, [1, 2, 1]); assert.deepEqual(ids(f.list), []); assert.equal(f.list.getSnapshot().hasMore, false);
  await f.list.loadMore(); assert.deepEqual(f.calls, [1, 2, 1]);
});

test('late completion after blur cannot clear the newer focus request lock or loading state', async () => {
  const old = deferred(), fresh = deferred(); let calls = 0;
  const f = setup(() => ++calls === 1 ? old.promise : fresh.promise);
  f.list.activate(); await f.advance(400); f.list.deactivate(); f.list.activate(); await f.advance(400);
  old.resolve(page(['old'])); await tick(); assert.equal(f.list.getSnapshot().loading, true); assert.deepEqual(ids(f.list), []);
  const retry = f.list.submit(); assert.deepEqual(f.calls, [1, 1]);
  fresh.resolve(page(['fresh'])); await retry; assert.deepEqual(ids(f.list), ['fresh']); assert.equal(f.list.getSnapshot().loading, false);
});

test('old failed return does not partially replace cards, and retry revalidates the entire loaded range', async () => {
  let returning = false, fail = false;
  const f = setup(number => { if (number === 2 && fail) throw Error('offline'); return page([`${returning ? 'fresh' : 'old'}-${number}`], number < 3); });
  f.list.activate(); await f.advance(400); await f.list.loadMore();
  returning = true; fail = true; f.list.deactivate(); f.list.activate(); await tick();
  assert.deepEqual(ids(f.list), ['old-1', 'old-2']); assert.equal(f.list.getSnapshot().error, 'offline');
  fail = false; await f.list.retry(); assert.deepEqual(f.calls, [1, 2, 1, 2, 1, 2]); assert.deepEqual(ids(f.list), ['fresh-1', 'fresh-2']);
});

test('pull refresh while pagination is pending coalesces and revalidates the loaded range after it settles', async () => {
  const pending = deferred(); let returning = false;
  const f = setup(number => number === 2 && !returning ? pending.promise : page([`${returning ? 'fresh' : 'old'}-${number}`], number < 3));
  f.list.activate(); await f.advance(400);
  const pagination = f.list.loadMore(); await tick();
  const refresh = f.list.refresh(); assert.equal(refresh, f.list.refresh());
  returning = true; pending.resolve(page(['old-2'], true)); await pagination; await refresh;
  assert.deepEqual(f.calls, [1, 2, 1, 2]); assert.deepEqual(ids(f.list), ['fresh-1', 'fresh-2']);
});

test('queued refresh is cancelled on blur and cannot spawn another request in a newer focus', async () => {
  const pending = deferred(); let calls = 0;
  const f = setup(() => ++calls === 1 ? pending.promise : page(['fresh']));
  f.list.activate(); await f.advance(400); const refresh = f.list.refresh();
  f.list.deactivate(); f.list.activate(); await f.advance(400);
  pending.resolve(page(['old'])); await refresh; await tick();
  assert.deepEqual(f.calls, [1, 1]); assert.deepEqual(ids(f.list), ['fresh']);
});
