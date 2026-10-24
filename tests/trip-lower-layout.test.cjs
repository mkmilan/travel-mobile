const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture,nodes,native,theme} = require('./helpers/component-fixture.cjs');
const tick = () => new Promise(setImmediate);
const components = Object.fromEntries(['CommentList','TripRecommendationCard','TransportIcon','TripMapThumbnail','AddCommentModal','AddRecommendationModal','LikersModal','MapModal','RecommendationDetailModal','IconStatDisplay','PhotoGallery','Section','SocialButton','Avatar','Feather'].map(name=>[name,name]));
function screenFor(overrides={}, actor='owner', loadTrip=async()=>{throw Error('Refresh permission denied');}) {
  let session={user:{_id:actor},token:'fixture-session',sessionEpoch:1,isAuthenticated:true};
  const calls={alerts:[],likers:[],comments:[],likes:[],photos:[],deletes:[],navigation:[]};
  const recommendations=Array.from({length:4},(_,i)=>({_id:`rec-${i}`,name:`Place ${i}`,user:{_id:'owner'},photos:[]}));
  const trip={_id:'trip',user:{_id:'owner'},title:'Saved journey',recommendations,photos:['photo-a','photo-b'],commentsCount:2,comments:['comment-a','comment-b'],...overrides};
  const screen=fixture('app/(tabs)/trip/[id].js','TripDetailScreen',{}, {
    ...native,...components,theme,StyleSheet:{create:x=>x},
    console:{log(){},error(){}},Alert:{alert:(...args)=>calls.alerts.push(args)},
    useAuthStore:Object.assign(()=>session,{getState:()=>session}),
    useRouter:()=>({push:path=>calls.navigation.push(path)}),useLocalSearchParams:()=>({id:'trip'}),
    useTripSocialStore:()=>({setRecCount(){},setLikeState(){},setCommentCount(){}}),useCallback:f=>f,useFocusEffect(){},
    calcAvgSpeed:()=>1,kmOrMiles:()=> '1 km',msToDuration:()=>'',isoToDate:()=>'',lineStringToCoords:()=>[],
    getTripJsonById:loadTrip,
    getTripLikers:async id=>{calls.likers.push(id);return [{_id:'liker'}];},
    getTripComments:async id=>{calls.comments.push(id);return [{_id:'comment-a'},{_id:'comment-b'}];},
    likeTrip:async id=>calls.likes.push(id),unlikeTrip:async()=>{},
    deleteTripPhoto:async(...args)=>calls.photos.push(args),deleteRecommendation:async id=>calls.deletes.push(id),
  });
  screen.setState(0,trip);screen.setState(1,false);screen.setState(14,8);
  return {...screen,calls,trip,switchSession(){session={...session,user:{_id:'other'},token:'next',sessionEpoch:2};}};
}
const section=(tree,title)=>nodes(tree,'Section').find(node=>node.props.title===title);
const social=(tree,icon)=>nodes(tree,'SocialButton').find(node=>node.props.iconName===icon);

test('single trip puts gallery above places, keeps top/map/stats, and hides the empty gallery entirely',()=>{
  for(const photos of [undefined,[],['photo-a']]) {
    const screen=screenFor({photos}),tree=screen.render(),all=nodes(tree);
    const gallery=nodes(tree,'PhotoGallery')[0],places=section(tree,'Places from this trip');
    assert.ok(places);assert.equal(nodes(tree,'TripMapThumbnail').length,1);assert.equal(nodes(tree,'IconStatDisplay').length,5);
    assert.equal(!!gallery,!!photos?.length);
    if(gallery){assert.ok(all.indexOf(gallery)<all.indexOf(places));assert.equal(gallery.props.photoIds,photos);}
    assert.equal(section(tree,'Photo Gallery'),undefined);assert.equal(section(tree,'Points of Interest'),undefined);
    assert.equal(nodes(tree,'Text').some(n=>n.children.includes('No photos yet.')),false);
    assert.equal(section(tree,'Comments'),undefined);
  }
});

test('places expand/collapse without replacing records, and empty places retain their message',()=>{
  const screen=screenFor();let tree=screen.render();
  assert.equal(nodes(tree,'TripRecommendationCard').length,3);
  section(tree,'Places from this trip').props.onSeeAll();tree=screen.render();
  assert.equal(nodes(tree,'TripRecommendationCard').length,4);assert.equal(section(tree,'Places from this trip').props.isExpanded,true);
  section(tree,'Places from this trip').props.onSeeAll();assert.equal(nodes(screen.render(),'TripRecommendationCard').length,3);
  tree=screenFor({recommendations:[]}).render();assert.equal(nodes(tree,'TripRecommendationCard').length,0);
  assert.ok(nodes(tree,'Text').some(n=>n.children.includes('No recommendations added.')));
  assert.equal(section(tree,'Places from this trip').props.onSeeAll,undefined);
});

