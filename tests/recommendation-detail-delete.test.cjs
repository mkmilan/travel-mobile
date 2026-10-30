const test=require('node:test');
const assert=require('node:assert/strict');
const {load,fixture,nodes,native,theme}=require('./helpers/component-fixture.cjs');
const {hooksFixture,authFixture}=require('./helpers/hooks-fixture.cjs');
const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const ids=value=>Array.from(value||[]);
const rec=()=>({_id:'rec',name:'Saved place',user:{_id:'actor'},photos:['photo','other']});
const {getPlaceCoordinate,getGoogleMapsDirectionsUrl}=load("src/utils/placeLocation.js","({getPlaceCoordinate,getGoogleMapsDirectionsUrl})");
const defaults={getPlaceCoordinate,getGoogleMapsDirectionsUrl,...native,theme,console:{log(){},warn(){},error(){}},StyleSheet:{create:x=>x},Feather:'Feather',Ionicons:'Ionicons',Avatar:'Avatar',BottomModal:'BottomModal',ModalHeader:'ModalHeader',InteractiveTripMap:'InteractiveTripMap',PhotoGallery:'PhotoGallery',useRouter:()=>({push(){}})};
function detailEnvironment(props,remove,auth=authFixture()){
  const host=hooksFixture(),galleryHost=hooksFixture(),alerts=[];
  const useProfileContext=load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.store});
  const usePhotoManager=load('src/hooks/usePhotoManager.js','usePhotoManager',{...host.hooks,useProfileContext,deleteRecommendationPhoto:remove});
  const detail=fixture('src/components/modals/RecommendationDetailModal.js','RecommendationDetailModal',props,{...defaults,...host.hooks,useProfileContext,usePhotoManager,useAuthStore:auth.store});
  const galleryProps={};
  const gallery=fixture('src/components/trip/PhotoGallery.js','PhotoGallery',galleryProps,{...defaults,...galleryHost.hooks,Image:'Image',ImageViewing:'ImageViewing',Dimensions:{get:()=>({width:400})},Alert:{alert:(...args)=>alerts.push(args)},usePhotoSource:()=>({mediaKey:'session',getPhotoSource:id=>({uri:id})})});
  const render=()=>host.render(()=>detail.render());
  const renderGallery=()=>{const node=nodes(render(),'PhotoGallery')[0];if(!node)return null;Object.assign(galleryProps,node.props);return galleryHost.render(()=>gallery.render());};
  return {host,auth,props,alerts,render,renderGallery,confirm(){const list=nodes(renderGallery(),'FlatList')[0];const thumb=list.props.renderItem({item:'photo'});thumb.props.onLongPress();return alerts.at(-1)[2].find(button=>button.text==='Delete').onPress;}};
}

function pairedScreen(kind,remove){
  const auth=authFixture(),host=hooksFixture(),props={};let reads=0,serverRec=rec();
  const loader=async()=>{reads++;return {data:[serverRec],totalPages:1};};
  const list=createPagedList(loader),route={id:'trip',params:{}};
  const components=Object.fromEntries(['ProfileListStatus','TripRecommendationCard','RecommendationCard','RecommendationDetailModal','AddRecommendationModal','CommentList','TransportIcon','TripMapThumbnail','AddCommentModal','LikersModal','MapModal','IconStatDisplay','Section','SocialButton','RefreshControl'].map(x=>[x,x]));
  const dependencies={...defaults,...components,...host.hooks,useAuthStore:auth.store,useNavigation:()=>({setParams(){},getState:()=>({index:0,routes:[{name:'(tabs)'}]})}),useRoute:()=>route,getRecommendationsByUser:loader,useProfileList:()=>({...list.getSnapshot(),identity:list,initialLoading:!list.getSnapshot().loaded,ensureLoaded:list.ensureLoaded,refresh:list.refresh,loadMore:list.loadMore,setItems:list.setItems}),lineStringToCoords:()=>[],getTripJsonById:async()=>{reads++;return {_id:route.id,user:{_id:'actor'},recommendations:[serverRec],likes:[],comments:[]};},useLocalSearchParams:()=>route,useTripSocialStore:()=>({setRecCount(){},setLikeState(){},setCommentCount(){}}),BackHandler:{addEventListener:()=>({remove(){}})},useViewerUnits: () => "metric", speedUnit: () => "km/h", calcAvgSpeed:()=>1,kmOrMiles:()=> '1 km',msToDuration:()=>'',getPoiNote:()=>'',isoToDate:()=>''};
  const parent=kind==='profile'?fixture('src/screens/profile/tabs/RecommendationsTab.js','RecommendationsTab',{userId:'actor',isSelf:true},dependencies):fixture('app/(tabs)/trip/[id].js','TripDetailScreen',{},dependencies);
  const detail=detailEnvironment(props,remove,auth);
  const renderParent=()=>host.render(()=>parent.render());
  const render=()=>{const tree=renderParent(),node=nodes(tree,'RecommendationDetailModal')[0];Object.assign(props,node?.props||{isVisible:false,recommendation:null});detail.render();return detail.render();};
  return {...detail,host:detail.host,parentHost:host,route,list,reads:()=>reads,setServer:next=>{serverRec=next;},renderParent,render,async open(){if(kind==='profile')await list.ensureLoaded();else{renderParent();await tick();}const tree=renderParent();if(kind==='profile'){const flat=nodes(tree,'FlatList')[0];await flat.props.renderItem({item:flat.props.data[0]}).props.onPress();}else nodes(tree,'TripRecommendationCard')[0].props.onPress();render();},selected(){return nodes(renderParent(),'RecommendationDetailModal')[0].props.recommendation;}};
}

