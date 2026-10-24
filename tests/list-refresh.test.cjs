const test=require('node:test');
const assert=require('node:assert/strict');
const {load,fixture,nodes,native,theme}=require('./helpers/component-fixture.cjs');
const {hooksFixture,authFixture}=require('./helpers/hooks-fixture.cjs');
const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const ids=list=>Array.from(list.props.data,item=>item._id);
function tripsScreen(loader){
  const host=hooksFixture(),auth=authFixture(),routes=[],props={userId:'actor'};
  const useProfileContext=load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.store});
  const useProfileList=load('src/hooks/useProfileList.js','useProfileList',{useTripSocialStore:selector=>selector({deletionRevision:0}),...host.hooks,useProfileContext,createPagedList});
  const screen=fixture('src/screens/profile/tabs/TripsTab.js','TripsTab',props,{...native,theme,...host.hooks,useProfileList,getTripsByUser:loader,useRouter:()=>({push:path=>routes.push(path)}),RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',TripCardContainer:'TripCardContainer',CommentsSheet:'CommentsSheet',LikersSheet:'LikersSheet',RecommendationsSheet:'RecommendationsSheet'});
  const render=()=>host.render(()=>screen.render());
  return {host,auth,routes,props,render,list:()=>nodes(render(),'FlatList')[0]};
}

test('MOB-027 actual Trips card return reloads metadata with unchanged count once; ordinary focus preserves pages',async()=>{
  const calls=[];let title='old';const screen=tripsScreen(async(_id,page)=>{calls.push(page);return {data:[{_id:`trip-${page}`,title}],totalPages:2};});
  screen.render();await tick();let list=screen.list();await list.props.onEndReached();
  assert.deepEqual(ids(screen.list()),['trip-1','trip-2']);
  screen.host.blur();screen.host.focus();await tick();assert.deepEqual(calls,[1,2]);
  list=screen.list();list.props.renderItem({item:list.props.data[0]}).props.onPress();screen.host.blur();title='new title';
  assert.deepEqual(screen.routes,['/trip/trip-1']);screen.host.focus();await tick();
  list=screen.list();assert.equal(list.props.data[0].title,'new title');assert.deepEqual(calls,[1,2,1]);
  for(let i=0;i<5;i++){screen.render();screen.host.blur();screen.host.focus();await tick();}assert.deepEqual(calls,[1,2,1]);
});

test('MOB-027 source return during pagination queues one fresh page and failure remains explicit retry',async()=>{
  const pending=deferred();const calls=[];let fail=false;
  const screen=tripsScreen(async(_id,page)=>{calls.push(page);if(page===2)return pending.promise;if(fail)throw Error('offline');return {data:[{_id:'one',title:calls.length>2?'fresh':'old'}],totalPages:2};});
  screen.render();await tick();let list=screen.list();const loading=list.props.onEndReached();await tick();
  list.props.renderItem({item:list.props.data[0]}).props.onPress();screen.host.blur();screen.host.focus();
  fail=true;pending.resolve({data:[{_id:'two'}],totalPages:2});await loading;await tick();
  list=screen.list();assert.deepEqual(calls,[1,2,1]);assert.deepEqual(ids(list),['one','two']);assert.match(list.props.ListFooterComponent.props.error,/offline/);
  screen.host.blur();screen.host.focus();await tick();assert.equal(calls.length,3);
  fail=false;await list.props.ListFooterComponent.props.onRetry();assert.equal(screen.list().props.data[0].title,'fresh');assert.equal(calls.length,4);
});

test('MOB-027 actual list hook isolates late response and queued source refresh across logout/relogin and profile replacement',async()=>{
  for(const change of ['profile','session','same-token-login']){
    const pending=deferred();let calls=0;
    const screen=tripsScreen(async()=>{calls++;return calls===1?pending.promise:{data:[{_id:'new'}],totalPages:1};});
    screen.render();await tick();
    if(change==='profile')screen.props.userId='another';
    else {screen.auth.set({token:null,user:null});if(change==='same-token-login')screen.auth.set({token:'session-one',user:{_id:'actor'}});else screen.auth.set({token:'session-two',user:{_id:'actor'}});}
    screen.render();await tick();assert.deepEqual(ids(screen.list()),['new']);
    pending.resolve({data:[{_id:'old-private'}],totalPages:1});await tick();assert.deepEqual(ids(screen.list()),['new']);assert.equal(calls,2);
  }
});

function myTripsScreen(loader) {
  const host=hooksFixture(),auth=authFixture();
  const useProfileContext=load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.store});
  const social=selector=>selector?selector({deletionRevision:0}):{primeCounts(){}};
  const useProfileList=load('src/hooks/useProfileList.js','useProfileList',{...host.hooks,useProfileContext,createPagedList,useTripSocialStore:social});
  const screen=fixture('app/(tabs)/trips/index.js','MyTrips',{}, {...native,theme,...host.hooks,useProfileList,useAuthStore:auth.store,useTripSocialStore:social,getMyJsonTrips:loader,useRouter:()=>({push(){}}),PendingTripDeletions:'PendingTripDeletions',RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',TripCardContainer:'TripCardContainer',CommentsSheet:'CommentsSheet',LikersSheet:'LikersSheet',RecommendationsSheet:'RecommendationsSheet'});
  return {host,render:()=>host.render(()=>screen.render()),list(){return nodes(this.render(),'FlatList')[0];}};
}
test('My Trips refocus after Record upload reloads empty cached list once without a render loop',async()=>{
  let server=[],calls=0;const screen=myTripsScreen(async()=>{calls++;return {items:server.slice()};});
  screen.render();await tick();assert.deepEqual(ids(screen.list()),[]);
  screen.host.blur();server=[{_id:'uploaded'}];screen.host.focus();await tick();
  assert.deepEqual(ids(screen.list()),['uploaded']);assert.equal(calls,2);
  for(let i=0;i<5;i++)screen.render();await tick();assert.equal(calls,2);
});
test('My Trips return during old load queues fresh data, retains rows on failure and supports retry',async()=>{
  const pending=deferred();let calls=0,fail=true;
  const screen=myTripsScreen(()=>{calls++;if(calls===1)return pending.promise;if(fail)throw Error('offline');return {items:[{_id:'uploaded'}]};});
  screen.render();await tick();screen.host.blur();screen.host.focus();
  pending.resolve({items:[{_id:'old'}]});await tick();await tick();
  assert.equal(calls,2);assert.deepEqual(ids(screen.list()),['old']);
  assert.match(screen.list().props.ListFooterComponent.props.error,/offline/);
  fail=false;await screen.list().props.refreshControl.props.onRefresh();assert.deepEqual(ids(screen.list()),['uploaded']);
});
