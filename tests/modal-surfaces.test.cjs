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

function recommendationForm(onSubmit) {
  const alerts=[];
  const session={user:{_id:"fixture-owner"},token:"fixture-token"};const useAuthStore=Object.assign(()=>session,{getState:()=>session});
  const form=fixture('src/components/modals/AddRecommendationModal.js','AddRecommendationModal',{onSubmit},{
    ...native,theme,useAuthStore,console:{log(){},error(){}},StyleSheet:styles,BottomModal:'BottomModal',ModalHeader:'ModalHeader',TripPhotoThumb:'TripPhotoThumb',Ionicons:'Ionicons',MapView:'MapView',Marker:'Marker',StarRating:'StarRating',
    RECOMMENDATION_CATEGORIES:[{value:'nature',label:'Nature'}],RECOMMENDATION_TAGS:[{value:'quiet',label:'Quiet'}],
    Alert:{alert:(...args)=>alerts.push(args)},usePhotoManager:()=>({photos:[],getPhotos:()=>[],uploading:false,setPhotos(){},uploadPendingPhotos:async()=>{}}),
  });
  form.render();return {...form,alerts};
}
const recommendationButton=tree=>nodes(tree,'Pressable').find(n=>n.props.testID==='recommendation-save');
function fillRecommendation(form) {
  form.ref.current.open({lat:1,lon:2},'trip');const tree=form.render();
  nodes(tree,'TextInput')[0].props.onChangeText('Fixture name');nodes(tree,'TextInput')[1].props.onChangeText('Fixture description');
  nodes(tree,'StarRating')[0].props.onRatingChange(4);
  nodes(tree).find(n=>n.props.onCategoryChange).props.onCategoryChange('nature');nodes(tree).find(n=>n.props.onTagsChange).props.onTagsChange(['quiet']);
  return form.render();
}
const existingRecommendation={_id:'fixture-rec',name:'Existing',description:'Description',rating:4,primaryCategory:'nature',attributeTags:['quiet'],location:{coordinates:[2,1]},photos:[]};

test('recommendation save is single-flight, blocks dismissal/reopen and retains draft after rejection',async()=>{
  let pending=deferred();const calls=[];const form=recommendationForm(data=>{calls.push(data);return pending.promise;});
  let tree=fillRecommendation(form);const save=recommendationButton(tree).props.onPress;const work=save();await save();
  tree=form.render();assert.equal(calls.length,1);assert.equal(recommendationButton(tree).props.disabled,true);
  tree.props.onClose();nodes(tree,'ModalHeader')[0].props.onClose();form.ref.current.openEdit(existingRecommendation);
  tree=form.render();assert.equal(tree.props.visible,true);assert.equal(nodes(tree,'TextInput')[0].props.value,'Fixture name');
  assert.equal(nodes(tree,'TextInput')[0].props.editable,false);
  pending.reject(Error('Save failed'));await work;tree=form.render();
  assert.equal(tree.props.visible,true);assert.equal(recommendationButton(tree).props.disabled,false);
  assert.equal(nodes(tree,'TextInput')[1].props.value,'Fixture description');assert.ok(nodes(tree,'Text').some(n=>n.props.accessibilityRole==='alert'));
  assert.equal(form.alerts.filter(x=>x[0]==='Success').length,0);
  pending=deferred();const retry=recommendationButton(tree).props.onPress();pending.resolve({_id:'fixture-created'});await retry;
  assert.equal(form.render().props.visible,false);assert.equal(calls.length,2);assert.equal(calls[0].associatedTrip,'trip');
  assert.doesNotMatch(read('src/components/modals/AddRecommendationModal.js'),/KeyboardAvoidingView/);
});

test('recommendation editing requires confirmed callback result and supports cancel/reopen after failure',async()=>{
  const form=recommendationForm(async()=>undefined);form.ref.current.openEdit(existingRecommendation);
  await recommendationButton(form.render()).props.onPress();let tree=form.render();
  assert.equal(tree.props.visible,true);assert.equal(form.alerts.length,0);
  assert.ok(nodes(tree,'Text').some(n=>n.props.accessibilityRole==='alert'));
  tree.props.onClose();assert.equal(form.render().props.visible,false);
  form.ref.current.open({lat:1,lon:2});tree=form.render();assert.equal(tree.props.visible,true);assert.equal(nodes(tree,'TextInput')[0].props.value,'');
  assert.equal(nodes(tree,'Text').filter(n=>n.props.accessibilityRole==='alert').length,0);
});

test('profile recommendation callback propagates a rejected update to the editing form',async()=>{
  const source=read('src/screens/profile/tabs/RecommendationsTab.js');const start=source.indexOf('const handleRecommendationSubmitted = '),end=source.indexOf('/* ---------------- render',start);
  let refreshes=0;const handler=require('node:vm').runInNewContext(source.slice(start,end)+';handleRecommendationSubmitted',{
    console:{log(){},error(){}},updateRecommendation:async()=>{throw Error('API failed');},onRefresh:async()=>refreshes++,Alert:{alert(){throw Error('unexpected alert');}},
  });
  await assert.rejects(handler({_id:'fixture-rec'},true),/API failed/);assert.equal(refreshes,0);
});
