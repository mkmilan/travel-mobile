const test = require('node:test');
const assert = require('node:assert/strict');
const { load, fixture, nodes, native, theme } = require('./helpers/component-fixture.cjs');
const {createFollowActions}=load('src/utils/followActions.js','({createFollowActions})');
const { createProfileData, profileStats, profileDistance } = load('src/utils/profileData.js', '({createProfileData, profileStats, profileDistance})');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('profile maps the actual server counters and displays short distances in meters and longer distances in kilometers', () => {
  const stats = profileStats({totalDistance:3,totalTrips:1,totalRecommendations:2,totalPois:3,followersCount:4,followingCount:5});
  assert.deepEqual(JSON.parse(JSON.stringify(stats)),{totalDistance:3,totalTrips:1,recommendationCount:2,poi:3,followers:4,following:5});
  assert.equal(profileDistance(stats.totalDistance),'3 m'); assert.equal(profileDistance(1250),'1.3 km'); assert.equal(profileDistance(0),'0 m');
  const pressed=[];
  const tree=fixture('src/screens/profile/ProfileSummary.js','ProfileSummary',{displayedUser:{_id:'one'},isSelf:true,stats,colors:{},onStatPress:value=>pressed.push(value)},
    {...native,baseTheme:theme,StyleSheet:{create:x=>x},Feather:'Feather',Avatar:'Avatar',Link:'Link',profileDistance}).render();
  const cards=nodes(tree,'TouchableOpacity').filter(node=>node.props.accessibilityLabel);
  assert.equal(cards.length,6); cards.forEach(card=>card.props.onPress());
  assert.deepEqual(pressed,['Trips','Distance','Followers','Following','Recs','POIs']);
  assert.equal(cards[1].props.accessibilityLabel,'Distance: 3 m');
});

test('profile refresh is single flight, maps success, preserves confirmed counters on failure, and retry recovers', async () => {
  const pending=deferred(); let calls=0; let failure=false;
  const profile=createProfileData(()=>{calls++;if(calls===1)return pending.promise;if(failure)throw Error('offline');return {_id:'one',totalTrips:2};},()=>true);
  assert.equal(profile.getSnapshot().user,null);
  const first=profile.refresh(); assert.equal(profile.refresh(),first); await tick();assert.equal(calls,1);
  pending.resolve({_id:'one',totalTrips:1});await first;assert.equal(profile.getSnapshot().user.totalTrips,1);
  failure=true;await profile.refresh();assert.equal(profile.getSnapshot().user.totalTrips,1);assert.equal(profile.getSnapshot().error,'offline');
  failure=false;await profile.refresh();assert.equal(profile.getSnapshot().user.totalTrips,2);assert.equal(profile.getSnapshot().error,null);
});

test('stale profile/login response, retry and mutation callback cannot update a replacement context', async () => {
  let current=true;const pending=deferred();let calls=0;
  const old=createProfileData(()=>{calls++;return pending.promise;},()=>current);
  const first=old.refresh();await tick(); current=false;
  const replacement=createProfileData(async()=>({_id:'new',totalTrips:9}),()=>true);await replacement.refresh();
  pending.resolve({_id:'old',totalTrips:1});await first;await old.refresh();old.updateUser({totalTrips:100});
  assert.equal(calls,1);assert.equal(old.getSnapshot().user,null);assert.equal(replacement.getSnapshot().user.totalTrips,9);
});

test('ProfileScreen focus reloads instead of auth snapshot zeros; error offers retry rather than endless spinner', async () => {
  const contexts=[{isCurrent:()=>true}];let context=contexts[0],focus,calls=0,memoIndex=0;const memos=[];
  let request=async()=>{calls++;return {_id:'self',totalTrips:calls};};
  const screen=fixture('src/screens/profile/ProfileScreen.js','ProfileScreen',{}, {
    ...native,StyleSheet:{create:x=>x},useRequireAuth:()=>true,useResolvedTheme:()=> 'light',lightTheme:theme,darkTheme:theme,
    useLocalSearchParams:()=>({}),useAuthStore:select=>select({user:{_id:'self',totalTrips:0},logout(){}}),useProfileContext:()=>context,
    createProfileData,profileStats,createFollowActions,followUser:()=>{},unfollowUser:()=>{},getUserById:()=>request(),getPublicUserById:()=>{throw Error('wrong route');},ProfileTabsLayout:'ProfileTabsLayout',
    useMemo:(create,next)=>{const index=memoIndex++;const previous=memos[index];if(!previous||next.some((value,i)=>value!==previous.deps[i]))memos[index]={value:create(),deps:next};return memos[index].value;},
    useSyncExternalStore:(_subscribe,get)=>get(),useCallback:callback=>callback,useFocusEffect:callback=>{focus=callback;},
  });
  const render=()=>{memoIndex=0;return screen.render();};
  assert.equal(nodes(render(),'ActivityIndicator').length,1);focus();await tick();
  assert.equal(nodes(render(),'ProfileTabsLayout')[0].props.summaryData.stats.totalTrips,1);
  focus();await tick();assert.equal(nodes(render(),'ProfileTabsLayout')[0].props.summaryData.stats.totalTrips,2);
  context={isCurrent:()=>true};request=async()=>{throw Error('offline');};
  assert.equal(nodes(render(),'ProfileTabsLayout').length,0);focus();await tick();
  const failed=render();assert.equal(nodes(failed,'ActivityIndicator').length,0);assert.equal(nodes(failed,'Pressable').length,1);
});

