const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const babel = require('@babel/core');
const { getRoutes } = require('expo-router/build/getRoutes');
const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig');
const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter');

// Execute Expo's installed path parser. Its native barrel eagerly loads RN UI;
// route that sole import directly to the SAME installed pure validator instead.
// Route matching, route tree creation and navigation reducer are not mocked.
const parserFile = require.resolve('expo-router/build/fork/getStateFromPath');
const parserRequire = createRequire(parserFile);
const parserModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(parserFile,'utf8'), {
  exports: parserModule.exports, module: parserModule, URL, console, process,
  require: (name) => name === '../react-navigation/native'
    ? require('expo-router/build/react-navigation/core/validatePathConfig')
    : parserRequire(name),
});
const { getStateFromPath } = parserModule.exports;
const app = path.join(__dirname,'../app');
function contextWithout(exclude) {
  const files = fs.readdirSync(app,{recursive:true}).filter(file=>/\.js$/.test(file) && file!==exclude);
  const context = (key)=> {
    const source=fs.readFileSync(path.join(app,key.slice(2)),'utf8');
    // Only route metadata is needed; don't load API/native UI modules.
    const ast=babel.parseSync(source,{configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}});
    const result={default:()=>null};
    for(const statement of ast.program.body) {
      if(statement.type!=='ExportNamedDeclaration' || statement.declaration?.type!=='VariableDeclaration') continue;
      for(const declaration of statement.declaration.declarations) {
        if(declaration.id.name==='unstable_settings')
          result.unstable_settings=vm.runInNewContext('('+source.slice(declaration.init.start,declaration.init.end)+')');
      }
    }
    return result;
  };
  context.keys=()=>files.map(file=>'./'+file);
  return context;
}
function config(exclude) {
  return getReactNavigationConfig(getRoutes(contextWithout(exclude),{platform:'android', importMode:'sync'}),true);
}
function focused(state) {
  const names=[];
  while(state?.routes?.length) {const route=state.routes[state.index??state.routes.length-1]; names.push(route.name);state=route.state;}
  return names;
}
function entry(state) {
  const source=fs.readFileSync(path.join(app,'index.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
  const transformed=babel.transformSync(source,{configFile:false,babelrc:false,plugins:[['@babel/plugin-transform-react-jsx',{pragma:'h'}]]}).code;
  return vm.runInNewContext(transformed+';EntryScreen()',{
    h:(_,props)=>props, Redirect:'Redirect',useAuthStore:()=>state,
  });
}
function activeRootNames(isAuthenticated) {
  const source=fs.readFileSync(path.join(app,'_layout.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
  const transformed=babel.transformSync(source,{configFile:false,babelrc:false,plugins:[['@babel/plugin-transform-react-jsx',{pragma:'h'}]]}).code;
  const root=vm.runInNewContext(transformed+';RootLayout()',{
    h:(type,props,...children)=>({type,props:props||{},children}),
    Stack:{Screen:'Screen',Protected:'Protected'},
    TopNavBar:'Header',AuthDiagnostics:'Diagnostics',SystemUI:'SystemUI',FlashMessage:'FlashMessage',
    GestureHandlerRootView:'Root',SafeAreaProvider:'SafeArea',
    SplashScreen:{preventAutoHideAsync:()=>Promise.resolve()},useEffect:()=>{},
    useAuthStore:()=>({isHydrating:false,isAuthenticated}),recordAuthDiagnostic:()=>{},
  });
  function collect(node) {
    if(!node || typeof node!=='object' || (node.type==='Protected' && !node.props.guard)) return [];
    return [...(node.type==='Screen'?[node.props.name]:[]),...node.children.flatMap(collect)];
  }
  // Expo auto-registers the unconfigured not-found route after explicit screens.
  return [...collect(root),'+not-found'];
}
test('regression reproducer: previous route tree without index sends native root URL to not-found',()=>{
  assert.deepEqual(focused(getStateFromPath('/',config('index.js'))),['+not-found']);
});
test('native root URL resolves real entry route, then login or trips according to hydrated session',()=>{
  const routes=config();
  assert.deepEqual(focused(getStateFromPath('/',routes)),['index']);
  assert.equal(entry({isHydrating:true,isAuthenticated:false}),null);
  for(const isAuthenticated of [false,true]) {
    const destination=entry({isHydrating:false,isAuthenticated}).href;
    assert.deepEqual(focused(getStateFromPath(destination,routes)),isAuthenticated?['(tabs)','trips/index']:['(auth)','login']);
  }
});
test('public account recovery links still resolve without bouncing through entry',()=>{
  const routes=config();
  for(const url of ['/register','/forgot-password','/verify-email','/reset-password/fixture']) {
    const resolved=focused(getStateFromPath(url,routes));
    assert.equal(resolved[0],'(auth)'); assert.notEqual(resolved.at(-1),'login'); assert.ok(!resolved.includes('+not-found'));
  }
  assert.deepEqual(focused(getStateFromPath('/unknown-fixture',routes)),['+not-found']);
  // Existing not-found recovery href='/' now has a valid destination.
  assert.deepEqual(focused(getStateFromPath('/',routes)),['index']);
});
test('actual stack reducer removes forbidden auth route on login and falls back to explicit entry',()=>{
  const router=StackRouter({});
  const options=(routeNames)=>({routeNames,routeParamList:{},routeGetIdList:{},routeKeyChanges:[]});
  const signedOut=activeRootNames(false);
  const signedIn=activeRootNames(true);
  assert.equal(signedOut[0],'index'); assert.equal(signedIn[0],'index');
  assert.ok(!signedOut.includes('(tabs)')); assert.ok(!signedIn.includes('(auth)'));
  let state=router.getInitialState(options(signedOut));
  state=router.getStateForAction(state,{type:'REPLACE',payload:{name:'(auth)'}},options(signedOut));
  state=router.getStateForRouteNamesChange(state,options(signedIn));
  assert.equal(state.routes[state.index].name,'index');
  assert.equal(entry({isHydrating:false,isAuthenticated:true}).href,'/(tabs)/trips');
  state=router.getStateForAction(state,{type:'REPLACE',payload:{name:'(tabs)'}},options(signedIn));
  state=router.getStateForRouteNamesChange(state,options(signedOut));
  assert.equal(state.routes[state.index].name,'index');
  assert.equal(entry({isHydrating:false,isAuthenticated:false}).href,'/(auth)/login');
});
function recoveryLink() {
  const source=fs.readFileSync(path.join(app,'+not-found.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export default function','function');
  const transformed=babel.transformSync(source,{configFile:false,babelrc:false,plugins:[['@babel/plugin-transform-react-jsx',{pragma:'h'}]]}).code;
  const tree=vm.runInNewContext(transformed+';NotFoundScreen()',{
    h:(type,props,...children)=>({type,props:props||{},children}),
    React:{Fragment:'Fragment'},Link:'Link',Stack:{Screen:'Screen'},ThemedText:'Text',ThemedView:'View',StyleSheet:{create:styles=>styles},
  });
  function find(node) { if(node?.type==='Link') return node.props; return node?.children?.map(find).find(Boolean); }
  return find(tree);
}
const stackOptions=(routeNames)=>({routeNames,routeParamList:{},routeGetIdList:{},routeKeyChanges:[]});
test('404 recovery replaces the bad history entry so the next login cannot fall back to 404',()=>{
  const router=StackRouter({});
  const signedOut=stackOptions(activeRootNames(false));
  const signedIn=stackOptions(activeRootNames(true));
  const link=recoveryLink();
  assert.equal(link.href,'/'); assert.equal(link.replace,true);
  function loginAfterRecovery(action) {
    let state=router.getInitialState(signedOut);
    state=router.getStateForAction(state,{type:'REPLACE',payload:{name:'+not-found'}},signedOut);
    state=router.getStateForAction(state,{type:action,payload:{name:'index'}},signedOut);
    state=router.getStateForAction(state,{type:'REPLACE',payload:{name:'(auth)'}},signedOut);
    return router.getStateForRouteNamesChange(state,signedIn);
  }
  // Demonstrates the original Link's push history bug rather than merely asserting markup.
  const oldState=loginAfterRecovery('PUSH');
  assert.equal(oldState.routes[oldState.index].name,'+not-found');
  const fixedState=loginAfterRecovery(link.replace?'REPLACE':'PUSH');
  assert.equal(fixedState.routes[fixedState.index].name,'index');
  assert.ok(!fixedState.routes.some(route=>route.name==='+not-found'));
});
test('deep links are rehydrated against actual signed-in/out eligibility; forbidden entries fall back to index',()=>{
  const router=StackRouter({}); const routes=config();
  for(const isAuthenticated of [false,true]) {
    const options=stackOptions(activeRootNames(isAuthenticated));
    for(const [url,group] of [
      ['/login','(auth)'],['/register','(auth)'],['/verify-email','(auth)'],
      ['/forgot-password','(auth)'],['/reset-password/fixture-token?source=fixture','(auth)'],
      ['/trips','(tabs)'],['/search','search/index'],['/home','home/index'],['/logout','logout'],
    ]) {
      const parsed=getStateFromPath(url,routes);
      const state=router.getRehydratedState(parsed,options);
      const expected=options.routeNames.includes(group)?group:'index';
      assert.equal(state.routes[state.index].name,expected,`${url} authenticated=${isAuthenticated}`);
    }
  }
  const parsed=getStateFromPath('/reset-password/fixture-token?source=fixture',routes);
  const state=router.getRehydratedState(parsed,stackOptions(activeRootNames(false)));
  const auth=state.routes[state.index];
  const reset=auth.state.routes.at(-1);
  assert.equal(reset.name,'reset-password/[token]');
  assert.equal(reset.params.token,'fixture-token');
  assert.equal(reset.params.source,'fixture');
});
