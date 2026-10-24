const test=require('node:test');
const assert=require('node:assert/strict');
const {load,fixture,nodes,native,theme}=require('./helpers/component-fixture.cjs');
const {hooksFixture,authFixture}=require('./helpers/hooks-fixture.cjs');
const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function connectedScreens(){
  const auth=authFixture(),feedHost=hooksFixture(),peopleHost=hooksFixture(),pending=deferred();
  const follow=load('src/utils/followActions.js','({createFollowActions,followsUser,getFollowRevision,subscribeFollowChanges})');
  const profileContext=host=>load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.store});
  const useProfileList=load('src/hooks/useProfileList.js','useProfileList',{useTripSocialStore:selector=>selector({deletionRevision:0}),...feedHost.hooks,useProfileContext:profileContext(feedHost),createPagedList});
  let following=true,feedReads=0,peopleReads=0,statsUpdates=0,writes=0;
  const feed=fixture('app/(tabs)/feed/index.js','FeedScreen',{}, {...native,theme,...feedHost.hooks,...follow,StyleSheet:{create:x=>x},useAuthStore:auth.store,useProfileList,getFeedTripJson:async()=>{feedReads++;return {items:following?[{_id:'followers-only-trip'}]:[]};},useTripSocialStore:()=>({primeCounts(){}}),useRouter:()=>({}),RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',TripCardContainer:'TripCardContainer',CommentsSheet:'CommentsSheet',LikersSheet:'LikersSheet',RecommendationsSheet:'RecommendationsSheet'});
  const props={stat:'Following',userId:'actor',onClose(){},onStatsUpdate:()=>{statsUpdates++;}};
  const people=fixture('src/components/modals/UserListModal.js','UserListContent',props,{...native,theme,...peopleHost.hooks,...follow,createPagedList,useProfileContext:profileContext(peopleHost),ProfileListStatus:'ProfileListStatus',BottomModal:'BottomModal',ModalHeader:'ModalHeader',Avatar:'Avatar',useRouter:()=>({}),getUserFollowing:async()=>{peopleReads++;return {data:[{_id:'target',username:'Target',isFollowing:true}],totalPages:1};},unfollowUser:()=>{writes++;return pending.promise;},followUser:()=>{throw Error('unexpected follow');}});
  return {auth,feedHost,peopleHost,props,pending,...follow,counts:()=>({feedReads,peopleReads,statsUpdates,writes}),setFollowing:value=>{following=value;},feed:()=>feedHost.render(()=>feed.render()),people:()=>peopleHost.render(()=>people.render())};
}
function startUnfollow(screen){
  const list=nodes(screen.people(),'FlatList')[0],row=list.props.renderItem({item:list.props.data[0]});
  return nodes(row,'TouchableOpacity')[1].props.onPress();
}

test('closed actual people sheet invalidates mounted follower-only feed on same-session success or ambiguous failure',async()=>{
  for(const reject of [false,true]){
    const screen=connectedScreens();screen.feed();screen.people();await tick();
    assert.equal(nodes(screen.feed(),'FlatList')[0].props.data.length,1);screen.feedHost.blur();
    const work=startUnfollow(screen);await startUnfollow(screen);assert.equal(screen.counts().writes,1);
    screen.peopleHost.unmount();screen.setFollowing(false);
    if(reject)screen.pending.reject(Error('response lost'));else screen.pending.resolve();
    await work;assert.equal(screen.getFollowRevision(),1);
    screen.feed();screen.feedHost.focus();await tick();
    assert.equal(nodes(screen.feed(),'FlatList')[0].props.data.length,0);
    assert.deepEqual(screen.counts(),{feedReads:2,peopleReads:1,statsUpdates:0,writes:1});
  }
});

test('profile-key replacement still invalidates only same-session feed, without touching replacement sheet',async()=>{
  const screen=connectedScreens();screen.feed();screen.people();await tick();screen.feedHost.blur();
  const work=startUnfollow(screen);screen.props.userId='other-profile';screen.people();await tick();
  screen.setFollowing(false);screen.pending.resolve();await work;
  assert.equal(screen.getFollowRevision(),1);assert.equal(screen.counts().statsUpdates,0);
  screen.feed();screen.feedHost.focus();await tick();assert.equal(nodes(screen.feed(),'FlatList')[0].props.data.length,0);
});

test('closed sheet settlement never invalidates a different account, same-token relogin, or login transition',async()=>{
  for(const change of ['account','relogin','epoch','transition'])for(const reject of [false,true]){
    const screen=connectedScreens();screen.feed();screen.people();await tick();
    const work=startUnfollow(screen);screen.peopleHost.unmount();
    if(change==='account')screen.auth.set({token:'other-token',user:{_id:'other'}});
    if(change==='relogin'){screen.auth.set({token:null,user:null});screen.auth.set({token:'session-one',user:{_id:'actor'}});}
    if(change==='epoch')screen.auth.set({token:'session-one',user:{_id:'actor'},sessionEpoch:1});
    if(change==='transition')screen.auth.set({...screen.auth.store.getState(),isSessionChanging:true});
    if(reject)screen.pending.reject(Error('old failure'));else screen.pending.resolve();await work;
    assert.equal(screen.getFollowRevision(),0);assert.equal(screen.counts().statsUpdates,0);assert.equal(screen.counts().peopleReads,1);
  }
});