test('all six tile actions reach appropriate existing tabs or typed detail sheets, never generic user sheets', () => {
  const nav=[];const screen=fixture('src/screens/profile/ProfileTabsLayout.js','ProfileTabsLayout',
    {userId:'one',summaryData:{stats:{totalTrips:1,recommendationCount:1}}},{TopTabs:{Navigator:'Navigator',Screen:'Screen'},createMaterialTopTabNavigator:()=>({Navigator:'Navigator',Screen:'Screen'}),Feather:'Feather',useSafeAreaInsets:()=>({top:0}),OverviewTab:'OverviewTab',TripsTab:'TripsTab',RecommendationsTab:'RecommendationsTab',ProfileGallery:'ProfileGallery',UserListModal:'UserListModal',ProfileStatModal:'ProfileStatModal'});
  const overview=nodes(screen.render(),'Screen')[0].children[0]({navigation:{navigate:name=>nav.push(name)}});
  for(const label of ['Trips','Recs'])overview.props.onStatPress(label);
  assert.deepEqual(nav,['Trips','Recs']);assert.equal(nodes(screen.render(),'UserListModal').length,0);
  for(const label of ['Followers','Following']){overview.props.onStatPress(label);const tree=screen.render();assert.equal(nodes(tree,'UserListModal')[0].props.stat,label);assert.equal(nodes(tree,'ProfileStatModal').length,0);}
  for(const label of ['Distance','POIs']){overview.props.onStatPress(label);const tree=screen.render();assert.equal(nodes(tree,'ProfileStatModal')[0].props.stat,label);assert.equal(nodes(tree,'UserListModal').length,0);}
});

test('Overview returns refresh once, has pull-to-refresh, and uses the resolved page background', () => {
  let focus,calls=0;const onRefresh=()=>calls++;
  const screen=fixture('src/screens/profile/tabs/OverviewTab.js','OverviewTab',{summaryData:{onRefresh,refreshing:false,colors:{background:'light'}}},{...native,RefreshControl:'RefreshControl',ProfileSummary:'ProfileSummary',useCallback:f=>f,useFocusEffect:f=>{focus=f;}});
  screen.render();focus();assert.equal(calls,0);focus();assert.equal(calls,1);
  const scroll=nodes(screen.render(),'ScrollView')[0];scroll.props.refreshControl.props.onRefresh();assert.equal(calls,2);assert.equal(scroll.props.style.backgroundColor,'light');
});

test('POI API uses existing authenticated visibility endpoint, retaining page and limit without CSRF', async () => {
  let seen;const get=load('src/services/api.js','(apiFetch=request,getUserPois)',{Constants:{expoConfig:{extra:{API_URL:'https://fixture.invalid/api'}}},Updates:{},URLSearchParams,console:{log(){},error(){}},request:async(path,options)=>{seen={path,options};return {data:[]};}});
  await get('one',2,15);assert.equal(seen.path,'/users/one/pois?page=2&limit=15');assert.equal(seen.options.method,'GET');assert.notEqual(seen.options.auth,false);assert.notEqual(seen.options.csrf,true);
});

test('POI list opens its parent trip only after closing; distance uses no POI request', () => {
  const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');let scope={isCurrent:()=>true};let list,memoDeps;const history=[];
  const props={stat:'POIs',userId:'one',stats:{totalTrips:1,totalDistance:3},onClose:()=>history.push('close')};
  const screen=fixture('src/components/modals/ProfileStatModal.js','ProfileStatModal',props,{...native,theme,BottomModal:'BottomModal',ModalHeader:'ModalHeader',ProfileListStatus:'ProfileListStatus',profileDistance,useProfileContext:()=>scope,useRouter:()=>({push:path=>history.push(path)}),getUserPois:async()=>({data:[],totalPages:0}),createPagedList,useMemo:(create,deps)=>{if(!memoDeps||deps.some((value,i)=>value!==memoDeps[i])){list=create();memoDeps=deps;}return list;},useSyncExternalStore:(_subscribe,get)=>get()});
  const row=nodes(screen.render(),'FlatList')[0].props.renderItem({item:{_id:'poi',tripId:'trip',tripTitle:'Fixture',name:'Stop'}});row.props.onPress();assert.deepEqual(history,['close','/(tabs)/trip/trip']);
  scope.isCurrent=()=>false;row.props.onPress();assert.equal(history.length,2);
  props.stat='Distance';assert.equal(nodes(screen.render(),'FlatList').length,0);assert.equal(list.getSnapshot().loaded,true);
});

test('profile context rejects closed, switched and same-token logout/login completions', () => {
  let state={token:'one',user:{_id:'actor'}},subscriber,cleanup,context;
  const store=select=>select(state);store.getState=()=>state;store.subscribe=fn=>{subscriber=fn;return ()=>{};};
  const screen=fixture('src/hooks/useProfileContext.js','useProfileContext','target',{useAuthStore:store,useEffect:fn=>{cleanup=fn();}});
  context=screen.render();assert.equal(context.isCurrent(),true);
  const before=state;state={token:null,user:null};subscriber(state,before);state=before;subscriber(state,{token:null,user:null});
  assert.equal(context.isCurrent(),false);const next=screen.render();assert.notEqual(next,context);assert.equal(next.isCurrent(),true);
  cleanup();assert.equal(next.isCurrent(),false);
});
