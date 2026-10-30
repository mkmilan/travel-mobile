const test=require('node:test');
const assert=require('node:assert/strict');
const {load,fixture,nodes,native,theme}=require('./helpers/component-fixture.cjs');
const {createFollowActions,followsUser}=load('src/utils/followActions.js','({createFollowActions,followsUser})');
const {createProfileData}=load('src/utils/profileData.js','({createProfileData})');
const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('follow and unfollow keep the existing authenticated POST/DELETE + CSRF contract; lists send actual pages',async()=>{
  const requests=[];const api=load('src/services/api.js','(apiFetch=request,{followUser,unfollowUser,getUserFollowers,getUserFollowing})',{
    Constants:{expoConfig:{extra:{API_URL:'https://fixture.invalid/api'}}},Updates:{},URLSearchParams,console:{log(){},error(){}},request:async(path,options)=>{requests.push({path,options});return {data:[]};}});
  await api.followUser('target');await api.unfollowUser('target');await api.getUserFollowers('target',2,15);await api.getUserFollowing('target',3,15);
  assert.equal(requests[0].path,'/users/target/follow');assert.equal(requests[0].options.method,'POST');assert.equal(requests[0].options.csrf,true);assert.notEqual(requests[0].options.auth,false);
  assert.equal(requests[1].options.method,'DELETE');assert.equal(requests[1].options.csrf,true);
  assert.equal(requests[2].path,'/users/target/followers?page=2&limit=15');assert.equal(requests[3].path,'/users/target/following?page=3&limit=15');
  assert.notEqual(requests[2].options.csrf,true);
});

test('actual follow actions single-flight repeated taps, report success, and use latest confirmed relation',async()=>{
  const pending=deferred();const calls=[],changes=[];let relation=false;
  const context={userId:'actor',isCurrent:()=>true};
  const actions=createFollowActions({context,follow:id=>{calls.push(['follow',id]);return pending.promise;},unfollow:async id=>calls.push(['unfollow',id]),getFollowing:()=>relation,onChange:async(id,value)=>{changes.push([id,value]);relation=value;}});
  const first=actions.toggle('target',false);await actions.toggle('target',false);assert.equal(calls.length,1);assert.equal(actions.getSnapshot().pending.target,true);
  pending.resolve({message:'Followed'});await first;assert.equal(relation,true);assert.equal(actions.getSnapshot().pending.target,undefined);
  await actions.toggle('target',false);assert.equal(calls[1][0],'unfollow');assert.equal(relation,false);assert.equal(changes.length,2);
  await actions.toggle('actor',false);assert.equal(calls.length,2);
});

test('rejected writes expose error and GET-only reconcile; explicit retry works without an automatic second mutation',async()=>{
  let fail=true,writes=0,reads=0,changed=0;
  const actions=createFollowActions({context:{userId:'actor',isCurrent:()=>true},follow:async()=>{writes++;if(fail)throw Error('offline');},unfollow:async()=>{},onChange:async()=>changed++,reconcile:async()=>reads++});
  await actions.toggle('target',false);assert.equal(writes,1);assert.equal(reads,1);assert.equal(changed,0);assert.match(actions.getSnapshot().error,/offline/);assert.equal(actions.getSnapshot().pending.target,undefined);
  fail=false;await actions.toggle('target',false);assert.equal(writes,2);assert.equal(changed,1);assert.equal(actions.getSnapshot().error,null);
});

test('follow completion after profile/account switch or sheet close does not refresh or patch replacement UI',async()=>{
  for(const rejects of [false,true]){
    let current=true;const pending=deferred();let changed=0,reads=0;
    const actions=createFollowActions({context:{userId:'actor',isCurrent:()=>current},follow:()=>pending.promise,unfollow:async()=>{},onChange:()=>changed++,reconcile:()=>reads++});
    const first=actions.toggle('target',false);current=false;if(rejects)pending.reject(Error('offline'));else pending.resolve({});await first;await actions.toggle('target',false);
    assert.equal(changed,0);assert.equal(reads,0);assert.equal(actions.getSnapshot().error,null);
  }
});

