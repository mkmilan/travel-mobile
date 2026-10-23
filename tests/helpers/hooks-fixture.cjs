// Small deterministic hook host: runs the real hook/component source while
// mocking native navigation and React scheduling, never a network or device.
function hooksFixture() {
  const cells=[],effects=[],focusEffects=[];let cursor=0,focused=true;
  const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
  const useMemo=(create,deps)=>{const i=cursor++;if(!cells[i]||!equal(cells[i].deps,deps))cells[i]={value:create(),deps};return cells[i].value;};
  const hooks={
    useState(initial){const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
    useRef(initial){const i=cursor++;return cells[i]||=( {current:initial});},
    useMemo,useCallback:(callback,deps)=>useMemo(()=>callback,deps),
    useEffect(callback,deps){const i=cursor++;if(!cells[i]||!equal(cells[i].deps,deps)){const previous=cells[i];cells[i]={deps,cleanup:previous?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=callback();});}},
    useSyncExternalStore:(_subscribe,get)=>get(),
    useFocusEffect(callback){const i=cursor++;if(focusEffects[i]?.callback!==callback){focusEffects[i]?.cleanup?.();focusEffects[i]={callback};if(focused)effects.push(()=>{focusEffects[i].cleanup=callback();});}},
  };
  return {hooks,render(callback){cursor=0;const result=callback();while(effects.length)effects.shift()();return result;},
    blur(){focused=false;focusEffects.forEach(entry=>{entry.cleanup?.();entry.cleanup=null;});},
    focus(){if(focused)return;focused=true;focusEffects.forEach(entry=>{entry.cleanup=entry.callback();});},
    unmount(){cells.forEach(cell=>cell?.cleanup?.());focusEffects.forEach(entry=>entry.cleanup?.());},
  };
}
function authFixture(){
  let state={token:'session-one',user:{_id:'actor'},sessionEpoch:0,isSessionChanging:false};const listeners=new Set();
  const store=select=>select?select(state):state;
  store.getState=()=>state;store.subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
  return {store,set(next){const previous=state;state={sessionEpoch:state.sessionEpoch+(next.token!==state.token||next.user?._id!==state.user?._id?1:0),isSessionChanging:false,...next};listeners.forEach(listener=>listener(state,previous));}};
}
module.exports={hooksFixture,authFixture};
