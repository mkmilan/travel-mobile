const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
function load(file, expression, dependencies = {}) {
  const source = read(file).replace(/^import[\s\S]*?;\r?\n/gm, '')
    .replace(/export default function/g, 'function').replace(/export default \w+;/g, '').replace(/export /g, '');
  const code = babel.transformSync(source, {configFile:false, babelrc:false,
    plugins:[['@babel/plugin-transform-react-jsx', {pragma:'h'}]]}).code;
  return vm.runInNewContext(code + `\n;(${expression});`, {console, ...require('../../src/constants/featureFlags'), ...dependencies});
}
function fixture(file, name, props = {}, dependencies = {}) {
  const cells = []; let index = 0;
  const ref = {current:null};
  const component = load(file, name, {
    h:(type, props, ...children) => ({type, props:props || {}, children:children.flat(Infinity)}),
    forwardRef:fn=>fn,
    React:{Fragment:"Fragment"},
    useState(initial) {
      const i=index++;
      if (!(i in cells)) cells[i]=typeof initial === 'function' ? initial() : initial;
      return [cells[i], value=>{cells[i]=typeof value === 'function' ? value(cells[i]) : value;}];
    },
    useRef(initial) {const i=index++; return cells[i] ||= {current:initial};},
    useImperativeHandle:(ref,create)=>{ref.current=create();},
    useEffect() {},
    useFocusEffect() {},
    useCallback: callback => callback,
    ...dependencies,
  });
  return {ref, render:()=>{index=0;return component(props, ref);}, setState:(i,value)=>{cells[i]=value;}};
}
function nodes(tree, type) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(!type || tree.type === type ? [tree] : []), ...(tree.children || []).flatMap(child=>nodes(child,type)), ...nodes(tree.props?.ListHeaderComponent,type)];
}
const theme = {space:{sm:8, md:12, lg:24}, radius:{md:12,lg:20},fontSize:{sm:14,md:16,lg:20},colors:{}};
const native = {recordingHero:'recording-journey.png', ...Object.fromEntries(['Image','View','Text','TextInput','Pressable','ScrollView','Modal','SafeAreaView','SafeAreaProvider','KeyboardAvoidingView','ActivityIndicator','FlatList','TouchableOpacity'].map(name=>[name,name]))};
module.exports = {read, load, fixture, nodes, theme, native};
