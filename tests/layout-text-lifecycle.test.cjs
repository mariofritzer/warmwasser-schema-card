const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const registry=new Map();
const context={HTMLElement:class {},AbortController,customElements:{get:n=>registry.get(n),define:(n,c)=>registry.set(n,c)},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.api={layoutCandidateViewport,renderLayoutViewport,requestLayoutVolumeMeasurement,cancelLayoutTextMeasurement,preflightLayoutRender,prepareLayoutCandidate,setStage:fn=>{stageLegacyHeatingTextCandidate=fn;}};',context);
const {layoutCandidateViewport:viewport,renderLayoutViewport:renderViewport,requestLayoutVolumeMeasurement:request,cancelLayoutTextMeasurement:cancel,preflightLayoutRender:preflight,prepareLayoutCandidate:prepare,setStage}=context.api;
test('viewport contract rejects malformed, unrepresentable and degenerate dimensions',()=>{
  const parse=value=>viewport({getAttribute:()=>value});
  assert.equal(parse('0 -30 518 445').viewBox,'0 -30 518 445');
  assert.equal(parse('0, -30, 518, 445').viewBox,'0 -30 518 445');
  for(const value of ['0,,0 100 100','0, ,0 100 100',',0 0 100 100','0 0 100 100,','0 0 0 20','0 0 1e309 2','0x10 0 20 20','1e308 0 1 20','0 0 5e-324 1e308']) assert.equal(parse(value),null,value);
});
test('candidate and fallback use the same fixed host and viewBox',()=>{
  const v=viewport({getAttribute:()=>'-10 -30 518 445'});
  const fallback=renderViewport('<div>header</div><svg viewBox="0 -30 486 430"><text>fallback</text></svg>',v);
  const candidate=renderViewport('<div>header</div><svg viewBox="-10 -30 518 445"><text>candidate</text></svg>',v);
  for(const html of [fallback,candidate]) {
    assert.match(html,/data-layout-viewport/);assert.match(html,/aspect-ratio:518\/445/);
    assert.match(html,/<svg viewBox="-10 -30 518 445" style="position:absolute/);
  }
  assert.equal(renderViewport('<svg viewBox="0 0 10 10"></svg><svg></svg>',v),null);
  assert.equal(renderViewport('<svg viewBox="-100 -30 600 445"></svg>',v),null);
  assert.equal(renderViewport('<svg viewBox="0 0 10 10"></svg>',{...v,width:'100;position:fixed'}),null);
});
function fixture(kind='card') {
  const handlers=new Map(),mutations=[],resizes=[],calls=[];
  const fonts={addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:(n,f)=>{if(handlers.get(n)===f)handlers.delete(n);}};
  class Mutation {constructor(fn){this.fn=fn;mutations.push(this);}observe(){}disconnect(){this.disconnected=true;}}
  class Resize {constructor(fn){this.fn=fn;resizes.push(this);}observe(){}disconnect(){this.disconnected=true;}}
  const view={AbortController,MutationObserver:Mutation,ResizeObserver:Resize};
  const doc={fonts,defaultView:view,head:null,createElement:()=>({content:{querySelectorAll:()=>{
    const box=doc.lastHTML.match(/<svg viewBox="([^"]+)"/)?.[1] || '0 -30 600 500';
    return [{outerHTML:`<svg viewBox="${box}"></svg>`,getAttribute:()=>box}];
  }},set innerHTML(v){doc.lastHTML=v;}})};
  const host={isConnected:true,parentElement:null,ownerDocument:doc,getRootNode:()=>({}),getBoundingClientRect(){return {width:this.width,height:this.height};},width:200,height:100};
  let box='0 -30 486 430';
  const root={host,querySelectorAll:()=>[]},parent={isConnected:true,ownerDocument:doc,getRootNode:()=>root};
  const slot={querySelector:()=>reference};
  const reference={isConnected:true,parentNode:slot,getAttribute:()=>box,setAttribute:(_name,value)=>{box=value;}};
  parent.querySelector=selector=>selector==='[data-layout-viewport]' ? slot : reference;
  const card=new (registry.get('warmwasser-schema-card'))();card.isConnected=true;card._cfg={sprache:'en'};card._ents=['sensor.a'];card._hass={language:'en',states:{}};card._box=parent;card._update=()=>{};card._layoutFeatureEnabled=()=>true;
  const owner=kind==='card'?card:new (registry.get('warmwasser-schema-card-editor'))();
  if(kind==='editor') {owner.isConnected=true;owner._config={};owner._hass=card._hass;owner._layoutPanel={previewRoot:parent,overlay:{},apply:{disabled:false},status:{textContent:''}};owner._layoutDraft={history:[{version:2}],index:0};owner._positionLayoutOverlay=()=>{owner.overlayUpdates=(owner.overlayUpdates||0)+1;};}
  setStage((_parent,_html,_key,_generation,_current,_reference,signal)=>new Promise(resolve=>{
    calls.push({signal,resolve});signal.addEventListener('abort',()=>resolve({reason:'text-stage-invalidated'}),{once:true});
  }));
  return {owner,card,parent,host,doc,handlers,mutations,resizes,calls,reference};
}
test('both owners expose the candidate viewport without changing the visible fallback',async()=>{
  for(const kind of ['card','editor']) {
    const f=fixture(kind);const result=request(f.owner,f.card,'candidate');
    assert.equal(result.viewport.viewBox,'0 -30 600 500');
    await Promise.resolve();assert.equal(f.reference.getAttribute('viewBox'),'0 -30 486 430');
    cancel(f.owner);assert.equal(f.reference.getAttribute('viewBox'),'0 -30 486 430');
  }
});
test('drag rejects viewport binding before staging',async()=>{
  const f=fixture('editor');f.owner._layoutDrag={};request(f.owner,f.card,'candidate');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.length,0);assert.equal(f.reference.getAttribute('viewBox'),'0 -30 486 430');
});
test('cancellation before the pending microtask does not alter either viewport',async()=>{
  for(const kind of ['card','editor']) {
    const f=fixture(kind);request(f.owner,f.card,'candidate');cancel(f.owner);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.calls.length,0);assert.equal(f.reference.getAttribute('viewBox'),'0 -30 486 430');
  }
});
test('first mount establishes a nonzero resize baseline after the fixed host exists',async()=>{
  for(const kind of ['card','editor']) {
    const f=fixture(kind);f.host.height=0;
    assert.equal(request(f.owner,f.card,'candidate').status,'pending');
    f.host.height=100;await Promise.resolve();
    assert.equal(f.calls.length,1);f.resizes[0].fn([]);assert.equal(f.calls[0].signal.aborted,false);
    f.host.height=101;f.resizes[0].fn([]);assert.equal(f.calls[0].signal.aborted,true);
  }
});
test('font or repeated resize aborts without changing the visible viewport',async()=>{
  for(const kind of ['card','editor']) for(const reason of ['font','resize']) {
    const f=fixture(kind);request(f.owner,f.card,'candidate');await Promise.resolve();
    if(reason==='font')f.handlers.get('loading')();
    else { f.host.width++;f.resizes[0].fn([]);f.host.width++;f.resizes[0].fn([]); }
    assert.equal(f.calls[0].signal.aborted,true);assert.equal(f.reference.getAttribute('viewBox'),'0 -30 486 430');
  }
});
test('real Editor preflight of an unsafe volume becomes pending, never a rendered candidate',async()=>{
  const f=fixture('editor'), raw={speicher:{typ:'schicht',volumen:'W'.repeat(80)},fm:{pumpe:'sensor.fm'}};
  const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
  const {x,y}=c._model.components.fm.origin,layout={version:2,components:{fm:{x:x+30,y:y+15}}};
  const hass={language:'en',states:{'sensor.fm':{state:'on',attributes:{}}}};
  f.owner._config=raw;f.owner._hass=hass;
  const result=preflight(raw,layout,hass,f.owner);
  assert.equal(result.status,'pending');assert.equal(result.html,undefined);
  assert.ok(f.doc.lastHTML.includes('W'.repeat(80)),'the actual candidate was rendered for measurement');
  await Promise.resolve();assert.equal(f.calls.length,1);
  f.owner._editLayoutDraft({version:2,components:{}},false);
  assert.equal(f.calls[0].signal.aborted,true);
});
test('real pending Editor path rejects a measured volume overflow and keeps a fitting label unapproved',async()=>{
  for(const [value,width,expected] of [['W'.repeat(80),400,/does not fit/],[500,24,/not complete/]]) {
    const f=fixture('editor'),raw={speicher:{typ:'schicht',volumen:value},fm:{pumpe:'sensor.fm'}};
    const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
    const {x,y}=c._model.components.fm.origin,layout={version:2,components:{fm:{x:x+30,y:y+15}}};
    const hass={language:'en',states:{'sensor.fm':{state:'on',attributes:{}}}};
    f.owner._config=raw;f.owner._hass=hass;
    const records=[{
      text:`${value} l`,x:'137',y:'338',className:'wc wt wo',matrix:{a:1,b:0,c:0,d:1,e:0,f:0},
      box:{x:125,y:329,width,height:10}}];
    setStage(async()=>({reason:'text-stage-style-and-paint-validation-required',textStyleParity:'independent-text-measurements-only',
      textRecords:records,referenceTextRecords:records}));
    assert.equal(preflight(raw,layout,hass,f.owner).status,'pending');
    await new Promise(resolve=>setImmediate(resolve));
    assert.match(f.owner._layoutPanel.status.textContent,expected);
    assert.equal(f.owner._layoutPanel.apply.disabled,true);
  }
});
test('independently overflowing reference rejects an otherwise fitting candidate',async()=>{
  const f=fixture('editor'),raw={speicher:{typ:'schicht',volumen:500},fm:{pumpe:'sensor.fm'}};
  const c=new (registry.get('warmwasser-schema-card'))();c.setConfig(raw);
  const {x,y}=c._model.components.fm.origin,layout={version:2,components:{fm:{x:x+30,y:y+15}}};
  const hass={language:'en',states:{'sensor.fm':{state:'on',attributes:{}}}};f.owner._config=raw;f.owner._hass=hass;
  const good={text:'500 l',x:'137',y:'338',className:'wc wt wo',matrix:{a:1,b:0,c:0,d:1,e:0,f:0},box:{x:125,y:329,width:24,height:10}};
  setStage(async()=>({textStyleParity:'independent-text-measurements-only',textRecords:[good],
    referenceTextRecords:[{...good,box:{...good.box,width:400}}]}));
  assert.equal(preflight(raw,layout,hass,f.owner).status,'pending');await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.owner._layoutPanel.status.textContent,/does not fit/);assert.equal(f.owner._layoutPanel.apply.disabled,true);
});
test('real Card preparation stays pending and setConfig aborts it',async()=>{
  const f=fixture(),raw={speicher:{typ:'schicht',volumen:'W'.repeat(80)},fm:{pumpe:'sensor.fm'}};
  f.card.setConfig(raw);f.card._hass={language:'en',states:{'sensor.fm':{state:'on',attributes:{}}}};
  const {x,y}=f.card._model.components.fm.origin,layout={version:2,components:{fm:{x:x+30,y:y+15}}};
  const result=prepare(f.card,raw,layout,f.card);
  assert.equal(result.status,'pending');assert.equal(result.html,undefined);
  assert.ok(f.doc.lastHTML.includes('W'.repeat(80)));
  await Promise.resolve();assert.equal(f.calls.length,1);
  f.card.setConfig({...raw,titel:'changed'});
  assert.equal(f.calls[0].signal.aborted,true);
});
test('shared pending state cancels on Card HA changes and never exposes HTML',async()=>{
  const f=fixture();
  assert.equal(request(f.owner,f.card,'candidate').status,'pending');
  assert.equal(request(f.owner,f.card,'candidate').status,'pending');
  await Promise.resolve();assert.equal(f.calls.length,1);
  f.owner.hass={language:'en',states:{'sensor.a':{state:'on'}}};
  assert.equal(f.calls[0].signal.aborted,true);
  assert.ok(f.mutations[0].disconnected && f.resizes[0].disconnected);
  assert.equal(f.handlers.size,0);
});
test('irrelevant HA updates keep Card and Editor measurements alive',async()=>{
  for(const kind of ['card','editor']) {
    const f=fixture(kind);f.card._hass={language:'en',states:{'sensor.a':{state:'on',attributes:{}}}};
    f.owner._hass=f.card._hass;
    if(kind==='editor'){f.owner._refreshLayoutUI=()=>{};f.owner._refreshSavedLayoutNotice=()=>{};}
    assert.equal(request(f.owner,f.card,'candidate').status,'pending');await Promise.resolve();
    for(let i=0;i<5;i++)f.owner.hass={language:'en',states:{'sensor.a':{state:'on',attributes:{}},'sensor.other':{state:String(i)}}};
    assert.equal(f.calls[0].signal.aborted,false,kind);
    assert.equal(request(f.owner,f.card,'candidate').status,'pending');
    await Promise.resolve();assert.equal(f.calls.length,1,kind);
    f.owner.hass={language:'en',states:{'sensor.a':{state:'off',attributes:{}}}};
    assert.equal(f.calls[0].signal.aborted,true,kind);
  }
});
test('Editor draft, disconnect, font, theme and viewport changes abort pending work',async()=>{
  for(const reason of ['draft','disconnect','font','theme','viewport']) {
    const f=fixture('editor');assert.equal(request(f.owner,f.card,'candidate').status,'pending');
    await Promise.resolve();const signal=f.calls[0].signal;
    if(reason==='draft')f.owner._editLayoutDraft({version:2,components:{}},false);
    if(reason==='disconnect')f.owner.disconnectedCallback();
    if(reason==='font')f.handlers.get('loading')();
    if(reason==='theme')f.mutations[0].fn([]);
    if(reason==='viewport'){f.resizes[0].fn([]);assert.equal(signal.aborted,false);f.host.width++;f.resizes[0].fn([]);}
    assert.equal(signal.aborted,true,reason);
    assert.ok(f.mutations[0].disconnected && f.resizes[0].disconnected,reason);
    assert.equal(f.owner._layoutPanel.apply.disabled,true,reason);
  }
});
test('a completed measurement stays unsupported and is never reused',async()=>{
  const f=fixture('editor');assert.equal(request(f.owner,f.card,'candidate').status,'pending');
  await Promise.resolve();f.calls[0].resolve({reason:'text-stage-style-and-paint-validation-required'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.owner._layoutPanel.status.textContent,/not complete/);
  assert.equal(request(f.owner,f.card,'candidate').status,'pending');
  await Promise.resolve();assert.equal(f.calls.length,2);
  cancel(f.owner);
});
test('in-place HA mutation discards the pending result and cleans observers',async()=>{
  const f=fixture('editor');f.owner._hass.states['sensor.a']={state:'1'};
  assert.equal(request(f.owner,f.card,'candidate').status,'pending');
  await Promise.resolve();f.owner._hass.states['sensor.a'].state='2';
  f.calls[0].resolve({reason:'text-stage-style-and-paint-validation-required'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls[0].signal.aborted,true);
  assert.ok(f.mutations[0].disconnected && f.resizes[0].disconnected);
  assert.equal(f.owner._layoutPanel.apply.disabled,true);
});
test('a stale observer callback cannot cancel a newer generation',async()=>{
  const f=fixture('editor');
  assert.equal(request(f.owner,f.card,'first').status,'pending');await Promise.resolve();
  const stale=f.mutations[0].fn;
  assert.equal(request(f.owner,f.card,'second').status,'pending');await Promise.resolve();
  assert.equal(f.calls[0].signal.aborted,true);
  assert.equal(f.calls[1].signal.aborted,false);
  stale([]);
  assert.equal(f.calls[1].signal.aborted,false);
  cancel(f.owner);
});
