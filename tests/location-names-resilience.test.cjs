const test = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('./helpers/component-fixture.cjs');
const {sqliteFixture} = require('./helpers/sqlite-fixture.cjs');
const deferred = () => {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick = () => new Promise(setImmediate);
function naming(reverseGeocode) {
  let deadline;
  const get=load('src/services/locationNames.js','getTripLocationNames',{
    reverseGeocode,setTimeout:(fn,ms)=>{assert.equal(ms,5000);deadline=fn;return 1;},clearTimeout:()=>{},
  });
  return {get,expire:()=>deadline()};
}
const start={lat:10,lon:20},end={lat:30,lon:40};

test('deadline retains either successful endpoint and returned names cannot change later',async()=>{
  for (const slowLat of [10,30]) {
    const slow=deferred(),n=naming(lat=>lat===slowLat?slow.promise:Promise.resolve('Ready'));
    const work=n.get({start,end});await tick();n.expire();const names=await work;
    assert.equal(names.startName,slowLat===10?null:'Ready');assert.equal(names.endName,slowLat===30?null:'Ready');
    const snapshot=JSON.stringify(names);slow.resolve('Late');await tick();assert.equal(JSON.stringify(names),snapshot);
  }
});

test('null, placeholder and rejected lookups are not cached; later lookup can succeed',async()=>{
  for(const failure of [null,'Unknown ',new Error('offline')]) {
    let calls=0;
    const n=naming(async()=>{calls++;if(calls===1){if(failure instanceof Error)throw failure;return failure;}return 'Recovered';});
    assert.equal((await n.get({start})).startName,null);
    assert.equal((await n.get({start})).startName,'Recovered');
    assert.equal((await n.get({start})).startName,'Recovered');assert.equal(calls,2);
  }
});

test('identical endpoints and overlapping callers share one in-flight lookup',async()=>{
  let calls=0;const pending=deferred(),n=naming(()=>{calls++;return pending.promise;});
  const a=n.get({start,end:start}),b=n.get({start});await tick();assert.equal(calls,1);
  pending.resolve('Shared');assert.equal((await a).endName,'Shared');assert.equal((await b).startName,'Shared');
  await n.get({start});assert.equal(calls,1);
});

test('reverse geocoding returns null for HTTP/missing address failures and bounds an uncooperative fetch',async()=>{
  for(const response of [{ok:false},{ok:true,json:async()=>({})},{ok:true,json:async()=>({address:{}})}]) {
    const reverse=load('src/utils/geo.js','reverseGeocode',{fetch:async()=>response,AbortController,setTimeout,clearTimeout});
    assert.equal(await reverse(10,20),null);
  }
  let deadline,signal;
  const reverse=load('src/utils/geo.js','reverseGeocode',{
    fetch:(_url,options)=>{signal=options.signal;return new Promise(()=>{});},AbortController,
    setTimeout:(fn,ms)=>{assert.equal(ms,5000);deadline=fn;return 1;},clearTimeout:()=>{},
  });
  const work=reverse(10,20);deadline();assert.equal(await work,null);assert.equal(signal.aborted,true);
});

test('persisted endpoint reads are owner-scoped, deterministic and bounded to two rows',async()=>{
  const h=await sqliteFixture();try {
    const id=await h.dao.startTrip('owner');
    for(const [lat,stamp] of [[3,'2026-01-03'],[1,'2026-01-01'],[4,'2026-01-03'],[2,'2026-01-02']]) {
      await h.db.runAsync('INSERT INTO track_points (trip_id,lat,lon,timestamp) VALUES (?,?,?,?)',[id,lat,lat,stamp]);
    }
    const queries=[];
    const get=load('src/db/tripDao.js','getTripEndpoints',{openDatabase:async()=>({...h.db,getAllAsync:async(sql,params)=>{queries.push(sql);return h.db.getAllAsync(sql,params);}})});
    const points=await get(id,'owner');assert.equal(points.start.lat,1);assert.equal(points.end.lat,4);
    const pointQueries=queries.filter(sql=>sql.includes('track_points'));assert.equal(pointQueries.length,2);
    for(const sql of pointQueries){assert.match(sql,/LIMIT 1/);assert.match(sql,/t.user_id = \?/);}
    await assert.rejects(get(id,'someone-else'));
    const empty=await h.dao.startTrip('owner');assert.equal(JSON.stringify(await get(empty,'owner')),JSON.stringify({start:null,end:null}));
  }finally{h.close();}
});
