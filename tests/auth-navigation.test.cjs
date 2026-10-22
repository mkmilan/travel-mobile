const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const babel = require('@babel/core');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function load(file, names, dependencies) {
  const source = read(file).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(source + '\n;({' + names.join(',') + '});', { console: {error() {},warn() {}}, ...dependencies });
}
function authFixture({ storedUser=null, token=null, register=async()=>({success:true}), storageFailure=false }={}) {
  let state;
  const writes=[];
  const dependencies={
    create: (initializer)=> { state=initializer((patch)=>Object.assign(state,patch),()=>state); return {getState:()=>state}; },
    SecureStore: {
      getItemAsync: async(key)=>{ if(storageFailure) throw Error('fixture'); return key==='user-data' ? storedUser : token; },
      setItemAsync:async(key,value)=>writes.push(key), deleteItemAsync:async()=>{}
    },
    authService:{registerRequest:register}, stopActiveRecording:async()=>{}, require:()=>({useTripSocialStore:{getState:()=>({reset(){}})}})
  };
  load('src/stores/auth.js',['useAuthStore'],dependencies);
  return {state,writes};
}
function renderRoot(state) {
  const source=read('app/_layout.js').replace(/^import .*;\r?\n/gm,'').replace('export default function','function');
  const transformed=babel.transformSync(source,{configFile:false,babelrc:false,plugins:[['@babel/plugin-transform-react-jsx',{pragma:'h'}]]}).code;
  const Stack=()=>{}; Stack.Protected='Protected'; Stack.Screen='Screen';
  return vm.runInNewContext(transformed+';RootLayout()',{
    h:(type,props,...children)=>({type,props:props||{},children}),
    TopNavBar:'TopNavBar',AuthDiagnostics:'Diagnostics',SystemUI:'SystemUI',FlashMessage:'FlashMessage',
    GestureHandlerRootView:'Root',SafeAreaProvider:'SafeArea',Stack,
    SplashScreen:{preventAutoHideAsync:()=>Promise.resolve()}, useEffect:()=>{},useAuthStore:()=>state,
    recordAuthDiagnostic:()=>{}
  });
}
function nodes(tree,type) {
  if(!tree || typeof tree !== 'object') return [];
  return [...(tree.type===type?[tree]:[]), ...tree.children.flatMap(child=>nodes(child,type))];
}
test('root only waits for hydration; registration loading leaves same navigator and guards mounted',()=>{
  assert.equal(renderRoot({isHydrating:true}),null);
  for(const loading of [false,true]) {
    const root=renderRoot({isHydrating:false,isAuthenticated:false,loading});
    assert.deepEqual(nodes(root,'Protected').map(n=>n.props.guard),[true,false]);
    assert.equal(nodes(root,'Screen').find(n=>n.props.name==='(auth)').props.options.headerShown,false);
  }
});
test('login/logout swap protected eligibility without imperative root redirects',()=>{
  for(const isAuthenticated of [false,true,false,true]) {
    const guards=nodes(renderRoot({isHydrating:false,isAuthenticated}),'Protected');
    assert.deepEqual(guards.map(n=>n.props.guard),[!isAuthenticated,isAuthenticated]);
  }
  for(const file of ['app/_layout.js','src/hooks/useRequireAuth.js','src/components/AuthGate.js','app/(tabs)/me/settings.js'])
    assert.doesNotMatch(read(file),/router\.replace/);
  assert.doesNotMatch(read('app/(tabs)/_layout.js'),/AuthGate/);
  assert.match(read('app/(auth)/_layout.js'),/initialRouteName="login"/);
  assert.match(read('app/(tabs)/_layout.js'),/initialRouteName="trips\/index"/);
  assert.equal(fs.existsSync(path.join(__dirname,'../app/(auth)/logout.js')),false);
  assert.match(read('app/_layout.js'),/name="logout"/);
});
test('cold hydration restores session and finishes without changing operation loading',async()=>{
  const {state}=authFixture({storedUser:JSON.stringify({_id:'fixture',username:'fixture'}),token:'fixture'});
  state.loading=true;
  await state.syncFromStorage();
  assert.equal(state.isAuthenticated,true); assert.equal(state.isHydrating,false); assert.equal(state.loading,true);
});
test('empty, malformed and failing storage all finish signed-out hydration',async()=>{
  for(const options of [{},{storedUser:'{'},{storageFailure:true}]) {
    const {state}=authFixture(options); await state.syncFromStorage();
    assert.equal(state.isHydrating,false); assert.equal(state.isAuthenticated,false);
  }
});
test('successful login persists before authentication and logout resets session',async()=>{
  const {state,writes}=authFixture(); await state.syncFromStorage();
  await state.login({_id:'fixture',username:'fixture',token:'fixture'});
  assert.deepEqual(writes,['user-data','auth-token']); assert.equal(state.isAuthenticated,true);
  await state.logout(); assert.equal(state.isAuthenticated,false); assert.equal(state.token,null);
});
test('register success/failure never reopens hydration or authenticates user',async()=>{
  for(const fail of [false,true]) {
    let release;
    const pending=new Promise((resolve,reject)=> { release=()=>fail?reject(Error('fixture')):resolve({success:true}); });
    const {state}=authFixture({register:()=>pending}); await state.syncFromStorage();
    const result=state.register('fixture','fixture','fixture');
    assert.equal(state.loading,true); assert.equal(state.isHydrating,false);
    release(); if(fail) await assert.rejects(result); else assert.equal((await result).success,true);
    assert.equal(state.loading,false); assert.equal(state.isHydrating,false); assert.equal(state.isAuthenticated,false);
  }
});
test('diagnostics disabled outside test; fixed labels only and bounded to forty events',()=>{
  for(const enabled of [false,true]) {
    const diag=load('src/utils/authDiagnostics.js',['recordAuthDiagnostic','getAuthDiagnostics'],{Constants:{expoConfig:{extra:{AUTH_DIAGNOSTICS:enabled}}}});
    diag.recordAuthDiagnostic('private@example.invalid'); diag.recordAuthDiagnostic({token:'fixture'});
    for(let i=0;i<100;i++) diag.recordAuthDiagnostic('login:request');
    const events=diag.getAuthDiagnostics(); assert.equal(events.length,enabled?40:0);
    assert.ok(events.every(event=>/^\d+ login:request$/.test(event)));
    events.push('external mutation'); assert.equal(diag.getAuthDiagnostics().length,enabled?40:0);
  }
});
test('profile/settings/edit-profile keep hooks unconditional across sign-out and do not navigate on auth changes',()=>{
  for(const file of ['src/screens/profile/ProfileScreen.js','app/(tabs)/me/settings.js','app/(tabs)/me/edit-profile.js']) {
    const source=read(file);
    assert.doesNotMatch(source,/router\.replace/);
    const ast=babel.parseSync(source,{configFile:false,babelrc:false,parserOpts:{plugins:['jsx']}});
    const component=ast.program.body.find(node=>node.type==='ExportDefaultDeclaration').declaration;
    const statements=component.body.body;
    const guardIndex=statements.findIndex(node=>node.type==='IfStatement' && source.slice(node.start,node.end).includes('!ready'));
    const hookIndices=statements.flatMap((node,index)=> {
      const expressions=node.type==='VariableDeclaration' ? node.declarations.map(declaration=>declaration.init) : node.type==='ExpressionStatement' ? [node.expression] : [];
      return expressions.some(expression=>expression?.type==='CallExpression' && expression.callee.type==='Identifier' && /^use[A-Z]/.test(expression.callee.name)) ? [index] : [];
    });
    assert.ok(guardIndex>Math.max(...hookIndices),`${file}: all hooks precede auth guard`);
  }
  assert.match(read('app/(tabs)/me/settings.js'),/useState\(\{ \.\.\.user\?\.settings \}\)/);
  assert.match(read('src/screens/profile/ProfileScreen.js'),/if \(!ready \|\| !profileId\) return;/);
});
