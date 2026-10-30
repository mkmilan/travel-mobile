const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture } = require('./helpers/component-fixture.cjs');
const identity = require('./helpers/photo-upload-identity.cjs');
const uuid = require('react-native-uuid').default;
const response = (status, data) => ({status, ok: status < 400, headers:{get:()=> 'application/json'}, json:async()=>data});
const receipt = (key, id='saved-photo') => ({photoUploadProtocol:1, photoUploadId:key, photoIds:[id]});
function apiFixture(reply) {
  let state = {user:{_id:'owner-a'}, token:'token-a', sessionEpoch:1, isSessionChanging:false};
  const requests=[];
  const api = load('src/services/api.js', '({uploadTripPhoto, uploadRecommendationPhoto, uploadProfilePhoto})', {
    ...identity, Constants:{expoConfig:{extra:{API_URL:'https://fixture.invalid/api',APP_ENV:'test'}}}, Updates:{}, console:{log(){},error(){},warn(){}},
    require:()=>({useAuthStore:{getState:()=>state}}),
    SecureStore:{getItemAsync:async key=>key==='auth-token'?state.token:JSON.stringify(state.user)},
    getCsrfToken:async()=> 'csrf', createPhotoFormData:async(field,uri)=>({field,uri}),
    fetch:async(url,options)=>{requests.push({url,options});return reply(url,options);},
  });
  return {api,requests,state:()=>state,change:()=>{state={...state,user:{_id:'owner-b'},token:'token-b',sessionEpoch:2};}};
}

test('photo keys are stable across module reload and distinctly scope owner, target, kind and URI',()=>{
  const tuple=['owner','trip','target','file:///cache/photo.jpg'];
  const key=identity.photoUploadId(...tuple);
  assert.match(key,/^[a-z0-9-]{36}$/);
  const reloaded=load('src/utils/photoUploadIdentity.js','photoUploadId',{uuid});
  assert.equal(reloaded(...tuple),key);
  for(const next of [['other','trip','target',tuple[3]],['owner','recommendation','target',tuple[3]],['owner','trip','other',tuple[3]],['owner','trip','target','file:///cache/new.jpg']]) assert.notEqual(identity.photoUploadId(...next),key);
  assert.notEqual(identity.photoUploadId('a:b','trip','c',tuple[3]),identity.photoUploadId('a','trip','b:c',tuple[3]));
  for(const bad of [null,'','https://example.invalid/photo'])assert.throws(()=>identity.photoUploadId('owner','trip','target',bad));
});

test('trip and place lost-response retries use the same key and dedicated endpoint with no legacy fallback',async()=>{
  for(const [method,kind,path] of [['uploadTripPhoto','trip','/trips/target/photos/reliable'],['uploadRecommendationPhoto','recommendation','/v2/recommendations/target/photos/reliable']]) {
    const committed=new Map();let lose=true;
    const f=apiFixture(async(url,options)=>{
      const key=options.headers['X-Photo-Upload-Id'];
      if(!committed.has(key))committed.set(key,'saved-photo');
      if(lose){lose=false;throw Error('Response lost after commit');}
      return response(200,receipt(key,committed.get(key)));
    });
    await assert.rejects(f.api[method]('target','file:///cache/a.jpg'),/Response lost/);
    const result=await f.api[method]('target','file:///cache/a.jpg');
    assert.equal(result.photoIds[0],'saved-photo');assert.equal(committed.size,1);assert.equal(f.requests.length,2);
    for(const request of f.requests){assert.ok(request.url.endsWith(path));assert.equal(request.options.headers['X-Photo-Upload-Id'],identity.photoUploadId('owner-a',kind,'target','file:///cache/a.jpg'));assert.equal(request.options.headers.Authorization,'Bearer token-a');assert.equal(request.options.headers['X-CSRF-Token'],'csrf');assert.equal(request.options.headers['Content-Type'],undefined);}
  }
});

test('old server, deleted photo and mismatched acknowledgments never switch endpoint or generate a new retry key',async()=>{
  for(const broken of [response(404,{message:'Unknown endpoint'}),response(410,{message:'Photo deleted'}),response(200,{photoIds:['legacy']}),response(200,receipt('wrong-key'))]) {
    const f=apiFixture(async()=>broken);
    await assert.rejects(f.api.uploadTripPhoto('target','file://a'));
    await assert.rejects(f.api.uploadTripPhoto('target','file://a'));
    assert.equal(f.requests.length,2);
    assert.equal(new Set(f.requests.map(r=>r.options.headers['X-Photo-Upload-Id'])).size,1);
    assert.ok(f.requests.every(r=>r.url.endsWith('/photos/reliable')));
  }
});

test('a missing or malformed receipt cannot mark a local selection uploaded',async()=>{
  for(const mutate of [v=>({...v,photoUploadProtocol:0}),v=>({...v,photoIds:[]}),v=>({...v,photoIds:['a','b']}),v=>({...v,photoIds:[null]}),v=>({...v,photoUploadId:undefined})]){
    const f=apiFixture(async(url,options)=>response(200,mutate(receipt(options.headers['X-Photo-Upload-Id']))));
    const photoContext={valid:true,userId:'owner-a',token:'token-a',isCurrent:()=>true};
    const hook=fixture('src/hooks/usePhotoManager.js','usePhotoManager',{context:'trip',id:'target',initial:['file://a']},{useProfileContext:()=>photoContext,...f.api});
    await assert.rejects(hook.render().uploadPendingPhotos('target'),/1 photo could not be uploaded/);
    assert.deepEqual(Array.from(hook.render().getPhotos()),['file://a']);
    assert.equal(hook.render().uploading,false);
  }
});

test('same URI after a replaced account uses a different key and late response cannot confirm into it',async()=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const f=apiFixture(async(url,options)=>{await pending;return response(200,receipt(options.headers['X-Photo-Upload-Id']));});
  const work=f.api.uploadTripPhoto('target','file://a');
  await new Promise(setImmediate);f.change();release();
  await assert.rejects(work,/Account changed/);
  await f.api.uploadTripPhoto('target','file://a');
  assert.notEqual(f.requests[0].options.headers['X-Photo-Upload-Id'],f.requests[1].options.headers['X-Photo-Upload-Id']);
});

test('reselecting same original basename stores different immutable JPEG files and keys',async()=>{
  const copied=[];let seq=0;
  const copy=load('src/utils/imageHelpers.js','copyAndResizeAsync',{
    uuid:{v4:()=>`selection-${++seq}`},
    FileSystem:{cacheDirectory:'file:///cache/',copyAsync:async value=>copied.push(value)},
    ImageManipulator:{SaveFormat:{JPEG:'jpeg'},manipulateAsync:async uri=>({uri:`${uri}.resized`})},
  });
  const first=await copy('file:///gallery-a/IMG.jpg'),second=await copy('file:///gallery-b/IMG.jpg');
  assert.notEqual(first,second);assert.ok(first.endsWith('.jpg')&&second.endsWith('.jpg'));
  assert.equal(copied[0].to,first);assert.equal(copied[1].to,second);
  assert.notEqual(identity.photoUploadId('owner','trip','target',first),identity.photoUploadId('owner','trip','target',second));
});

test('profile photo singleton upload keeps its existing endpoint and response contract',async()=>{
  const f=apiFixture(async()=>response(200,{profilePictureUrl:'avatar'}));
  assert.equal((await f.api.uploadProfilePhoto('file://avatar')).profilePictureUrl,'avatar');
  assert.ok(f.requests[0].url.endsWith('/users/me'));assert.equal(f.requests[0].options.headers['X-Photo-Upload-Id'],undefined);
});