test('actual profile and trip detail/gallery pairs retain failed thumbnail, single-flight repeated confirmations and retry confirmed deletion',async()=>{
  for(const kind of ['profile','trip']){
    const pending=deferred();let writes=0;const screen=pairedScreen(kind,()=>{writes++;return writes===1?pending.promise:Promise.resolve();});await screen.open();
    const confirm=screen.confirm(),work=confirm();assert.equal(confirm(),work);await tick();
    let tree=screen.render();assert.equal(writes,1);assert.equal(nodes(tree,'PhotoGallery')[0].props.deleteDisabled,true);assert.deepEqual(ids(screen.selected().photos),['photo','other']);
    const pendingGallery=screen.renderGallery(),thumb=nodes(pendingGallery,'FlatList')[0].props.renderItem({item:'photo'});assert.equal(thumb.props.onLongPress,undefined);
    pending.reject(Error('offline'));assert.equal(await work,false);tree=screen.render();
    assert.deepEqual(ids(nodes(tree,'PhotoGallery')[0].props.photoIds),['photo','other']);assert.deepEqual(ids(screen.selected().photos),['photo','other']);
    assert.ok(nodes(tree,'Text').some(node=>node.props.accessibilityRole==='alert'&&node.children.join('').includes('offline')));assert.equal(nodes(tree,'PhotoGallery')[0].props.deleteDisabled,false);
    // A list GET cannot erase the failed selected thumbnail, even when selection is independent.
    const oldReads=screen.reads();await screen.props.onRefresh();screen.render();assert.ok(screen.reads()>oldReads);assert.deepEqual(ids(screen.selected().photos),['photo','other']);
    screen.setServer({...rec(),photos:['other']});const retry=nodes(tree,'Pressable').find(node=>node.props.testID==='recommendation-photo-delete-retry').props.onPress;assert.equal(await retry(),true);tree=screen.render();
    assert.equal(writes,2);assert.deepEqual(ids(screen.selected().photos),['other']);assert.deepEqual(ids(nodes(tree,'PhotoGallery')[0].props.photoIds),['other']);assert.equal(nodes(tree,'Text').some(node=>node.props.accessibilityRole==='alert'),false);
  }
});

test('detail/gallery stale Alert confirmations cannot DELETE after close, reopen, other selection, account change or unmount',async()=>{
  for(const change of ['close','reopen','selection','account','same-token-login','unmount']){
    let writes=0;const props={isVisible:true,recommendation:rec(),tripUserId:'actor',onClose(){}};const screen=detailEnvironment(props,async()=>writes++);screen.render();const confirm=screen.confirm();
    if(change==='close'||change==='reopen'){nodes(screen.render(),'ModalHeader')[0].props.onClose();if(change==='reopen'){props.isVisible=false;screen.render();props.isVisible=true;screen.render();}}
    if(change==='selection'){props.recommendation={...rec(),_id:'replacement'};screen.render();}
    if(change==='account')screen.auth.set({token:'other',user:{_id:'other'}});
    if(change==='same-token-login'){screen.auth.set({token:null,user:null});screen.auth.set({token:'session-one',user:{_id:'actor'}});}
    if(change==='unmount')screen.host.unmount();
    assert.equal(await confirm(),false);assert.equal(writes,0);
  }
});