test('card press opens existing detail with same record; only owner receives long-press delete',async()=>{
  for(const owner of [true,false]) {
    const screen=screenFor({},owner?'owner':'visitor');let tree=screen.render(),card=nodes(tree,'TripRecommendationCard')[0];
    assert.equal(card.props.rec,screen.trip.recommendations[0]);assert.equal(typeof card.props.onLongPress,owner?'function':'undefined');
    card.props.onPress();tree=screen.render();const detail=nodes(tree,'RecommendationDetailModal')[0];
    assert.equal(detail.props.isVisible,true);assert.equal(detail.props.recommendation,card.props.rec);
    detail.props.onClose();assert.equal(nodes(screen.render(),'RecommendationDetailModal')[0].props.isVisible,false);
    if(owner){card.props.onLongPress();const prompt=screen.calls.alerts.at(-1);assert.equal(prompt[0],'Delete Recommendation');
      await prompt[2].find(button=>button.text==='Delete').onPress();assert.deepEqual(screen.calls.deletes,['rec-0']);assert.equal(nodes(screen.render(),'TripRecommendationCard')[0].props.rec._id,'rec-1');}
  }
});

test('saved card press cannot open recommendation detail after the session changes',()=>{
  const screen=screenFor();const card=nodes(screen.render(),'TripRecommendationCard')[0];screen.switchSession();card.props.onPress();
  assert.equal(nodes(screen.render(),'RecommendationDetailModal')[0].props.isVisible,false);
});

test('social comments toggle retains counts, explicit list expansion and close/reopen state',async()=>{
  const screen=screenFor();let tree=screen.render();assert.equal(social(tree,'message-circle').props.count,2);assert.equal(social(tree,'star').props.count,4);
  social(tree,'message-circle').props.onPress();tree=screen.render();assert.ok(section(tree,'Comments'));assert.equal(nodes(tree,'CommentList').length,0);
  const expand=nodes(section(tree,'Comments'),'TouchableOpacity').find(n=>nodes(n,'Text').some(t=>t.children.includes('View all 2 comments')));
  expand.props.onPress();await tick();tree=screen.render();assert.equal(nodes(tree,'CommentList')[0].props.comments.length,2);assert.deepEqual(screen.calls.comments,['trip']);
  social(tree,'message-circle').props.onPress();tree=screen.render();assert.equal(section(tree,'Comments'),undefined);
  social(tree,'message-circle').props.onPress();tree=screen.render();assert.ok(section(tree,'Comments'));assert.equal(nodes(tree,'CommentList').length,0);
});

test('heart and likers count keep separate actions; share remains a placeholder',async()=>{
  const screen=screenFor();let tree=screen.render();
  const heart=nodes(tree,'TouchableOpacity').find(n=>nodes(n,'Feather').some(icon=>icon.props.name==='heart'));
  const count=nodes(tree,'TouchableOpacity').find(n=>nodes(n,'Text').some(text=>text.children.includes(8)));
  assert.ok(heart);assert.ok(count);await heart.props.onPress();assert.deepEqual(screen.calls.likes,['trip']);
  count.props.onPress();await tick();tree=screen.render();assert.deepEqual(screen.calls.likers,['trip']);assert.equal(nodes(tree,'LikersModal')[0].props.isVisible,true);
  nodes(tree,'LikersModal')[0].props.onClose();assert.equal(nodes(screen.render(),'LikersModal')[0].props.isVisible,false);
  social(tree,'share-2').props.onPress();assert.equal(screen.calls.alerts.at(-1)[1],'Share functionality to be implemented.');
});

test('gallery preserves owner delete wiring and deletion refreshes its actual IDs',async()=>{
  for(const owner of [true,false]){
    const screen=screenFor({},owner?'owner':'visitor');const gallery=nodes(screen.render(),'PhotoGallery')[0];
    assert.equal(gallery.props.canDelete,owner);assert.equal(typeof gallery.props.onDelete,'function');
    if(owner){await gallery.props.onDelete('photo-a');assert.deepEqual(screen.calls.photos,[['trip','photo-a']]);assert.deepEqual(Array.from(nodes(screen.render(),'PhotoGallery')[0].props.photoIds),['photo-b']);}
  }
});

