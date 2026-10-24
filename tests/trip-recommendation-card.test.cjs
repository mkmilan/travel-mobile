const test = require('node:test');
const assert = require('node:assert/strict');
const {load, nodes, native, theme, read} = require('./helpers/component-fixture.cjs');
const {hooksFixture} = require('./helpers/hooks-fixture.cjs');
const first = 'a'.repeat(24), second = 'b'.repeat(24);
const {createPhotoSource} = load('src/utils/photoSource.js', '({createPhotoSource})');
function card(rec) {
  const host = hooksFixture();
  const props = {rec, onPress(){presses++;}, onLongPress(){holds++;}};
  let session = {key:'one',token:'private-token'}, presses=0,holds=0;
  const component = load('src/components/RecommendationCard.js','RecommendationCard',{
    ...native, ...host.hooks, theme, StyleSheet:{create:x=>x}, Ionicons:'Ionicons',UserHeader:'UserHeader',
    h:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),
    usePhotoSource:()=>({mediaKey:session.key,getPhotoSource:id=>createPhotoSource(id,'https://fixture.invalid/api',session.token,session.key)}),
  });
  return {props, render:()=>host.render(()=>component(props)), session:value=>{session=value;}, counts:()=>({presses,holds})};
}
test('trip card retains author/location, title independent of author, wrapped metadata and description',()=>{
  const rec={name:'A long readable place title',primaryCategory:'campsite',rating:4,description:'Place description',user:{username:'Alex',city:'City',country:'Country'}};
  const screen=card(rec),tree=screen.render();
  assert.equal(nodes(tree,'UserHeader')[0].props.user,rec.user);
  assert.equal(nodes(tree,'UserHeader')[0].props.showLocation,true);
  assert.equal(nodes(tree,'UserHeader')[0].props.navigateOnPress,undefined);
  const title=nodes(tree,'Text').find(n=>n.children.includes(rec.name));
  assert.ok(title);assert.equal(title.props.numberOfLines,undefined);
  assert.ok(nodes(tree,'Text').some(n=>n.children.includes('Campsite')));
  assert.equal(nodes(tree,'Ionicons').filter(n=>n.props.name==='star').length,4);
  assert.ok(nodes(tree,'Text').some(n=>n.children.includes(rec.description)));
  screen.props.rec={name:'Author missing'};assert.ok(nodes(screen.render(),'Text').some(n=>n.children.includes('Author missing')));
});
test('missing, malformed and arbitrary URL photos leave full-width text and no placeholder',()=>{
  for(const photos of [undefined,null,[],{},[''],[null,{},'https://external.invalid/private.jpg','file:///tmp/private.jpg','not-an-id']]) {
    const tree=card({_id:'rec',photos}).render();assert.equal(nodes(tree,'Image').length,0);
    assert.equal(nodes(tree,'Pressable').length,1);
    assert.ok(nodes(tree,'View').some(n=>n.props.style?.flex===1));
  }
});
test('first valid supplied ID uses existing authenticated source, no token URL and no image navigation',()=>{
  const screen=card({_id:'rec',photos:[null,'bad',first,second]}),tree=screen.render(),image=nodes(tree,'Image')[0];
  assert.ok(image.props.source.uri.includes(`/photos/${first}?view=one`));
  assert.equal(image.props.source.headers.Authorization,'Bearer private-token');
  assert.equal(image.props.source.cache,'reload');assert.ok(!image.props.source.uri.includes('private-token'));
  assert.equal(image.props.pointerEvents,'none');assert.equal(image.props.onPress,undefined);
  nodes(tree,'Pressable')[0].props.onPress();nodes(tree,'Pressable')[0].props.onLongPress();assert.deepEqual(screen.counts(),{presses:1,holds:1});
});
test('image error reclaims text width; photo, record and session changes reset error and native image identity',()=>{
  const screen=card({_id:'rec',photos:[first]});let image=nodes(screen.render(),'Image')[0];
  image.props.onError();assert.equal(nodes(screen.render(),'Image').length,0);
  screen.props.rec={_id:'rec',photos:[second]};let next=nodes(screen.render(),'Image')[0];assert.ok(next);assert.notEqual(next.props.key,image.props.key);
  next.props.onError();assert.equal(nodes(screen.render(),'Image').length,0);
  // Late failure of the previous photo must not undo the current fallback.
  image.props.onError();assert.equal(nodes(screen.render(),'Image').length,0);
  screen.props.rec={_id:'other',photos:[second]};next=nodes(screen.render(),'Image')[0];assert.ok(next);
  next.props.onError();assert.equal(nodes(screen.render(),'Image').length,0);
  screen.session({key:'two',token:'new-token'});image=nodes(screen.render(),'Image')[0];assert.ok(image);
  assert.equal(image.props.source.headers.Authorization,'Bearer new-token');assert.notEqual(image.props.key,next.props.key);
  next.props.onError();assert.equal(nodes(screen.render(),'Image').length,1);
  screen.props.rec={_id:'other',photos:[]};assert.equal(nodes(screen.render(),'Image').length,0);
  screen.props.rec={_id:'other',photos:[second]};assert.equal(nodes(screen.render(),'Image').length,1);
});
test('anonymous image source has no credentials; trip variant delegates to the shared presentation',()=>{
  const screen=card({_id:'rec',photos:[first]});screen.session({key:'public',token:null});
  assert.equal(nodes(screen.render(),'Image')[0].props.source.headers,undefined);
  assert.ok(!read('src/components/RecommendationCard.js').includes('TripRecommendationCard'));
  assert.match(read('src/components/trip/TripRecommendationCard.js'), /export \{ default \} from "\.\.\/RecommendationCard"/);
  assert.ok(!read('src/components/RecommendationCard.js').includes('getRecommendationById'));
});

