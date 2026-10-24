const test = require('node:test');
const assert = require('node:assert/strict');
const {load, nodes, native, theme} = require('./helpers/component-fixture.cjs');
const {hooksFixture, authFixture} = require('./helpers/hooks-fixture.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; };
const rec = (name='Before edit', photos=['deleted-photo']) => ({_id:'rec', name, photos, user:{_id:'actor'}});
function screenFixture(loadPage, loadSource, isSelf=true) {
  const host=hooksFixture(), auth=authFixture(), route={params:{}}, props={userId:'actor',isSelf};
  const createContext = host => load('src/hooks/useProfileContext.js','useProfileContext',{...host.hooks,useAuthStore:auth.store});
  const {createPagedList}=load('src/utils/pagedList.js','({createPagedList})');
  const useProfileList=load('src/hooks/useProfileList.js','useProfileList',{...host.hooks,useProfileContext:createContext(host),createPagedList,useTripSocialStore:s=>s({deletionRevision:0})});
  const jsx={h:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),React:{Fragment:'Fragment'}};
  const component=load('src/screens/profile/tabs/RecommendationsTab.js','RecommendationsTab',{
    ...native,theme,...jsx,...host.hooks,useProfileList,
    RecommendationSourceLoader:'RecommendationSourceLoader',RefreshControl:'RefreshControl',ProfileListStatus:'ProfileListStatus',RecommendationCard:'RecommendationCard',RecommendationDetailModal:'RecommendationDetailModal',AddRecommendationModal:'AddRecommendationModal',
    getRecommendationsByUser:loadPage,getTripJsonById:async()=>({}),deleteRecommendation:async()=>{},updateRecommendation:async()=>{},lineStringToCoords:x=>x,Alert:{alert(){}},
    useNavigation:()=>({setParams:p=>Object.assign(route.params,p)}),useRoute:()=>route,
  });
  let child;
  return {host,auth,props,route,render(){
    const tree=host.render(()=>component(props));
    const source=nodes(tree,'RecommendationSourceLoader')[0];
    if(child && (!source || child.key!==source.props.key)) {child.host.unmount();child=null;}
    if(source && !child) {
      const host=hooksFixture();
      child={host,key:source.props.key,component:load('src/components/RecommendationSourceLoader.js','RecommendationSourceLoader',{
        ...native,...jsx,...host.hooks,useProfileContext:createContext(host),getRecommendationByIdApi:loadSource,
      })};
    }
    const sourceTree=source?child.host.render(()=>child.component(source.props)):null;
    return {tree,sourceTree,list:nodes(tree,'FlatList')[0],detail:nodes(tree,'RecommendationDetailModal')[0]};
  }};
}
test('real Recommendations component/hook revalidates unchanged totals exactly once on return and preserves pagination',async()=>{
  let server=rec(),calls=[];
  const screen=screenFixture(async(_,page)=>{calls.push(page);return {data:[page===1?structuredClone(server):{...rec('Page two'),_id:'second'}],totalPages:2};});
  screen.render();await tick();let view=screen.render();assert.deepEqual(calls,[1]);
  const initialIdentity=view.list.props.renderItem({item:view.list.props.data[0]}).props.photoRefreshIdentity;
  await view.list.props.onEndReached();view=screen.render();assert.equal(view.list.props.data.length,2);assert.deepEqual(calls,[1,2]);
  screen.host.blur();server=rec('Edited elsewhere',[]);screen.host.focus();await tick();view=screen.render();
  assert.equal(view.list.props.data[0].name,'Edited elsewhere');assert.equal(view.list.props.data[0].photos.length,0);
  assert.notEqual(view.list.props.renderItem({item:view.list.props.data[0]}).props.photoRefreshIdentity,initialIdentity);
  for(let i=0;i<10;i++)screen.render();await tick();assert.deepEqual(calls,[1,2,1]);
});
test('cached Gallery target always opens fresh single-record response even while return list refresh is delayed',async()=>{
  let calls=0,sourceCalls=0;const refresh=deferred(),source=deferred();
  const screen=screenFixture(()=>++calls===1?Promise.resolve({data:[rec()],totalPages:1}):refresh.promise,()=>{sourceCalls++;return source.promise;});
  screen.render();await tick();screen.render();screen.host.blur();screen.route.params={openRecId:'rec',ts:1};screen.host.focus();screen.render();let view=screen.render();await tick();
  assert.equal(view.detail,undefined);assert.equal(calls,2);assert.equal(sourceCalls,1);
  source.resolve(rec('Fresh detail',[]));await tick();view=screen.render();assert.equal(view.detail.props.recommendation.name,'Fresh detail');assert.equal(view.detail.props.recommendation.photos.length,0);
  refresh.resolve({data:[rec('Older page response')],totalPages:1});await tick();view=screen.render();assert.equal(view.detail.props.recommendation.name,'Fresh detail');assert.equal(view.detail.props.recommendation.photos.length,0);
  for(let i=0;i<10;i++)screen.render();assert.equal(calls,2);assert.equal(sourceCalls,1);
});
test('failed source and failed return refresh never fall back to cached deleted-photo detail; explicit retry works',async()=>{
  let calls=0,sourceCalls=0;
  const screen=screenFixture(async()=>{if(++calls>1)throw Error('offline list');return {data:[rec()],totalPages:1};},async()=>{if(++sourceCalls===1)throw Error('removed or offline');return rec('Recovered',[]);});
  screen.render();await tick();let view=screen.render();await view.list.props.renderItem({item:view.list.props.data[0]}).props.onPress();assert.ok(screen.render().detail);
  screen.host.blur();screen.route.params={openRecId:'rec',ts:1};screen.host.focus();screen.render();screen.render();await tick();view=screen.render();
  assert.equal(view.detail,undefined);assert.ok(nodes(view.sourceTree,'Text').some(n=>n.props.accessibilityRole==='alert'));
  for(let i=0;i<10;i++)screen.render();assert.equal(calls,2);assert.equal(sourceCalls,1);
  nodes(view.sourceTree,'Pressable')[0].props.onPress();screen.render();await tick();view=screen.render();assert.equal(view.detail.props.recommendation.photos.length,0);assert.equal(sourceCalls,2);
});
test('delayed older source cannot replace newer source intent, manual choice, profile, or session',async()=>{
  for(const action of ['source','manual','profile','session']) {
    const old=deferred();let sourceCalls=0;
    const screen=screenFixture(async()=>({data:[rec()],totalPages:1}),id=>++sourceCalls===1?old.promise:Promise.resolve({...rec('Newest',[]),_id:id}));
    screen.render();await tick();screen.route.params={openRecId:'rec',ts:1};screen.render();let view=screen.render();
    if(action==='source')screen.route.params={openRecId:'next',ts:2};
    if(action==='manual')await view.list.props.renderItem({item:rec('Manual',[])}).props.onPress();
    if(action==='profile')screen.props.userId='other';
    if(action==='session')screen.auth.set({token:'new-session',user:{_id:'actor'}});
    screen.render();screen.render();await tick();old.resolve(rec('Stale', ['deleted-photo']));await tick();view=screen.render();
    if(action==='source'||action==='manual')assert.equal(view.detail.props.recommendation.name,action==='source'?'Newest':'Manual');
    else assert.equal(view.detail,undefined);
  }
});
test('foreign profile cards remain read-only while using the same return refresh',async()=>{
  let calls=0;const screen=screenFixture(async()=>{calls++;return {data:[rec()],totalPages:1};},null,false);
  screen.render();await tick();let view=screen.render();assert.equal(view.list.props.renderItem({item:view.list.props.data[0]}).props.onLongPress,undefined);
  screen.host.blur();screen.host.focus();await tick();assert.equal(calls,2);
});
