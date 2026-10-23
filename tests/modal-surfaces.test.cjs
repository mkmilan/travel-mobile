const test = require('node:test');
const assert = require('node:assert/strict');
const {read,fixture,nodes,theme,native} = require('./helpers/component-fixture.cjs');
const deferred = () => {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const styles = {create:value=>value,absoluteFillObject:{position:'absolute'}};

test('shared bottom modals keep backdrop separate and safe insets inside consumer style overrides',()=>{
  for(const OS of ['android','ios']) {
    let closes=0;const override={paddingBottom:0,height:250};
    const form=fixture('src/components/modals/BottomModal.js','BottomModal',{visible:true,onClose:()=>closes++,style:override,children:'fixture'}, {
      ...native,theme,StyleSheet:styles,Platform:{OS},Dimensions:{get:()=>({height:800})},
      Animated:{Value:function(value){this.value=value;},View:'Animated.View',timing:()=>({start(){}})},
    });
    const tree=form.render();assert.equal(tree.type,'Modal');assert.equal(tree.props.navigationBarTranslucent,true);
    const provider=nodes(tree,'SafeAreaProvider')[0];assert.ok(provider);
    assert.equal(provider.children[0].props.testID,'bottom-modal-backdrop');
    assert.equal(provider.children[0].props.accessible,false);
    assert.equal(provider.children[1].props.pointerEvents,'box-none');
    assert.equal(JSON.stringify(provider.children[1].props.edges),JSON.stringify(['top','left','right']));
    const keyboard=nodes(tree,'KeyboardAvoidingView');assert.equal(keyboard.length,1);
    assert.equal(keyboard[0].props.pointerEvents,'box-none');assert.equal(keyboard[0].props.behavior,OS==='ios'?'padding':undefined);
    assert.equal(keyboard[0].props.keyboardVerticalOffset,undefined);
    const sheet=nodes(tree,'Animated.View')[0];assert.equal(sheet.props.style[0].maxHeight,'90%');assert.equal(sheet.props.style.at(-1),override);
    const inset=nodes(sheet,'SafeAreaView')[0];assert.equal(JSON.stringify(inset.props.edges),'["bottom"]');
    assert.ok(inset.props.style.paddingBottom>0);assert.equal(inset.props.accessibilityViewIsModal,true);
    tree.props.onRequestClose();provider.children[0].props.onPress();assert.equal(closes,2);
  }
});


test('route-map modal fills remaining space below its header without overflowing the safe footer',()=>{
  const tree=fixture('src/components/modals/MapModal.js','MapModal',{visible:true,onClose(){},routeCoords:[],pois:[]},{...native,theme,StyleSheet:styles,BottomModal:'BottomModal',ModalHeader:'ModalHeader',InteractiveTripMap:'InteractiveTripMap'}).render();
  const map=nodes(tree,'View')[0];assert.equal(map.props.style.flex,1);assert.equal(map.props.style.height,undefined);
  assert.equal(tree.props.style.padding,0); // shared modal still preserves its inner bottom inset
});