test('A to B to A reuse rejects the first A callback even when URL and record match again',()=>{
  const screen=card({_id:'rec',photos:[first]});const original=nodes(screen.render(),'Image')[0];
  screen.props.rec={_id:'rec',photos:[second]};screen.render();
  screen.props.rec={_id:'rec',photos:[first]};assert.equal(nodes(screen.render(),'Image').length,1);
  original.props.onError();assert.equal(nodes(screen.render(),'Image').length,1);
  const current=nodes(screen.render(),'Image')[0];current.props.onError();assert.equal(nodes(screen.render(),'Image').length,0);
  screen.props.rec={_id:'rec',photos:[]};screen.render();screen.props.rec={_id:'rec',photos:[first]};screen.render();
  current.props.onError();assert.equal(nodes(screen.render(),'Image').length,1);
});


test('successful refresh grants one image attempt; rerenders and repeated failures stay latched',()=>{
  const screen=card({_id:'rec',photos:[first]});screen.props.photoRefreshIdentity={};
  const original=nodes(screen.render(),'Image')[0];original.props.onError();
  assert.equal(nodes(screen.render(),'Image').length,0);
  // New record objects alone (local edits or rerenders) do not grant retries.
  screen.props.rec={_id:'rec',photos:[first]};assert.equal(nodes(screen.render(),'Image').length,0);
  screen.props.photoRefreshIdentity={};const retry=nodes(screen.render(),'Image')[0];
  assert.ok(retry);assert.notEqual(retry.props.key,original.props.key);
  original.props.onError();assert.equal(nodes(screen.render(),'Image').length,1);
  retry.props.onError();assert.equal(nodes(screen.render(),'Image').length,0);
  original.props.onError();assert.equal(nodes(screen.render(),'Image').length,0);
  retry.props.onError();assert.equal(nodes(screen.render(),'Image').length,0);
  screen.props.photoRefreshIdentity={};const next=nodes(screen.render(),'Image')[0];assert.ok(next);
  retry.props.onError();assert.equal(nodes(screen.render(),'Image').length,1);
  nodes(screen.render(),'Pressable')[0].props.onPress();nodes(screen.render(),'Pressable')[0].props.onLongPress();
  assert.deepEqual(screen.counts(),{presses:1,holds:1});
});

test('refresh remounts a still-loading native image and never invents an absent photo',()=>{
  const screen=card({_id:'rec',photos:[first]});const old=nodes(screen.render(),'Image')[0];
  screen.props.photoRefreshIdentity={};const next=nodes(screen.render(),'Image')[0];assert.notEqual(next.props.key,old.props.key);
  old.props.onError();assert.equal(nodes(screen.render(),'Image').length,1);
  screen.props.rec={_id:'rec',photos:[]};screen.props.photoRefreshIdentity={};assert.equal(nodes(screen.render(),'Image').length,0);
});