test('mutation invalidates an older profile GET and queues fresh status before dropping follow pending state',async()=>{
  const pending=deferred();let calls=0;
  const profile=createProfileData(()=>{calls++;return calls===2?pending.promise:Promise.resolve({_id:'target',isFollowing:calls>2,followersCount:calls>2?1:0});},()=>true);
  await profile.refresh();const old=profile.refresh();await tick();
  profile.updateUser({isFollowing:true,followersCount:1});const fresh=profile.refreshAfterChange();assert.equal(profile.refreshAfterChange(),fresh);
  pending.resolve({_id:'target',isFollowing:false,followersCount:0});await old;assert.equal(profile.getSnapshot().user.isFollowing,true);
  await fresh;assert.equal(calls,3);assert.equal(profile.getSnapshot().user.isFollowing,true);
});

test('follow button appears only on other profiles; renders pending, unfollow, and visible errors',()=>{
  let presses=0;const props={displayedUser:{_id:'target',isFollowing:false},isSelf:false,stats:{},colors:{},onFollowToggle:()=>presses++};
  const screen=fixture('src/screens/profile/ProfileSummary.js','ProfileSummary',props,{...native,baseTheme:theme,StyleSheet:{create:x=>x},Feather:'Feather',Avatar:'Avatar',Link:'Link',useViewerUnits: () => "metric", profileDistance:()=> '0 km'});
  const getButton=tree=>nodes(tree,'TouchableOpacity').find(node=>node.props.accessibilityLabel==='Follow user'||node.props.accessibilityLabel==='Unfollow user');
  getButton(screen.render()).props.onPress();assert.equal(presses,1);props.followBusy=true;assert.equal(getButton(screen.render()).props.disabled,true);
  props.followBusy=false;props.displayedUser.isFollowing=true;props.followError='offline';const tree=screen.render();assert.equal(getButton(tree).props.accessibilityLabel,'Unfollow user');assert.ok(nodes(tree,'Text').find(node=>node.children.includes('offline')));
  props.isSelf=true;assert.equal(getButton(screen.render()),undefined);
});

function peopleFixture(loader){
  const context={userId:'actor',isCurrent:()=>true};let memoIndex=0;const memos=[],effects=[];let effectIndex=0;const queued=[];const history=[];let calls=0;const writes=[];
  const props={stat:'Following',userId:'actor',onClose:()=>history.push('close'),onStatsUpdate:async()=>{calls++;}};
  const screen=fixture('src/components/modals/UserListModal.js','UserListContent',props,{...native,theme,ProfileListStatus:'ProfileListStatus',BottomModal:'BottomModal',ModalHeader:'ModalHeader',Avatar:'Avatar',createPagedList,createFollowActions,followsUser,useProfileContext:()=>context,getUserFollowing:loader,getUserFollowers:loader,followUser:async id=>writes.push(['follow',id]),unfollowUser:async id=>writes.push(['unfollow',id]),useRouter:()=>({push:path=>history.push(path)}),
    useMemo:(create,deps)=>{const index=memoIndex++,previous=memos[index];if(!previous||deps.some((value,i)=>value!==previous.deps[i]))memos[index]={value:create(),deps};return memos[index].value;},useSyncExternalStore:(_subscribe,get)=>get(),
    useEffect:(callback,deps)=>{const index=effectIndex++;if(!effects[index]||deps.some((value,i)=>value!==effects[index][i])){effects[index]=deps;queued.push(callback);}},
  });
  return {props,context,history,writes,get counts(){return calls;},render(){memoIndex=0;effectIndex=0;return screen.render();},effects(){while(queued.length)queued.shift()();}};
}

test('people list starts loading, requests correct pages once, and exposes failure/retry instead of fake emptiness',async()=>{
  const requests=[];let fail=false;const screen=peopleFixture(async(id,page,limit)=>{requests.push({id,page,limit});if(fail)throw Error('offline');return {data:[{_id:`user-${page}`,username:'Fixture',followers:[]}],totalPages:2};});
  let tree=screen.render();assert.equal(nodes(tree,'FlatList')[0].props.ListEmptyComponent.props.loading,true);screen.effects();await tick();
  tree=screen.render();const list=nodes(tree,'FlatList')[0];await Promise.all([list.props.onEndReached(),list.props.onEndReached()]);
  assert.deepEqual(requests.map(item=>item.page),[1,2]);assert.equal(requests[0].limit,15);assert.equal(nodes(screen.render(),'FlatList')[0].props.data.length,2);
  fail=true;await nodes(screen.render(),'FlatList')[0].props.onRefresh();const footer=nodes(screen.render(),'FlatList')[0].props.ListFooterComponent;assert.match(footer.props.error,/offline/);
  fail=false;await footer.props.onRetry();assert.equal(nodes(screen.render(),'FlatList')[0].props.data.length,1);
});

