const test = require('node:test');
const assert = require('node:assert/strict');
const {read, load, fixture, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const {ENABLE_POI_UI} = require('../src/constants/featureFlags');
const style = {create:x=>x};
const profileDistance = value => `${value} m`;
const session = {user:{_id:'owner'},token:'session',isAuthenticated:true};

test('POI presentation defaults off without changing stored profile counters', () => {
  assert.equal(ENABLE_POI_UI,false);
  const {profileStats} = load('src/utils/profileData.js','({profileStats})');
  const stats=profileStats({totalPois:7,totalTrips:1,totalDistance:3});
  assert.equal(stats.poi,7);
  for (const enabled of [false,true]) {
    const tree=fixture('src/screens/profile/ProfileSummary.js','ProfileSummary',{displayedUser:{},stats,colors:{}},
      {...native,ENABLE_POI_UI:enabled,baseTheme:theme,StyleSheet:style,Feather:'Feather',Avatar:'Avatar',Link:'Link',useViewerUnits: () => "metric", profileDistance}).render();
    const cards=nodes(tree,'TouchableOpacity').filter(n=>n.props.accessibilityLabel && n.props.accessibilityLabel.includes(':'));
    assert.equal(cards.length,enabled?6:5);
    assert.equal(cards.some(n=>n.props.accessibilityLabel==='POIs: 7'),enabled);
  }
});

test('recording screens hide POI creation but retain upload-only legacy repair, recommendations and recording controls', () => {
  for (const enabled of [false,true]) for (const status of ['idle','recording','paused','stopped']) {
    const screen=fixture('app/(tabs)/record/index.js','RecordScreen',{}, {
      ...native,ENABLE_POI_UI:enabled,theme,StyleSheet:style,
      useAuthStore:Object.assign(select=>select(session),{getState:()=>session}),
      RecordingButton:'RecordingButton',TripSaveModal:'TripSaveModal',AddPoiModal:'AddPoiModal',AddRecommendationModal:'AddRecommendationModal',
    });
    screen.setState(0,status);screen.setState(7,false);
    const tree=screen.render(),buttons=nodes(tree,'RecordingButton').map(n=>n.props.icon);
    assert.equal(nodes(tree,'AddPoiModal').length,enabled?2:1);
    assert.equal(nodes(tree,'AddRecommendationModal').length,1);
    if(['recording','paused'].includes(status)) {
      assert.equal(buttons.includes('location-sharp'),enabled);
      assert.ok(buttons.includes('star'));assert.ok(buttons.includes('stop'));
      assert.ok(buttons.includes(status==='recording'?'pause':'play'));
    }
  }
});

test('trip details hide the entire POI section for empty and populated trips and restore existing controls', () => {
  const components=Object.fromEntries(['CommentList','TripRecommendationCard','TransportIcon','TripMapThumbnail','AddCommentModal','AddRecommendationModal','LikersModal','MapModal','RecommendationDetailModal','IconStatDisplay','PhotoGallery','Section','SocialButton','Avatar','Feather'].map(n=>[n,n]));
  for (const enabled of [false,true]) for (const count of [0,4]) {
    const screen=fixture('app/(tabs)/trip/[id].js','TripDetailScreen',{}, {
      ...native,...components,ENABLE_POI_UI:enabled,theme,StyleSheet:style,getPoiNote:p=>p.note,
      useAuthStore:Object.assign(()=>session,{getState:()=>session}),useRouter:()=>({push(){}}),useNavigation:()=>({getState:()=>({index:0,routes:[{name:'(tabs)'}]})}),useLocalSearchParams:()=>({id:'trip'}),
      useTripSocialStore:()=>({setRecCount(){},setLikeState(){},setCommentCount(){}}),useCallback:f=>f,useFocusEffect(){},
      useViewerUnits: () => "metric", speedUnit: () => "km/h", calcAvgSpeed:()=>1,kmOrMiles:()=> '1 km',msToDuration:()=>'',isoToDate:()=>'',lineStringToCoords:()=>[],
    });
    screen.setState(0,{_id:'trip',user:session.user,pointsOfInterest:Array.from({length:count},(_,i)=>({_id:`p${i}`,note:'Saved'}))});screen.setState(1,false);
    const sections=nodes(screen.render(),'Section');
    assert.equal(sections.some(n=>n.props.title==='Points of Interest'),enabled);
    assert.ok(sections.some(n=>n.props.title==='Places from this trip'));
    if(enabled&&count)assert.equal(typeof sections.find(n=>n.props.title==='Points of Interest').props.onSeeAll,'function');
  }
});

test('profile rejects stale POI actions and direct hidden list mounting performs no fetch', async () => {
  const screen=fixture('src/screens/profile/ProfileTabsLayout.js','ProfileTabsLayout',{summaryData:{stats:{}},userId:'owner'}, {
    createMaterialTopTabNavigator:()=>({Navigator:'Navigator',Screen:'Screen'}),Feather:'Feather',useSafeAreaInsets:()=>({top:0}),OverviewTab:'OverviewTab',TripsTab:'TripsTab',RecommendationsTab:'RecommendationsTab',ProfileGallery:'ProfileGallery',UserListModal:'UserListModal',ProfileStatModal:'ProfileStatModal',
  });
  const overview=nodes(screen.render(),'Screen')[0].children[0]({navigation:{navigate(){}}});
  overview.props.onStatPress('POIs');assert.equal(nodes(screen.render(),'ProfileStatModal').length,0);
  overview.props.onStatPress('Distance');assert.equal(nodes(screen.render(),'ProfileStatModal')[0].props.stat,'Distance');
  let requests=0;const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');
  const direct=fixture('src/components/modals/ProfileStatModal.js','ProfileStatModal',{stat:'POIs',userId:'owner',stats:{}},{
    useViewerUnits: () => "metric",
    useProfileContext:()=>({isCurrent:()=>true}),useMemo:f=>f(),useSyncExternalStore:(_s,get)=>get(),useRouter:()=>({}),useEffect:f=>f(),createPagedList,getUserPois:async()=>{requests++;return {data:[]};},
  });
  assert.equal(direct.render(),null);await new Promise(setImmediate);assert.equal(requests,0);
});

test('map hides saved POIs while preserving route and recommendation markers, with reversible POI restoration', () => {
  const route=[{lat:1,lon:2},{lat:3,lon:4}],pois=[{lat:5,lon:6}],recommendationMarkers=[{lat:7,lon:8}];
  for (const enabled of [false,true]) {
    const tree=fixture('src/components/map/InteractiveTripMap.js','InteractiveTripMap',{routeCoords:route,pois,recommendationMarkers},
      {...native,ENABLE_POI_UI:enabled,theme,StyleSheet:style,useMemo:f=>f(),MapView:'MapView',Marker:'Marker',Polyline:'Polyline'}).render();
    assert.equal(nodes(tree,'Polyline').length,1);
    assert.equal(nodes(tree,'Marker').length,enabled?2:1);
    assert.deepEqual({...nodes(tree,'Marker').at(-1).props.coordinate},{latitude:7,longitude:8});
    assert.equal(nodes(tree,'Polyline')[0].props.coordinates.length,2);
  }
  assert.match(read('src/components/modals/RecommendationDetailModal.js'),/recommendationMarkers=\{recPoi\}/);
});