test('failed initial loads still show the actual error instead of empty galleries or places',()=>{
  const screen=screenFor();screen.setState(0,null);screen.setState(2,'Permission denied');const tree=screen.render();
  assert.ok(nodes(tree,'Text').some(node=>node.children.includes('Permission denied')));assert.equal(nodes(tree,'PhotoGallery').length,0);assert.equal(section(tree,'Places from this trip'),undefined);
});

test('empty gallery does not conceal a known refresh failure or discard loaded places',async()=>{
  const screen=screenFor({photos:[]});const tree=screen.render();
  await nodes(tree,'RecommendationDetailModal')[0].props.onRefresh();const refreshed=screen.render();
  assert.ok(nodes(refreshed,'Text').some(node=>node.props.accessibilityRole==='alert' && node.children.includes('Refresh permission denied')));
  assert.equal(nodes(refreshed,'PhotoGallery').length,0);assert.ok(section(refreshed,'Places from this trip'));
  assert.ok(nodes(refreshed,'Pressable').some(node=>node.props.testID==='trip-refresh-retry'));
});

const photoIdentity = screen => nodes(screen.render(),'TripRecommendationCard')[0].props.photoRefreshIdentity;
const refreshTrip = screen => nodes(screen.render(),'RecommendationDetailModal')[0].props.onRefresh();
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('thumbnail retry signal advances once per successful load, not rerenders, local edits or failed refreshes',async()=>{
  const pending=[];
  const screen=screenFor({},'owner',()=>{const task=deferred();pending.push(task);return task.promise;});
  const initial=photoIdentity(screen);
  assert.equal(photoIdentity(screen),initial);
  const failed=refreshTrip(screen);assert.equal(photoIdentity(screen),initial);
  pending[0].reject(Error('offline'));await failed;assert.equal(photoIdentity(screen),initial);
  const success=refreshTrip(screen);pending[1].resolve(screen.trip);await success;
  const accepted=photoIdentity(screen);assert.notEqual(accepted,initial);assert.equal(photoIdentity(screen),accepted);
  await nodes(screen.render(),'PhotoGallery')[0].props.onDelete('photo-a');
  assert.equal(photoIdentity(screen),accepted);
  const next=refreshTrip(screen);pending[2].resolve(screen.trip);await next;
  assert.notEqual(photoIdentity(screen),accepted);
});

test('older successful response cannot grant a thumbnail retry after a newer failure or success',async()=>{
  for(const newerFails of [true,false]) {
    const pending=[];
    const screen=screenFor({},'owner',()=>{const task=deferred();pending.push(task);return task.promise;});
    const older=refreshTrip(screen),newer=refreshTrip(screen);
    if(newerFails) pending[1].reject(Error('newer failed'));else pending[1].resolve(screen.trip);
    await newer;const accepted=photoIdentity(screen);
    pending[0].resolve(screen.trip);await older;
    assert.equal(photoIdentity(screen),accepted);
    if(newerFails) assert.ok(nodes(screen.render(),'Text').some(n=>n.children.includes('newer failed')));
  }
});

test('old-session response and rejection cannot advance the current thumbnail retry signal',async()=>{
  for(const fails of [true,false]) {
    const pending=[];
    const screen=screenFor({},'owner',()=>{const task=deferred();pending.push(task);return task.promise;});
    const old=refreshTrip(screen);screen.switchSession();
    const current=refreshTrip(screen);pending[1].resolve(screen.trip);await current;
    const accepted=photoIdentity(screen);
    if(fails) pending[0].reject(Error('old-session error'));else pending[0].resolve(screen.trip);
    await old;assert.equal(photoIdentity(screen),accepted);
    assert.ok(!nodes(screen.render(),'Text').some(n=>n.children.includes('old-session error')));
  }
});

test('late same-session rejection leaves the accepted thumbnail retry identity unchanged',async()=>{
  const pending=[];
  const screen=screenFor({},'owner',()=>{const task=deferred();pending.push(task);return task.promise;});
  const older=refreshTrip(screen),newer=refreshTrip(screen);
  pending[1].resolve(screen.trip);await newer;const accepted=photoIdentity(screen);
  pending[0].reject(Error('older failed'));await older;
  assert.equal(photoIdentity(screen),accepted);
  assert.equal(nodes(screen.render(),'ActivityIndicator').length,0);
});
