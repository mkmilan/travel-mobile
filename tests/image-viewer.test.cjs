const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {fixture, load, read, nodes, native} = require('./helpers/component-fixture.cjs');
const h = (type, props, ...children) => ({type,props:props || {},children:children.flat()});
function viewer(overrides={}) {
  let closed=0;const zoom=[],ref={current:{setNativeProps:value=>zoom.push(value)}};
  const props={visible:true,images:[{uri:'fixture-one'},{uri:'fixture-two'}],imageIndex:1,swipeToCloseEnabled:true,doubleTapToZoomEnabled:false,onRequestClose:()=>closed++,...overrides};
  const deps={...native,SafeAreaInsetsContext:{Provider:'InsetsReset'},SafeAreaFrameContext:{Provider:'FrameReset'},React:{createElement:h},Animated:{View:'AnimatedView'},Dimensions:{get:()=>({width:400,height:800})},StyleSheet:{create:value=>value},VirtualizedList:'VirtualizedList',ImageItem:'ImageItem',StatusBarManager:'StatusBarManager',useRef:()=>ref,useCallback:fn=>fn,useImageIndexChange:index=>[index,()=>{}],useAnimatedComponents:()=>[[],[],value=>zoom.push(value)],useRequestClose:fn=>[1,fn]};
  const screen=fixture('src/components/SafeImageViewing.js','ImageViewing',props,deps);
  return {props,render:screen.render,closed:()=>closed,zoom,deps};
}
test('viewer safe-area provider is inside full native modal; header/footer reserve real edges',()=>{
  const screen=viewer({FooterComponent:'SourceLink'});const tree=screen.render();
  assert.equal(tree.type,'Modal');assert.equal(tree.props.statusBarTranslucent,true);assert.equal(tree.props.navigationBarTranslucent,true);
  assert.equal(nodes(tree,'SafeAreaProvider').length,1);assert.equal(nodes(tree,'InsetsReset')[0].props.value,null);assert.equal(nodes(tree,'FrameReset')[0].props.value,null);
  const areas=nodes(tree,'SafeAreaView');assert.deepEqual(Array.from(areas[0].props.edges),['top','left','right']);assert.deepEqual(Array.from(areas[1].props.edges),['bottom','left','right']);
  const close=nodes(tree,'Pressable')[0];assert.equal(close.props.style.width,48);assert.equal(close.props.style.height,48);assert.equal(close.props.accessibilityLabel,'Close image');
  assert.equal(nodes(tree,'SourceLink').length,1);
  for (const overlay of nodes(tree,'AnimatedView')) assert.equal(overlay.props.pointerEvents,'box-none');
  assert.equal(areas[0].props.pointerEvents,'box-none');
});
test('X, Android Back and unchanged image swipe share dismissal; reopen still works',()=>{
  const screen=viewer();let tree=screen.render();nodes(tree,'Pressable')[0].props.onPress();assert.equal(screen.closed(),1);
  tree.props.onRequestClose();assert.equal(screen.closed(),2);
  const item=nodes(tree,'VirtualizedList')[0].props.renderItem({item:screen.props.images[1]});
  assert.equal(item.type,'ImageItem');assert.equal(item.props.swipeToCloseEnabled,true);assert.equal(item.props.doubleTapToZoomEnabled,false);
  item.props.onRequestClose();assert.equal(screen.closed(),3);
  screen.props.visible=false;assert.equal(screen.render(),null);screen.props.visible=true;
  nodes(screen.render(),'Pressable')[0].props.onPress();assert.equal(screen.closed(),4);
});
test('image index, authenticated sources and upstream zoom handling remain unchanged',()=>{
  const screen=viewer({images:[{uri:'fixture',headers:{Authorization:'Bearer synthetic'}}]});const list=nodes(screen.render(),'VirtualizedList')[0];
  assert.equal(list.props.initialScrollIndex,1);assert.equal(list.props.getItem(null,0).headers.Authorization,'Bearer synthetic');
  assert.equal(list.props.getItemLayout(null,2).offset,800);
  list.props.renderItem({item:screen.props.images[0]}).props.onZoom(true);assert.equal(screen.zoom[0].scrollEnabled,false);assert.equal(screen.zoom[1],false);
  list.props.renderItem({item:screen.props.images[0]}).props.onZoom(false);assert.equal(screen.zoom[2].scrollEnabled,true);assert.equal(screen.zoom[3],true);
  const enhanced=load('src/components/SafeImageViewing.js','EnhancedImageViewing',{...screen.deps,h,useRef:()=>({current:null}),useEffect(){}});
  assert.equal(enhanced({imageIndex:2}).props.key,2);
});
test('both gallery consumers preserve swipe close and use safe viewer; footer target is accessible',()=>{
  for(const file of ['src/components/ProfileGallery.js','src/components/trip/PhotoGallery.js']) {
    assert.match(read(file),/import ImageViewing from "@\/src\/components\/SafeImageViewing"/);
    assert.match(read(file),/swipeToCloseEnabled=\{true\}/);
  }
  assert.match(read('src/components/ProfileGallery.js'),/minHeight: 48/);
  assert.match(read('src/components/ProfileGallery.js'),/accessibilityRole="button"/);
});
test('adapter internal imports remain present in installed image-viewing version',()=>{
  const root=path.dirname(require.resolve('react-native-image-viewing/package.json'));
  assert.equal(require(path.join(root,'package.json')).version,'0.2.2');
  for(const file of ['components/ImageItem/ImageItem.android.js','components/ImageItem/ImageItem.ios.js','components/StatusBarManager.js','hooks/useAnimatedComponents.js','hooks/useImageIndexChange.js','hooks/useRequestClose.js']) assert.ok(fs.existsSync(path.join(root,'dist',file)),file);
  const android=fs.readFileSync(path.join(root,'dist/components/ImageItem/ImageItem.android.js'),'utf8');
  assert.match(android,/swipeToCloseEnabled = true/);assert.match(android,/onRequestClose/);
});