test('people list follow updates/refetches, excludes self toggle and closes source before opening profile',async()=>{
  let following=false;const screen=peopleFixture(async()=>({data:[{_id:'target',username:'Fixture',followers:following?['actor']:[]}],totalPages:1}));
  screen.render();screen.effects();await tick();let list=nodes(screen.render(),'FlatList')[0];let row=list.props.renderItem({item:list.props.data[0]});
  const toggle=nodes(row,'TouchableOpacity')[1];following=true;await toggle.props.onPress();assert.equal(screen.writes[0][0],'follow');assert.equal(screen.counts,1);
  list=nodes(screen.render(),'FlatList')[0];row=list.props.renderItem({item:list.props.data[0]});assert.equal(nodes(row,'TouchableOpacity')[1].props.accessibilityLabel,'Unfollow Fixture');
  nodes(row,'TouchableOpacity')[0].props.onPress();assert.deepEqual(screen.history,['close','/(tabs)/user/target']);
  const self=list.props.renderItem({item:{_id:'actor',username:'Actor'}});assert.equal(nodes(self,'TouchableOpacity').length,1);
});

test('closed/nonpeople sheets unmount content and reopening gets new request lifetime',()=>{
  const render=props=>fixture('src/components/modals/UserListModal.js','UserListModal',props,{UserListContent:'UserListContent'}).render();
  assert.equal(render({visible:false,stat:'Followers'}),null);assert.equal(render({visible:true,stat:'Trips'}),null);assert.equal(render({visible:true,stat:'Followers'}).type.name,'UserListContent');
});

test('profile follow control refreshes actual counts and replaces privacy-dependent tabs on follow and unfollow',async()=>{
  const {profileStats}=load('src/utils/profileData.js','({profileStats})');
  let focus,memoIndex=0,following=false;const memos=[];let writes=0;let pending=deferred();const context={userId:'actor',isCurrent:()=>true};
  const screen=fixture('src/screens/profile/ProfileScreen.js','ProfileScreen',{}, {
    useTripSocialStore:select=>select({deletionRevision:0}),...native,StyleSheet:{create:x=>x},useRequireAuth:()=>true,useResolvedTheme:()=> 'light',lightTheme:theme,darkTheme:theme,
    useLocalSearchParams:()=>({userId:'target'}),useAuthStore:select=>select({user:{_id:'actor'},logout(){}}),useProfileContext:()=>context,
    createProfileData,profileStats,createFollowActions,followUser:async()=>{writes++;await pending.promise;following=true;},unfollowUser:async()=>{writes++;following=false;},
    getPublicUserById:async()=>({_id:'target',isFollowing:following,followersCount:following?1:0,totalTrips:following?3:1}),getUserById:()=>{throw Error('wrong route');},ProfileTabsLayout:'ProfileTabsLayout',
    useMemo:(create,deps)=>{const index=memoIndex++,previous=memos[index];if(!previous||deps.some((value,i)=>value!==previous.deps[i]))memos[index]={value:create(),deps};return memos[index].value;},
    useSyncExternalStore:(_subscribe,get)=>get(),useCallback:callback=>callback,useFocusEffect:callback=>{focus=callback;},
  });
  const render=()=>{memoIndex=0;return screen.render();};render();focus();await tick();
  let layout=nodes(render(),'ProfileTabsLayout')[0];assert.equal(layout.props.key,'not-following');assert.equal(layout.props.summaryData.stats.totalTrips,1);
  const first=layout.props.summaryData.onFollowToggle();await layout.props.summaryData.onFollowToggle();assert.equal(writes,1);assert.equal(nodes(render(),'ProfileTabsLayout')[0].props.summaryData.followBusy,true);
  pending.resolve();await first;layout=nodes(render(),'ProfileTabsLayout')[0];assert.equal(layout.props.key,'following');assert.equal(layout.props.summaryData.stats.totalTrips,3);assert.equal(layout.props.summaryData.stats.followers,1);
  await layout.props.summaryData.onFollowToggle();layout=nodes(render(),'ProfileTabsLayout')[0];assert.equal(layout.props.key,'not-following');assert.equal(layout.props.summaryData.stats.totalTrips,1);assert.equal(writes,2);
});
