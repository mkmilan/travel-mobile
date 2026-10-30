const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Execute the real dependency-free DAO bodies against a fixture DB. Native
// Expo modules are injected, not installed or started by these unit tests.
function load(file, names, dependencies = {}) {
  let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({ console, ...dependencies });
  return vm.runInContext(source + '\n;({' + names.join(',') + '});', context);
}
function fixture() {
  const queries = [];
  const db = {
    getAllAsync: async (sql, params) => {
      queries.push({sql, params});
      if (sql.includes('AND user_id = ?')) {
        return params[0] === 'trip-a' && params[1] === 'alice'
          ? [{id:'trip-a', user_id:'alice', start_time:'2026-01-01T00:00:00Z',status:'stopped',end_time:'2026-01-01T01:00:00Z',default_trip_visibility:'public',default_transport_mode:'car'}] : [];
      }
      if (sql.includes('WHERE t.user_id = ?')) return [{id:`trip-${params[0]}`}];
      return [];
    },
    runAsync: async (sql, params) => queries.push({sql, params})
  };
  const dao = load('src/db/tripDao.js', ['getPendingTrips','buildTripJsonForUpload','deleteTrip','markTripUploaded','startTrip','ownsLocalTrip'], {...load('src/utils/tripMetadata.js',['validateTripMetadata']),getActiveTrip:async()=>({}),openDatabase: async()=>db, uuid:{v4:()=> 'new-id'}});
  return {dao, queries};
}
test('signed-out pending list does not read the database', async()=> {
  const {dao,queries}=fixture(); assert.equal((await dao.getPendingTrips()).length,0); assert.equal(queries.length,0);
});
test('pending list is scoped to the current account', async()=> {
  const {dao,queries}=fixture(); await dao.getPendingTrips('alice');
  assert.match(queries[0].sql,/WHERE t.user_id = \?/); assert.equal(queries[0].params[0],'alice');
});
test('foreign or unowned trips cannot be packaged or deleted', async()=> {
  const {dao,queries}=fixture();
  await assert.rejects(dao.buildTripJsonForUpload('trip-a',{},'bob'),/not found/);
  await assert.rejects(dao.deleteTrip('trip-a','bob'),/not found/);
  assert.equal(queries.some(q=>q.sql.startsWith('DELETE')),false);
  await assert.rejects(dao.buildTripJsonForUpload('trip-a'),/Sign in/);
});
test('owner can package a trip; ownership is checked before reading location data', async()=> {
  const {dao,queries}=fixture(); const result=await dao.buildTripJsonForUpload('trip-a',{},'alice');
  assert.match(queries[0].sql,/AND user_id = \?/); assert.equal(result.title,'Trip on 2026-01-01');
});
test('upload marker is owner-scoped and anonymous recording is rejected', async()=> {
  const {dao,queries}=fixture(); await dao.markTripUploaded('trip-a','alice');
  const update=queries.find(q=>q.sql.startsWith('UPDATE'));assert.match(update.sql,/AND user_id = \?/); assert.equal(update.params[1],'alice');
  await assert.rejects(dao.startTrip(),/Sign in/);
});
test('logout disables the marker before native stop and retains failed cleanup for retry', async()=> {
  const {recordingFixture}=require('./helpers/recording-fixture.cjs');
  let marker={tripId:'trip',segmentId:'segment',userId:'owner'},running=true,fail=true;
  const markers=recordingFixture(()=>marker,value=>{marker=value;});
  const {stopActiveRecording}=load('src/utils/stopActiveRecording.js',['stopActiveRecording'], {
    ...markers,
    Location:{hasStartedLocationUpdatesAsync:async()=>running,stopLocationUpdatesAsync:async()=>{
      assert.equal(marker.tripId,undefined);assert.ok(marker.cleanupId);
      if(fail)throw Error('Native failure');running=false;
    }}
  });
  await assert.rejects(stopActiveRecording(),/Native failure/);assert.ok(marker.cleanupId);
  fail=false;await stopActiveRecording();assert.equal(running,false);assert.deepEqual(marker,{});
});
test('logout with no registered tracking task does not attempt to stop it', async()=> {
  const {recordingFixture}=require('./helpers/recording-fixture.cjs');
  let stopped=false,marker={};
  const {stopActiveRecording}=load('src/utils/stopActiveRecording.js',['stopActiveRecording'], {
    ...recordingFixture(()=>marker,value=>{marker=value;}), Location:{hasStartedLocationUpdatesAsync:async()=>false,stopLocationUpdatesAsync:async()=>{stopped=true;}}
  });
  await stopActiveRecording(); assert.equal(stopped,false);assert.deepEqual(marker,{});
});
test('active marker requires and persists an owner', async()=> {
  let stored;
  const {setActiveTrip}=load('src/utils/activeTrip.js',['setActiveTrip'],{SecureStore:{getItemAsync:async()=>null,setItemAsync:async(k,v)=>{stored=JSON.parse(v);}}});
  await assert.rejects(setActiveTrip('trip-a','segment'),/Sign in/);
  await setActiveTrip('trip-a','segment','alice'); assert.equal(stored.userId,'alice');
});
test('nonproduction EAS profiles cannot silently use production API',()=> {
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../eas.json'),'utf8'));
  for(const name of ['development','preview','testing']) {
    assert.equal(config.build[name].env.APP_ENV,'development'); assert.equal(config.build[name].env.API_URL,undefined);
  }
});
test('upload rejects account switch without making an API request', async()=> {
  let fetched=false;
  const {apiFetch}=load('src/services/api.js',['apiFetch'],{
    Constants:{expoConfig:{extra:{API_URL:'http://fixture.invalid/api',APP_ENV:'test'}}}, Updates:{},
    SecureStore:{getItemAsync:async key=>key==='auth-token'?'bob-token':JSON.stringify({_id:'bob',token:'bob-token'})},
    require:()=>({useAuthStore:{getState:()=>({user:{_id:'bob'},token:'bob-token'})}}),
    fetch:async()=>{fetched=true;},getCsrfToken:async()=> 'fixture'
  });
  await assert.rejects(apiFetch('/v2/trips/json',{expectedUserId:'alice'}),/Account changed/);
  assert.equal(fetched,false);
});
test('background delivery for a different account never writes points',async()=> {
  let callback; let inserted=false;
  load('src/background/TripLocationTask.js',[],{
    TaskManager:{defineTask:(name,fn)=>{callback=fn;}},
    getActiveTrip:async()=>({tripId:'trip-a',segmentId:'segment',userId:'alice'}),
    SecureStore:{getItemAsync:async()=>JSON.stringify({_id:'bob'})},
    insertTrackPoint:async()=>{inserted=true;}
  });
  await callback({data:{locations:[{coords:{latitude:1,longitude:2},timestamp:0}]}});
  assert.equal(inserted,false);
});
test('native photo sources use headers, not token URLs, and isolate cache identity',()=> {
  const {createPhotoSource}=load('src/utils/photoSource.js',['createPhotoSource']);
  const id='0123456789abcdef01234567';
  const a=createPhotoSource(id,'https://fixture.invalid/api','fixture-token','session-a');
  const b=createPhotoSource(id,'https://fixture.invalid/api','other-token','session-b');
  assert.equal(a.headers.Authorization,'Bearer fixture-token');
  assert.equal(a.uri.includes('fixture-token'),false);
  assert.notEqual(a.uri,b.uri); assert.equal(a.cache,'reload');
  assert.equal(createPhotoSource('file:///fixture.jpg','https://fixture.invalid/api','fixture-token','s').headers,undefined);
  assert.equal(createPhotoSource('https://other.invalid/image','https://fixture.invalid/api','fixture-token','s'),undefined);
});
test('all native shared media components use the authenticated source hook',()=> {
  for (const file of ['src/components/ProfileGallery.js','src/components/trip/PhotoGallery.js','src/components/ui/TripPhotoThumb.js','src/components/ui/Avatar.js']) {
    const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    assert.match(source,/usePhotoSource/); assert.doesNotMatch(source,/buildPhotoUrl\(/);
  }
});

test('late 401 from an old token cannot log out a newer account',async()=> {
  let token='alice-token'; let loggedOut=false;
  const {apiFetch}=load('src/services/api.js',['apiFetch'],{
    Constants:{expoConfig:{extra:{API_URL:'http://fixture.invalid/api',APP_ENV:'test'}}}, Updates:{},
    SecureStore:{getItemAsync:async key=>key==='auth-token'?token:JSON.stringify({_id:token.split('-')[0],token})},
    require:()=>({useAuthStore:{getState:()=>({user:{_id:token.split('-')[0]},token,logout:async()=>{loggedOut=true;}})}}),
    fetch:async()=>{token='bob-token';return {status:401,ok:false,headers:{get:()=> 'application/json'},json:async()=>({message:'Expired'})};}
  });
  await assert.rejects(apiFetch('/trips'),/Expired/); assert.equal(loggedOut,false);
});
test('401 for the current authenticated session still logs out',async()=> {
  let loggedOut=false;
  const {apiFetch}=load('src/services/api.js',['apiFetch'],{
    Constants:{expoConfig:{extra:{API_URL:'http://fixture.invalid/api',APP_ENV:'test'}}}, Updates:{},
    SecureStore:{getItemAsync:async key=>key==='auth-token'?'alice-token':JSON.stringify({_id:'alice',token:'alice-token'})},
    require:()=>({useAuthStore:{getState:()=>({user:{_id:'alice'},token:'alice-token',logout:async()=>{loggedOut=true;}})}}),
    fetch:async()=>({status:401,ok:false,headers:{get:()=> 'application/json'},json:async()=>({message:'Expired'})})
  });
  await assert.rejects(apiFetch('/trips'),/Expired/); assert.equal(loggedOut,true);
});
test('public request 401 never clears a signed-in account',async()=> {
  let accessedStore=false;
  const {apiFetch}=load('src/services/api.js',['apiFetch'],{
    Constants:{expoConfig:{extra:{API_URL:'http://fixture.invalid/api',APP_ENV:'test'}}}, Updates:{},
    require:()=>{accessedStore=true;},
    fetch:async()=>({status:401,ok:false,headers:{get:()=> 'text/plain'},text:async()=> 'Unauthorized'})
  });
  await assert.rejects(apiFetch('/auth/login',{auth:false}),/Unauthorized/); assert.equal(accessedStore,false);
});
test('background batch stops writing after recording marker is cleared',async()=> {
  let callback; let count=0; let active={tripId:'trip-a',segmentId:'segment',userId:'alice'};
  load('src/background/TripLocationTask.js',[],{
    TaskManager:{defineTask:(name,fn)=>{callback=fn;}},getActiveTrip:async()=>active,
    SecureStore:{getItemAsync:async()=>JSON.stringify({_id:'alice'})},
    insertTrackPoint:async()=>{count++; active={};}
  });
  const point={coords:{latitude:1,longitude:2},timestamp:0};
  await callback({data:{locations:[point,point]}}); assert.equal(count,1);
});
test('corrupt stored user cannot cause a background GPS write',async()=> {
  let callback; let count=0;
  load('src/background/TripLocationTask.js',[],{
    TaskManager:{defineTask:(name,fn)=>{callback=fn;}},
    getActiveTrip:async()=>({tripId:'trip-a',segmentId:'segment',userId:'alice'}),
    SecureStore:{getItemAsync:async()=> '{bad'}, insertTrackPoint:async()=>{count++;}
  });
  await callback({data:{locations:[{coords:{latitude:1,longitude:2},timestamp:0}]}}); assert.equal(count,0);
});
