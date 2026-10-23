const test=require('node:test');
const assert=require('node:assert/strict');
const {load,fixture,nodes,native,theme}=require('./helpers/component-fixture.cjs');
const {hooksFixture,authFixture}=require('./helpers/hooks-fixture.cjs');
const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const ids=list=>Array.from(list.props.data,item=>item._id);
function feedScreen(loader){
  const host=hooksFixture(),auth=authFixture(),routes=[],primed=[];
  const follow=load('src/utils/followActions.js','({createFollowActions,getFollowRevision,subscribeFollowChanges})');
  const useProfileContext=load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.store});
  const useProfileList=load('src/hooks/useProfileList.js','useProfileList',{...host.hooks,useProfileContext,createPagedList});
  const primeCounts=item=>primed.push(item._id);
  const screen=fixture('app/(tabs)/feed/index.js','FeedScreen',{}, {...native,theme,...host.hooks,...follow,StyleSheet:{create:x=>x},useAuthStore:auth.store,useProfileList,getFeedTripJson:loader,useTripSocialStore:()=>({primeCounts}),useRouter:()=>({push:path=>routes.push(path)}),RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',TripCardContainer:'TripCardContainer',CommentsSheet:'CommentsSheet',LikersSheet:'LikersSheet',RecommendationsSheet:'RecommendationsSheet'});
  const render=()=>host.render(()=>screen.render());
  return {host,auth,routes,primed,...follow,render,list:()=>nodes(render(),'FlatList')[0]};
}

test('MOB-026 mounted empty/exhausted feed invalidates after actual follow/unfollow and reloads only once on focus',async()=>{
  let following=false,calls=0,writes=0;
  const screen=feedScreen(async()=>{calls++;return {items:following?[{_id:'followed-trip'}]:[]};});
  screen.render();await tick();assert.deepEqual(ids(screen.list()),[]);assert.equal(calls,1);
  for(let i=0;i<4;i++){screen.host.blur();screen.host.focus();screen.render();await tick();}assert.equal(calls,1);
  screen.host.blur();const actions=screen.createFollowActions({context:{userId:'actor',isCurrent:()=>true},follow:async()=>{writes++;following=true;},unfollow:async()=>{writes++;following=false;},onChange:async()=>{}});
  await actions.toggle('other',false);screen.render();assert.equal(calls,1);screen.host.focus();await tick();
  let list=screen.list();assert.deepEqual(ids(list),['followed-trip']);assert.equal(calls,2);
  list.props.renderItem({item:list.props.data[0]}).props.onOpenSheet('comments',list.props.data[0]);assert.equal(nodes(screen.render(),'CommentsSheet')[0].props.visible,true);
  screen.host.blur();await actions.toggle('other',true);list=screen.list();assert.deepEqual(ids(list),[]);assert.equal(nodes(screen.render(),'CommentsSheet')[0].props.visible,false);
  screen.host.focus();await tick();assert.deepEqual(ids(screen.list()),[]);assert.equal(calls,3);assert.equal(writes,2);
});

test('MOB-026 feed pagination is single-flight and deduplicated; ordinary focus retains pages and pull refresh recovers empty/error',async()=>{
  const requests=[];const pending=deferred();let fail=false;
  const screen=feedScreen(async page=>{requests.push(page);if(fail)throw Error('offline');if(requests.length===2)return pending.promise;return {items:page===1?[{_id:'one'}]:[]};});
  screen.render();await tick();let list=screen.list();const a=list.props.onEndReached(),b=list.props.onEndReached();assert.equal(a,b);await tick();assert.deepEqual(requests,[1,2]);
  pending.resolve({items:[{_id:'one',title:'latest'},{_id:'two'},{_id:'two'}]});await a;list=screen.list();assert.deepEqual(ids(list),['one','two']);assert.equal(list.props.data[0].title,'latest');
  screen.host.blur();screen.host.focus();await tick();assert.deepEqual(requests,[1,2]);assert.deepEqual(ids(screen.list()),['one','two']);
  fail=true;await list.props.refreshControl.props.onRefresh();list=screen.list();assert.deepEqual(ids(list),['one','two']);assert.match(list.props.ListFooterComponent.props.error,/offline/);
  screen.host.blur();screen.host.focus();await list.props.onEndReached();assert.deepEqual(requests,[1,2,1]);
  fail=false;await list.props.ListFooterComponent.props.onRetry();assert.deepEqual(ids(screen.list()),['one']);
  await screen.list().props.onEndReached();assert.equal(requests.at(-1),2);await screen.list().props.onEndReached();assert.equal(requests.length,5);
});

test('MOB-026 delayed old relationship/session response cannot repopulate or prime the current feed',async()=>{
  for(const change of ['unfollow','session','same-token-login']) {
    const pending=deferred();let calls=0;
    const screen=feedScreen(async()=>{calls++;return calls===1?pending.promise:{items:[{_id:'current'}]};});
    screen.render();await tick();
    if(change==='unfollow')await screen.createFollowActions({context:{userId:'actor',isCurrent:()=>true},unfollow:async()=>{},onChange:async()=>{}}).toggle('other',true);
    else {screen.auth.set({token:null,user:null});screen.auth.set({token:change==='session'?'new-token':'session-one',user:{_id:'actor'}});}
    screen.render();await tick();assert.deepEqual(ids(screen.list()),['current']);pending.resolve({items:[{_id:'old-private'}]});await tick();
    assert.deepEqual(ids(screen.list()),['current']);assert.equal(screen.primed.includes('old-private'),false);assert.equal(calls,2);
  }
});

test('MOB-026 ambiguous follow failure triggers one read-only feed invalidation; stale-session completion does not',async()=>{
  let calls=0,writes=0,reconciles=0,current=true;
  const screen=feedScreen(async()=>{calls++;return {items:[]};});screen.render();await tick();
  const failed=screen.createFollowActions({context:{userId:'actor',isCurrent:()=>current},follow:async()=>{writes++;throw Error('response lost');},onChange:async()=>{},reconcile:async()=>reconciles++});
  await failed.toggle('other',false);screen.render();await tick();assert.equal(calls,2);assert.equal(writes,1);assert.equal(reconciles,1);assert.match(failed.getSnapshot().error,/response lost/);
  const pending=deferred();const delayed=screen.createFollowActions({context:{userId:'actor',isCurrent:()=>current},follow:()=>pending.promise,onChange:async()=>{throw Error('must not happen');}});
  const work=delayed.toggle('other',false);current=false;pending.resolve();await work;screen.render();await tick();assert.equal(calls,2);
});