test('detail late DELETE success/failure cannot patch or refresh a closed, replaced, logged-out or unmounted view',async()=>{
  for(const change of ['close','reopen','selection','account','same-token-login','unmount'])for(const reject of [false,true]){
    const pending=deferred();let writes=0,updates=0,refreshes=0;
    const props={isVisible:true,recommendation:rec(),tripUserId:'actor',onClose(){},onPhotoDeleted:()=>updates++,onRefresh:()=>refreshes++};
    const screen=detailEnvironment(props,()=>{writes++;return pending.promise;});screen.render();const work=screen.confirm()();await tick();
    if(change==='close'||change==='reopen'){props.isVisible=false;screen.render();if(change==='reopen'){props.isVisible=true;screen.render();screen.render();}}
    if(change==='selection'){props.recommendation={...rec(),_id:'replacement'};screen.render();screen.render();}
    if(change==='account')screen.auth.set({token:'other',user:{_id:'other'}});
    if(change==='same-token-login'){screen.auth.set({token:null,user:null});screen.auth.set({token:'session-one',user:{_id:'actor'}});}
    if(change==='unmount')screen.host.unmount();
    reject?pending.reject(Error('late failure')):pending.resolve();assert.equal(await work,false);assert.equal(writes,1);assert.equal(updates,0);assert.equal(refreshes,0);
    if(change==='reopen'||change==='selection'){const tree=screen.render();assert.deepEqual(ids(nodes(tree,'PhotoGallery')[0].props.photoIds),['photo','other']);assert.equal(nodes(tree,'Text').some(node=>node.props.accessibilityRole==='alert'),false);}
  }
});

test('read-only detail never deletes; confirmed DELETE with failed refresh is not retried as a write',async()=>{
  let writes=0,updates=0,reads=0;const props={isVisible:true,recommendation:rec(),tripUserId:'actor',readOnly:true,onClose(){},onPhotoDeleted:()=>updates++,onRefresh:async()=>{reads++;throw Error('refresh offline');}};
  const screen=detailEnvironment(props,async()=>writes++);screen.render();let gallery=nodes(screen.render(),'PhotoGallery')[0];assert.equal(gallery.props.canDelete,false);assert.equal(await gallery.props.onDelete('photo'),false);assert.equal(writes,0);
  props.readOnly=false;gallery=nodes(screen.render(),'PhotoGallery')[0];assert.equal(await gallery.props.onDelete('photo'),true);assert.equal(writes,1);assert.equal(updates,1);assert.equal(reads,1);assert.deepEqual(ids(nodes(screen.render(),'PhotoGallery')[0].props.photoIds),['other']);
});

test('actual trip caller hides old detail immediately when the route or login epoch changes',async()=>{
  for(const change of ['route','epoch']){
    const screen=pairedScreen('trip',async()=>{});await screen.open();assert.equal(screen.props.isVisible,true);
    if(change==='route')screen.route.id='replacement';else screen.auth.set({...screen.auth.store.getState(),sessionEpoch:1});
    screen.render();assert.equal(screen.props.isVisible,false);assert.equal(screen.props.recommendation,null);
  }
});


test('actual profile/trip detail keeps dismissal blocked only during DELETE, then confirmed photo stays gone after reopen',async()=>{
  for(const kind of ['profile','trip']){
    const pending=deferred();let writes=0;const screen=pairedScreen(kind,()=>{writes++;return pending.promise;});await screen.open();
    const work=screen.confirm()();await tick();let tree=screen.render();
    tree.props.onClose();nodes(tree,'ModalHeader')[0].props.onClose();screen.render();assert.equal(screen.props.isVisible,true);
    screen.setServer({...rec(),photos:['other']});pending.resolve();assert.equal(await work,true);await tick();
    tree=screen.render();nodes(tree,'ModalHeader')[0].props.onClose();screen.render();assert.equal(screen.props.isVisible,false);
    await screen.open();assert.deepEqual(ids(screen.selected().photos),['other']);assert.deepEqual(ids(nodes(screen.render(),'PhotoGallery')[0].props.photoIds),['other']);assert.equal(writes,1);
  }
});

test('a slow read-only refresh does not silently swallow deletion of a second photo',async()=>{
  const refresh=deferred();let writes=0;
  const props={isVisible:true,recommendation:rec(),tripUserId:'actor',onClose(){},onPhotoDeleted(){},onRefresh:()=>refresh.promise};
  const screen=detailEnvironment(props,async()=>writes++);screen.render();
  assert.equal(await nodes(screen.render(),'PhotoGallery')[0].props.onDelete('photo'),true);
  assert.equal(await nodes(screen.render(),'PhotoGallery')[0].props.onDelete('other'),true);assert.equal(writes,2);
  refresh.resolve();await tick();assert.equal(nodes(screen.render(),'PhotoGallery').length,0);
});


test('trip detail resumes its read after an auth transition settles without a second epoch change',async()=>{
  const screen=pairedScreen('trip',async()=>{});await screen.open();const before=screen.reads();
  screen.auth.set({...screen.auth.store.getState(),sessionEpoch:1,isSessionChanging:true});screen.render();await tick();assert.equal(screen.reads(),before);
  screen.setServer({...rec(),name:'Current session place'});screen.auth.set({...screen.auth.store.getState(),isSessionChanging:false});screen.render();await tick();
  assert.ok(screen.reads()>before);assert.equal(nodes(screen.renderParent(),'TripRecommendationCard')[0].props.rec.name,'Current session place');assert.equal(screen.props.isVisible,false);
});
