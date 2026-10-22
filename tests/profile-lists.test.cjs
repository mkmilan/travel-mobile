const test=require('node:test');
const assert=require('node:assert/strict');
const {load,read,fixture,nodes,native,theme}=require('./helpers/component-fixture.cjs');
const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('empty/error first pages complete once; repeated focus never loops or silently retries',async()=>{
  for(const fails of [false,true]) {
    let calls=0;const list=createPagedList(async()=>{calls++;if(fails)throw Error('fixture');return {data:[],totalPages:0};});
    assert.equal(list.getSnapshot().loaded,false);
    await Promise.all([list.ensureLoaded(),list.ensureLoaded(),list.loadMore()]);
    for(let i=0;i<20;i++)await list.ensureLoaded();
    const state=list.getSnapshot();assert.equal(calls,1);assert.equal(state.loading,false);assert.equal(state.loaded,true);assert.equal(state.hasNext,false);assert.equal(Boolean(state.error),fails);
    await list.refresh();assert.equal(calls,2);assert.equal(list.getSnapshot().refreshing,false);
  }
});
test('slow first page/pagination are single-flight; loaded items persist during refresh',async()=>{
  const requests=[];const list=createPagedList(page=>{const pending=deferred();requests.push({page,...pending});return pending.promise;});
  const first=list.ensureLoaded();assert.equal(list.ensureLoaded(),first);await tick();assert.equal(requests.length,1);
  assert.equal(list.getSnapshot().loading,true);assert.equal(list.getSnapshot().loaded,false);
  requests[0].resolve({data:[{_id:'one'}],totalPages:2});await first;
  const more=list.loadMore();assert.equal(list.loadMore(),more);await tick();assert.equal(requests[1].page,2);
  requests[1].resolve({data:[{_id:'two'}],totalPages:2});await more;
  assert.equal(list.getSnapshot().items.length,2);await list.loadMore();assert.equal(requests.length,2);
  const refresh=list.refresh();await tick();assert.equal(requests[2].page,1);assert.equal(list.getSnapshot().items.length,2);assert.equal(list.getSnapshot().refreshing,true);
  requests[2].resolve({data:[{_id:'new'}],totalPages:1});await refresh;assert.equal(list.getSnapshot().items[0]._id,'new');assert.equal(list.getSnapshot().items.length,1);
});
test('refresh during request is coalesced and replaces the older response after it settles',async()=>{
  const requests=[];const list=createPagedList(()=>{const pending=deferred();requests.push(pending);return pending.promise;});
  const initial=list.ensureLoaded();const refresh=list.refresh();assert.equal(list.refresh(),refresh);await tick();assert.equal(requests.length,1);
  requests[0].resolve({data:[{_id:'old'}],totalPages:1});await initial;await tick();assert.equal(requests.length,2);
  requests[1].resolve({data:[{_id:'fresh'}],totalPages:1});await refresh;assert.equal(list.getSnapshot().items[0]._id,'fresh');
});
test('a different profile/session store cannot receive an older response or failure',async()=>{
  const old=deferred();const a=createPagedList(()=>old.promise);const pending=a.ensureLoaded();
  const b=createPagedList(async()=>({data:[{_id:'new-profile'}],totalPages:1}));await b.ensureLoaded();
  old.resolve({data:[{_id:'old-profile'}],totalPages:3});await pending;
  assert.equal(b.getSnapshot().items[0]._id,'new-profile');assert.equal(b.getSnapshot().loading,false);assert.equal(b.getSnapshot().hasNext,false);
});
test('malformed/synchronous failures release locks, pagination errors retain data and explicit retry recovers',async()=>{
  for(const invalid of [undefined,{data:null}]) {
    let fail=true;const list=createPagedList(()=>fail?invalid:{data:[],totalPages:0});await list.ensureLoaded();assert.ok(list.getSnapshot().error);assert.equal(list.getSnapshot().loading,false);
    fail=false;await list.refresh();assert.equal(list.getSnapshot().error,null);
  }
  let calls=0;const list=createPagedList(()=>{calls++;if(calls===2)throw Error('fixture');return {data:[{_id:'one'}],totalPages:2};});
  await list.ensureLoaded();await list.loadMore();assert.equal(list.getSnapshot().items.length,1);assert.ok(list.getSnapshot().error);
  await list.loadMore();assert.equal(calls,2);await list.refresh();assert.equal(calls,3);assert.equal(list.getSnapshot().error,null);
});
test('list hook ties focus to stable profile/session store, not loading/items identities',async()=>{
  let userId='a',token='one';let memo,dependencies,focus;let calls=0;
  const hook=load('src/hooks/useProfileList.js','useProfileList',{
    createPagedList,useAuthStore:select=>select({token}),
    useMemo:(create,next)=>{if(!dependencies||next.some((value,i)=>value!==dependencies[i])){memo=create();dependencies=next;}return memo;},
    useSyncExternalStore:(_subscribe,get)=>get(),useCallback:fn=>fn,useFocusEffect:fn=>{focus=fn;},
  });
  const loader=async()=>{calls++;return {data:[],totalPages:0};};
  let state=hook(userId,loader);assert.equal(state.initialLoading,true);focus();await tick();
  for(let i=0;i<5;i++){state=hook(userId,loader);focus();await tick();}assert.equal(calls,1);assert.equal(state.initialLoading,false);
  userId='b';state=hook(userId,loader);assert.equal(state.initialLoading,true);focus();await tick();assert.equal(calls,2);
  token='two';state=hook(userId,loader);assert.equal(state.initialLoading,true);focus();await tick();assert.equal(calls,3);
  assert.match(read('src/hooks/useProfileList.js'),/useFocusEffect\(useCallback\(.*\[list\]\)\)/);
});
test('status UI distinguishes loading, empty and retryable error',()=>{
  const render=props=>fixture('src/components/ProfileListStatus.js','ProfileListStatus',props,{...native,theme}).render();
  assert.equal(render({loading:true,emptyMessage:'Empty'}).type,'ActivityIndicator');
  assert.equal(nodes(render({loading:false,emptyMessage:'Empty'}),'Text')[0].children[0],'Empty');
  let retried=0;const tree=render({error:'fixture',onRetry:()=>retried++});nodes(tree,'Pressable')[0].props.onPress();assert.equal(retried,1);
});
test('TripsTab uses the stable list hook and renders initial spinner rather than premature empty text',()=>{
  const source=read('src/screens/profile/tabs/TripsTab.js');assert.match(source,/useProfileList\(userId, getTripsByUser\)/);assert.doesNotMatch(source,/useFocusEffect|setLoading|fetchPage/);
  const tree=fixture('src/screens/profile/tabs/TripsTab.js','TripsTab',{userId:'fixture'},{...native,theme,RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',TripCardContainer:'TripCardContainer',LikersSheet:'LikersSheet',CommentsSheet:'CommentsSheet',RecommendationsSheet:'RecommendationsSheet',useRouter:()=>({}),getTripsByUser:()=>{},useProfileList:()=>({items:[],loading:false,initialLoading:true})}).render();
  assert.equal(nodes(tree,'FlatList')[0].props.ListEmptyComponent.props.loading,true);
});

test('Trips sheets are hidden immediately when profile/session identity changes',()=>{
  let identity={};const items=[{_id:'old'}];
  const screen=fixture('src/screens/profile/tabs/TripsTab.js','TripsTab',{userId:'fixture'}, {...native,theme,RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',TripCardContainer:'TripCardContainer',LikersSheet:'LikersSheet',CommentsSheet:'CommentsSheet',RecommendationsSheet:'RecommendationsSheet',useRouter:()=>({}),getTripsByUser:()=>{},useProfileList:()=>({identity,items})});
  let tree=screen.render();nodes(tree,'FlatList')[0].props.renderItem({item:items[0]}).props.onOpenSheet('comments',items[0]);
  tree=screen.render();assert.equal(nodes(tree,'CommentsSheet')[0].props.visible,true);
  identity={};tree=screen.render();assert.equal(nodes(tree,'CommentsSheet')[0].props.visible,false);assert.equal(nodes(tree,'CommentsSheet')[0].props.trip,null);
});
