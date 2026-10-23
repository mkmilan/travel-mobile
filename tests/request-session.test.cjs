const test=require('node:test');
const assert=require('node:assert/strict');
const {load}=require('./helpers/component-fixture.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(setImmediate);
const response=(status=200)=>({status,ok:status<400,headers:{get:()=> 'application/json'},json:async()=>status===401?{message:'Expired'}:{ok:true}});
function apiFixture({csrf=async()=> 'fixture-csrf',photo=async()=>({fixture:'form'}),reply=async()=>response(),read}={}) {
  let state={user:{_id:'fixture-a'},token:'fixture-token-a'};let token=state.token,user=JSON.stringify({...state.user,token});
  const listeners=new Set(),requests=[];let storeReads=0,logoutCount=0;
  state.logout=async()=>logoutCount++;
  const store={getState:()=>{storeReads++;return state;},subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);}};
  const setSession=(next,{persist=true}={})=>{const previous=state;state={...next,logout:async()=>logoutCount++};if(persist){token=next.token;user=next.user?JSON.stringify({...next.user,token}):null;}for(const listener of listeners)listener(state,previous);};
  const api=load('src/services/api.js','({apiFetch,uploadProfilePhoto,uploadTripPhoto,uploadRecommendationPhoto})',{
    Constants:{expoConfig:{extra:{API_URL:'https://fixture.invalid/api',APP_ENV:'test'}}},Updates:{},console:{log(){},warn(){},error(){}},
    require:()=>({useAuthStore:store}),SecureStore:{getItemAsync:key=>read?read(key,()=>key==='auth-token'?token:user):Promise.resolve(key==='auth-token'?token:user)},
    getCsrfToken:csrf,createPhotoFormData:photo,fetch:async(url,options)=>{requests.push({url,options});return reply();},
  });
  return {api,requests,setSession,state:()=>state,storeReads:()=>storeReads,logoutCount:()=>logoutCount,
    setPersisted:(nextToken,nextUser)=>{token=nextToken;user=nextUser;}};
}
const operations=[
  api=>api.apiFetch('/trips/fixture/comments',{method:'POST',csrf:true,body:'{"text":"fixture"}'}),
  api=>api.uploadProfilePhoto('file://fixture'),
  api=>api.uploadTripPhoto('fixture-trip','file://fixture'),
  api=>api.uploadRecommendationPhoto('fixture-rec','file://fixture'),
];
const accountB={user:{_id:'fixture-b'},token:'fixture-token-b'};

test('JSON and multipart writes capture session before delayed CSRF and never dispatch as a newer account',async()=>{
  for(const operation of operations)for(const next of [accountB,{user:null,token:null}]) {
    const csrf=deferred();const f=apiFixture({csrf:()=>csrf.promise});const request=operation(f.api);f.setSession(next);csrf.resolve('fixture-csrf');
    await assert.rejects(request,/Account changed/);assert.equal(f.requests.length,0);
  }
});

test('logout/login cycles with the same identity are rejected by the captured session epoch',async()=>{
  for(const operation of operations) {
    const csrf=deferred();const f=apiFixture({csrf:()=>csrf.promise});const original=f.state();const request=operation(f.api);
    f.setSession({user:null,token:null});f.setSession(original);csrf.resolve('fixture-csrf');
    await assert.rejects(request,/Account changed/);assert.equal(f.requests.length,0);
  }
});

test('multipart preparation and persisted-login transitions are checked immediately before dispatch',async()=>{
  for(const operation of operations.slice(1)) {
    const file=deferred();const f=apiFixture({photo:()=>file.promise});const request=operation(f.api);await tick();f.setSession(accountB);file.resolve({fixture:'form'});
    await assert.rejects(request,/Account changed/);assert.equal(f.requests.length,0);
  }
  const f=apiFixture();f.setPersisted('fixture-token-b',JSON.stringify({...accountB.user,token:accountB.token}));
  await assert.rejects(operations[0](f.api),/Account changed/);assert.equal(f.requests.length,0);
});

test('auth changes during SecureStore awaits cannot pass the final live-session check',async()=>{
  const storage=deferred();const f=apiFixture({read:(key,current)=>storage.promise.then(current)});
  const request=operations[0](f.api);await tick();f.setSession(accountB);storage.resolve();
  await assert.rejects(request,/Account changed/);assert.equal(f.requests.length,0);
});

test('same-session requests retain CSRF, captured Bearer and custom headers; profile metadata change is not a new login',async()=>{
  const csrf=deferred();const f=apiFixture({csrf:()=>csrf.promise});
  const work=f.api.apiFetch('/users/me',{method:'PUT',csrf:true,headers:{'X-Fixture':'yes',Authorization:'Bearer ignored'},body:'{}'});
  f.setSession({...f.state(),user:{...f.state().user,username:'renamed'}});csrf.resolve('fixture-csrf');await work;
  const request=f.requests[0];assert.equal(request.options.headers.Authorization,'Bearer fixture-token-a');assert.equal(request.options.headers['X-CSRF-Token'],'fixture-csrf');
  assert.equal(request.options.headers['X-Fixture'],'yes');assert.equal(request.options.headers['Content-Type'],'application/json');assert.equal(request.options.credentials,'include');
  for(const operation of operations.slice(1))await operation(f.api);
  for(const {options} of f.requests.slice(1)){assert.equal(options.headers.Authorization,'Bearer fixture-token-a');assert.equal(options.headers['X-CSRF-Token'],'fixture-csrf');assert.equal(options.headers['Content-Type'],undefined);}
});

test('public login requests remain independent of auth snapshots and owner-constrained uploads still reject mismatches',async()=>{
  const f=apiFixture();await f.api.apiFetch('/auth/login',{method:'POST',auth:false,csrf:true,body:'{}'});
  assert.equal(f.storeReads(),0);assert.equal(f.requests[0].options.headers.Authorization,undefined);
  await assert.rejects(f.api.apiFetch('/v2/trips/json',{method:'POST',csrf:true,expectedUserId:'fixture-b'}),/Account changed/);assert.equal(f.requests.length,1);
  await f.api.apiFetch('/v2/trips/json',{method:'POST',csrf:true,expectedUserId:'fixture-a'});assert.equal(f.requests.length,2);
});

test('a dispatched old request cannot log out a later same-token login when its 401 arrives',async()=>{
  const reply=deferred();const f=apiFixture({reply:()=>reply.promise});const request=f.api.apiFetch('/trips');await tick();const original=f.state();
  f.setSession({user:null,token:null});f.setSession(original);reply.resolve(response(401));
  await assert.rejects(request,/Expired/);assert.equal(f.logoutCount(),0);assert.equal(f.requests.length,1);
});
