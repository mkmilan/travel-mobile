const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,nodes,native,load}=require('./helpers/component-fixture.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function loaderFixture(fetcher) {
 let current=true,dependencies,cleanup,queued;const found=[],cancelled=[];const context={isCurrent:()=>current};
 const props={recommendationId:'rec',userId:'owner',onFound:rec=>found.push(rec),onCancel:()=>cancelled.push(true)};
 const screen=fixture('src/components/RecommendationSourceLoader.js','RecommendationSourceLoader',props,{
  ...native,useProfileContext:()=>context,getRecommendationByIdApi:fetcher,
  useEffect:(callback,next)=>{if(!dependencies||next.some((value,i)=>value!==dependencies[i])){dependencies=next;queued=callback;}}
 });
 return {found,cancelled,props,render:screen.render,effects(){if(queued){cleanup?.();cleanup=queued();queued=null;}},invalidate(){current=false;},unmount(){cleanup?.();},};
}
test('off-page source fetches exactly one record and no pages; success preserves returned detail',async()=>{
 let calls=0;const record={_id:'rec',user:{_id:'owner'},photos:['photo']};const screen=loaderFixture(async id=>{calls++;assert.equal(id,'rec');return record;});
 screen.render();screen.effects();await tick();assert.equal(screen.found[0],record);
 for(let i=0;i<5;i++){screen.render();screen.effects();}assert.equal(calls,1);
});
test('missing/private/network failure exposes explicit Retry and Cancel without automatic looping',async()=>{
 let calls=0;const screen=loaderFixture(async()=>{calls++;if(calls===1)throw Error('404 private');return {_id:'rec',user:'owner'};});
 screen.render();screen.effects();await tick();let tree=screen.render();assert.ok(nodes(tree,'Text').some(node=>node.props.accessibilityRole==='alert'));
 for(let i=0;i<5;i++){screen.render();screen.effects();}assert.equal(calls,1);
 nodes(tree,'Pressable')[0].props.onPress();screen.render();screen.effects();await tick();assert.equal(calls,2);assert.equal(screen.found.length,1);
 const cancel=loaderFixture(()=>new Promise(()=>{}));cancel.render();cancel.effects();nodes(cancel.render(),'Pressable')[0].props.onPress();assert.equal(cancel.cancelled.length,1);
});
test('mismatched recommendation or profile owner never opens detail',async()=>{
 for(const rec of [{_id:'other',user:'owner'},{_id:'rec',user:'other'},null]) {
  const screen=loaderFixture(async()=>rec);screen.render();screen.effects();await tick();assert.equal(screen.found.length,0);assert.ok(nodes(screen.render(),'Text').some(node=>node.props.accessibilityRole==='alert'));
 }
});
test('late success/error after session change, selection change or unmount cannot open or show error',async()=>{
 for(const action of ['invalidate','unmount','replace']) for(const failure of [false,true]) {
  const pending=deferred();let calls=0;const screen=loaderFixture(()=>{calls++;return calls===1?pending.promise:new Promise(()=>{});});
  screen.render();screen.effects();if(action==='replace'){screen.props.recommendationId='next';screen.render();screen.effects();}else screen[action]();
  if(failure)pending.reject(Error('late'));else pending.resolve({_id:'rec',user:'owner'});await tick();
  assert.equal(screen.found.length,0);assert.ok(!nodes(screen.render(),'Text').some(node=>node.props.accessibilityRole==='alert'));
 }
});
test('source GET uses existing authenticated permission-checked endpoint, without CSRF/mutation',async()=>{
 const requests=[];const request=async(url,options)=>{requests.push({url,options});return {_id:'rec'};};
 const get=load('src/services/api.js','(apiFetch = request, getRecommendationByIdApi)',{Constants:{expoConfig:{extra:{API_URL:'https://fixture.invalid/api'}}},Updates:{},console,request,encodeURIComponent});
 assert.equal((await get('rec/one'))._id,'rec');assert.equal(requests[0].url,'/v2/recommendations/rec%2Fone');assert.equal(requests[0].options.method,'GET');assert.notEqual(requests[0].options.auth,false);assert.notEqual(requests[0].options.csrf,true);
});

test('Cancel invalidates a pending request immediately, before unmount commits',async()=>{
 const pending=deferred();const screen=loaderFixture(()=>pending.promise);screen.render();screen.effects();
 nodes(screen.render(),'Pressable')[0].props.onPress();pending.resolve({_id:'rec',user:'owner'});await tick();
 assert.equal(screen.cancelled.length,1);assert.equal(screen.found.length,0);
});
