const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={HTMLElement:class {},customElements:{get(){},define(){}},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.api={transformMeasuredTextBox,checkMeasuredTextReserve,measureLegacyHeatingSvgText,stageLegacyHeatingTextCandidate,namespaceLegacyHeatingSvgIds};',context);
const {transformMeasuredTextBox:transform,checkMeasuredTextReserve:checkRaw,measureLegacyHeatingSvgText:measure,stageLegacyHeatingTextCandidate:stage,namespaceLegacyHeatingSvgIds:namespace}=context.api;
const check=(a,b)=>checkRaw(a,b,'theme-1');
const identity={a:1,b:0,c:0,d:1,e:0,f:0};
const plain=x=>JSON.parse(JSON.stringify(x));
test('transforms measured glyph bounds and stroke conservatively',()=>{
  assert.deepEqual(plain(transform({x:1,y:2,width:4,height:2},{a:0,b:1,c:-1,d:0,e:10,f:20},2)),{x:5,y:20,width:4,height:6});
  assert.equal(transform({x:0,y:0,width:1,height:1},{...identity,a:0},0),null);
  assert.equal(transform({x:0,y:0,width:Infinity,height:1},identity,0),null);
  const max=Number.MAX_VALUE;
  assert.equal(transform({x:0,y:0,width:0,height:0},{a:max,b:max,c:max,d:max,e:0,f:0},0),null);
});
function fixture() {
  const listeners={}; let ready;
  const fonts={status:'loading',ready:new Promise(resolve=>{ready=resolve;}),addEventListener:(event,fn)=>listeners[event]=fn};
  const style={length:0,getPropertyValue(){return '';},width:'400px',boxSizing:'content-box',font:'10px sans-serif',fontFamily:'sans-serif',fontSize:'10px',fontWeight:'400',fontStyle:'normal',fontStretch:'normal',letterSpacing:'normal',wordSpacing:'normal',stroke:'none',strokeWidth:'0px',strokeLinejoin:'round',direction:'ltr',writingMode:'horizontal-tb',textAnchor:'start',textRendering:'auto',vectorEffect:'none',filter:'none',clipPath:'none',mask:'none'};
  const doc={fonts,defaultView:{getComputedStyle:()=>style}};
  const node={ownerDocument:doc,isConnected:true,textContent:'sample',getScreenCTM:()=>identity,getBBox:()=>({...node.box}),box:{x:0,y:0,width:10,height:4}};
  const svg={ownerDocument:doc,isConnected:true,getScreenCTM:()=>identity,getBoundingClientRect:()=>({width:400,height:150}),querySelectorAll:()=>[node],contains:n=>n===node}; node.parentElement=svg;
  return {fonts,listeners,style,node,svg,ready:()=>{fonts.status='loaded';ready();}};
}
test('waits for fonts and invalidates font, style, inventory and overflow changes',async()=>{
  const f=fixture(); let settled=false;
  const pending=measure(f.svg,'theme-1').then(x=>{settled=true;return x;});
  await Promise.resolve(); assert.equal(settled,false);
  f.ready(); const initial=await pending;
  assert.equal(initial.reason,'text-inventory-validation-required');
  const same=await measure(f.svg,'theme-1');
  assert.equal(check(initial,same).textReserve,'fits');
  assert.equal(checkRaw(initial,same,'theme-2').reason,'text-reserve-invalidated');
  assert.equal(check(initial,await measure(f.svg,'theme-2')).reason,'text-reserve-invalidated');
  f.node.box.width=11; f.style.fontWeight='700';
  assert.equal(check(initial,await measure(f.svg,'theme-1')).reason,'text-reserve-overflow');
  f.node.box.width=10;
  assert.equal(check(initial,await measure(f.svg,'theme-1')).reason,'text-reserve-invalidated');
  f.style.fontWeight='400'; f.listeners.loadingdone();
  assert.equal(check(initial,await measure(f.svg,'theme-1')).reason,'text-reserve-invalidated');
  f.style.filter='url(#shadow)';
  assert.equal((await measure(f.svg,'theme-1')).reason,'text-effect-unproven');
});
test('rejects empty nonempty-text bounds, decorations and hidden shadow hosts',async()=>{
  const f=fixture(); f.ready();
  f.node.box.width=0;
  assert.equal((await measure(f.svg,'theme-1')).reason,'text-measurement-unavailable');
  f.node.box.width=10; f.style.textDecorationLine='underline';
  assert.equal((await measure(f.svg,'theme-1')).reason,'text-effect-unproven');
  f.style.textDecorationLine='none';
  f.style.stroke='#000'; f.style.strokeWidth='10%';
  assert.equal((await measure(f.svg,'theme-1')).reason,'text-effect-unproven');
  f.style.stroke='none'; f.style.strokeWidth='0px';
  const host={parentElement:null,getRootNode:()=>({})};
  f.svg.getRootNode=()=>({host});
  const original=f.svg.ownerDocument.defaultView.getComputedStyle;
  f.svg.ownerDocument.defaultView.getComputedStyle=el=>el===host ? {...f.style,display:'none'} : original(el);
  assert.equal((await measure(f.svg,'theme-1')).reason,'text-effect-unproven');
  f.svg.ownerDocument.defaultView.getComputedStyle=el=>el===host ? {...f.style,textDecorationLine:'overline'} : original(el);
  assert.equal((await measure(f.svg,'theme-1')).reason,'text-effect-unproven');
  f.svg.ownerDocument.defaultView.getComputedStyle=el=>el===host ? {...f.style,perspective:'500px'} : original(el);
  assert.equal((await measure(f.svg,'theme-1')).reason,'text-effect-unproven');
});
test('reserve check remeasures live and rejects changes after the current snapshot',async()=>{
  const f=fixture(); f.ready();
  const reserve=await measure(f.svg,'theme-1');
  let current=await measure(f.svg,'theme-1');
  f.listeners.loadingdone();
  assert.equal(check(reserve,current).reason,'text-reserve-invalidated');
  const updatedReserve=await measure(f.svg,'theme-1');
  current=await measure(f.svg,'theme-1');
  f.node.textContent='other';
  assert.equal(check(updatedReserve,current).reason,'text-reserve-invalidated');
  f.node.textContent='sample';
  current=await measure(f.svg,'theme-1'); f.node.isConnected=false;
  assert.equal(check(updatedReserve,current).reason,'text-reserve-invalidated');
  f.node.isConnected=true; current=await measure(f.svg,'theme-1');
  f.style.fontWeight='700';
  assert.equal(check(updatedReserve,current).reason,'text-reserve-invalidated');
  f.style.fontWeight='400'; current=await measure(f.svg,'theme-1');
  f.svg.querySelectorAll=()=>[];
  assert.equal(check(updatedReserve,current).reason,'text-reserve-invalidated');
});
test('a later stale entry invalidates the whole inventory before reporting overflow',async()=>{
  const f=fixture(); f.ready();
  const second={...f.node,textContent:'second',box:{x:0,y:0,width:10,height:4}};
  second.getBBox=()=>({...second.box});
  f.svg.querySelectorAll=()=>[f.node,second];
  f.svg.contains=node=>node===f.node || node===second;
  const reserve=await measure(f.svg,'theme-1');
  f.node.box.width=11;
  const current=await measure(f.svg,'theme-1');
  second.textContent='stale';
  assert.equal(check(reserve,current).reason,'text-reserve-invalidated');
  second.textContent='second';
  assert.equal(check(reserve,current).reason,'text-reserve-overflow');
});
function stagingFixture() {
  const f=fixture(), doc=f.svg.ownerDocument, host={isConnected:true,parentElement:null,getRootNode:()=>({})};
  const root={host,querySelectorAll:()=>[]};
  const parent={nodeType:1,isConnected:true,ownerDocument:doc,parentElement:null,getRootNode:()=>root,append(element){element.isConnected=true;element.parentElement=this;element.parentNode=this;this.child=element;}};
  f.svg.localName='svg'; f.svg.namespaceURI='http://www.w3.org/2000/svg'; f.svg.id=''; f.svg.attributes=[];
  f.svg.getRootNode=()=>root;
  f.svg.querySelectorAll=selector=>selector==='[id]'?[]:[f.node];
  f.node.localName='text'; f.node.namespaceURI='http://www.w3.org/2000/svg'; f.node.id=''; f.node.attributes=[];
  let removed=false;
  doc.createElement=name=>{
    if(name==='template') return {content:{children:[f.svg],childNodes:[f.svg]},set innerHTML(value){this.value=value;}};
    return {style:{},setAttribute(){},append(svg){svg.parentElement=this;svg.parentNode=this;},remove(){removed=true;this.isConnected=false;}};
  };
  return {...f,parent,root,removed:()=>removed};
}
test('staging measures a connected same-shadow candidate and always cleans up',async()=>{
  const f=stagingFixture(); f.ready();
  const result=await stage(f.parent,'<svg></svg>','theme-1',1,n=>n===1);
  assert.equal(result.reason,'text-stage-style-and-paint-validation-required');
  assert.equal(result.textCount,1);
  assert.equal(f.removed(),true);
});
test('identical baseline text parity is checked with and without the staged sibling',async()=>{
  const f=stagingFixture(); f.ready();
  const reference={...f.svg,parentNode:f.parent,parentElement:f.parent}, text={...f.node};
  text.parentElement=reference; reference.querySelectorAll=()=>[text]; reference.contains=n=>n===text;
  const result=await stage(f.parent,'<svg></svg>','theme-1',1,()=>true,reference);
  assert.equal(result.reason,'text-stage-style-and-paint-validation-required');
  assert.equal(result.textStyleParity,'identical-baseline-only');
  assert.equal(f.removed(),true);
  const near=stagingFixture(); near.ready();
  const nearRef={...near.svg,parentNode:near.parent,parentElement:near.parent}, nearText={...near.node};
  nearText.parentElement=nearRef; nearText.getBBox=()=>({x:5e-10,y:0,width:10,height:4});
  nearRef.querySelectorAll=()=>[nearText]; nearRef.contains=n=>n===nearText;
  const tolerant=await stage(near.parent,'<svg></svg>','theme-1',1,()=>true,nearRef);
  assert.equal(tolerant.textStyleParity,'identical-baseline-only');
  assert.ok(tolerant.boxes[0].x<0 && tolerant.boxes[0].width>10);
  const far=stagingFixture(); far.ready();
  const farRef={...far.svg,parentNode:far.parent,parentElement:far.parent}, farText={...far.node};
  farText.parentElement=farRef; farText.getBBox=()=>({x:1e-6,y:0,width:10,height:4});
  farRef.querySelectorAll=()=>[farText]; farRef.contains=n=>n===farText;
  assert.equal((await stage(far.parent,'<svg></svg>','theme-1',1,()=>true,farRef)).reason,'text-stage-style-mismatch');
  // Pairwise tolerances must not add up between staging, live and post-cleanup.
  const drift=stagingFixture(); drift.ready();
  const driftRef={...drift.svg,parentNode:drift.parent,parentElement:drift.parent}, driftText={...drift.node};
  let reads=0; driftText.parentElement=driftRef;
  driftText.getBBox=()=>{const d=++reads<=2 ? 0.9e-9 : 1.8e-9; return {x:d,y:d,width:10+d,height:4+d};};
  driftRef.querySelectorAll=()=>[driftText]; driftRef.contains=n=>n===driftText;
  assert.equal((await stage(drift.parent,'<svg></svg>','theme-1',1,()=>true,driftRef)).reason,'text-stage-style-mismatch');
  const g=stagingFixture(); g.ready();
  const changed={...g.svg,parentNode:g.parent,parentElement:g.parent}, other={...g.node,textContent:'different'};
  other.parentElement=changed; changed.querySelectorAll=()=>[other]; changed.contains=n=>n===other;
  assert.equal((await stage(g.parent,'<svg></svg>','theme-1',1,()=>true,changed)).reason,'text-stage-style-mismatch');
  assert.equal(g.removed(),true);
});
test('translated text parity accepts only matching style and linear matrix',async()=>{
  const f=stagingFixture();f.ready();
  const reference={...f.svg,parentNode:f.parent,parentElement:f.parent},text={...f.node};
  text.parentElement=reference;text.getScreenCTM=()=>({...identity,e:10,f:7});
  reference.querySelectorAll=()=>[text];reference.contains=n=>n===text;
  let result=await stage(f.parent,'<svg></svg>','theme-1',1,()=>true,reference,undefined,false,'translated');
  assert.equal(result.textStyleParity,'translated-text-only');
  const linear=stagingFixture();linear.ready();
  const ref2={...linear.svg,parentNode:linear.parent,parentElement:linear.parent},text2={...linear.node};
  text2.parentElement=ref2;text2.getScreenCTM=()=>({...identity,a:1.1,e:10});
  ref2.querySelectorAll=()=>[text2];ref2.contains=n=>n===text2;
  result=await stage(linear.parent,'<svg></svg>','theme-1',1,()=>true,ref2,undefined,false,'translated');
  assert.equal(result.reason,'text-stage-style-mismatch');
  const css=stagingFixture();css.ready();
  const ref3={...css.svg,parentNode:css.parent,parentElement:css.parent},text3={...css.node};
  text3.parentElement=ref3;ref3.querySelectorAll=()=>[text3];ref3.contains=n=>n===text3;
  css.svg.ownerDocument.defaultView.getComputedStyle=node=>node===text3?{...css.style,fontWeight:'700'}:css.style;
  result=await stage(css.parent,'<svg></svg>','theme-1',1,()=>true,ref3,undefined,false,'translated');
  assert.equal(result.reason,'text-stage-style-mismatch');
  const viewport=stagingFixture();viewport.ready();
  const ref4={...viewport.svg,parentNode:viewport.parent,parentElement:viewport.parent,getScreenCTM:()=>({...identity,a:1.1})},text4={...viewport.node};
  text4.parentElement=ref4;ref4.querySelectorAll=()=>[text4];ref4.contains=n=>n===text4;
  result=await stage(viewport.parent,'<svg></svg>','theme-1',1,()=>true,ref4,undefined,false,'translated');
  assert.equal(result.reason,'text-stage-viewport-unproven');
});
test('fixed viewport measures translated text boxes independently without authorizing paint',async()=>{
  const f=stagingFixture();f.ready();f.style.height='150px';f.svg.style={};
  f.node.getAttribute=name=>({x:'137',y:'338',class:'wc wt wo'})[name];
  const reference={...f.svg,parentNode:f.parent,parentElement:f.parent},text={...f.node};
  text.parentElement=reference;text.getBBox=()=>({x:30,y:15.000001,width:10,height:4});
  reference.querySelectorAll=()=>[text];reference.contains=n=>n===text;
  const result=await stage(f.parent,'<svg></svg>','theme-1',1,()=>true,reference,undefined,true,'independent',true);
  assert.equal(result.status,'unsupported');
  assert.equal(result.textStyleParity,'independent-text-measurements-only');
  assert.notEqual(result.textRecords[0].box.x,result.referenceTextRecords[0].box.x);
  const changed=stagingFixture();changed.ready();changed.style.height='150px';changed.svg.style={};
  const ref={...changed.svg,parentNode:changed.parent,parentElement:changed.parent},node={...changed.node};
  node.parentElement=ref;ref.querySelectorAll=()=>[node];ref.contains=n=>n===node;
  changed.svg.ownerDocument.defaultView.getComputedStyle=el=>el===node?{...changed.style,fontWeight:'700'}:changed.style;
  assert.equal((await stage(changed.parent,'<svg></svg>','theme-1',1,()=>true,ref,undefined,false,'independent',true)).reason,'text-stage-style-mismatch');
});
test('screen transform changes after stage cleanup invalidate parity',async()=>{
  const f=stagingFixture();f.ready();
  const reference={...f.svg,parentNode:f.parent,parentElement:f.parent,
    getScreenCTM:()=>f.removed()?{...identity,a:2,d:2}:identity};
  const text={...f.node};text.parentElement=reference;
  reference.querySelectorAll=()=>[text];reference.contains=n=>n===text;
  const result=await stage(f.parent,'<svg></svg>','theme-1',1,()=>true,reference,undefined,false,'translated');
  assert.equal(result.reason,'text-stage-viewport-unproven');
  assert.equal(f.removed(),true);
});
test('staging discards stale generations after fonts resolve and cleans up',async()=>{
  const f=stagingFixture(); let generation=1;
  const pending=stage(f.parent,'<svg></svg>','theme-1',1,n=>n===generation);
  generation=2; f.ready();
  assert.equal((await pending).reason,'text-stage-invalidated');
  assert.equal(f.removed(),true);
});
test('aborting a pending font wait removes staging without waiting for fonts',async()=>{
  const f=stagingFixture(), controller=new AbortController();
  const pending=stage(f.parent,'<svg></svg>','theme-1',1,()=>true,undefined,controller.signal);
  controller.abort();
  assert.equal((await pending).reason,'text-stage-invalidated');
  assert.equal(f.removed(),true);
});
test('staging discards a reparented candidate and removes the owned SVG',async()=>{
  const f=stagingFixture(); let svgRemoved=false;
  f.svg.remove=()=>{svgRemoved=true;f.svg.isConnected=false;};
  const pending=stage(f.parent,'<svg></svg>','theme-1',1,()=>true);
  f.svg.parentNode={}; f.ready();
  assert.equal((await pending).reason,'text-stage-invalidated');
  assert.equal(svgRemoved,true);
  assert.equal(f.removed(),true);
});
test('staging refuses active SVG elements before mounting',async()=>{
  const f=stagingFixture(); f.ready(); f.node.localName='animate';
  assert.equal((await stage(f.parent,'<svg></svg>','theme-1',1,()=>true)).reason,'text-stage-invalid-candidate');
  assert.equal(f.removed(),false);
});
test('staging namespaces only local references and rejects ambiguous or active SVG',()=>{
  const element=(localName,attrs={})=>({localName,namespaceURI:'http://www.w3.org/2000/svg',id:attrs.id||'',
    attributes:Object.entries(attrs).map(([name,value])=>({name,value})),
    style:attrs.style?{0:'fill',length:1,getPropertyValue:()=>attrs.style.slice(5),getPropertyPriority:()=>''}:undefined,
    setAttribute(name,value){if(name==='id')this.id=value;const a=this.attributes.find(a=>a.name===name);if(a)a.value=value;}});
  const def=element('linearGradient',{id:'shared'}), path=element('path',{style:'fill:url(#shared)',href:'#shared'});
  const svg=element('svg'); svg.querySelectorAll=()=>[def,path];
  const root={querySelectorAll:()=>[{id:'shared'}]};
  assert.equal(namespace(svg,root).status,'prepared');
  assert.notEqual(def.id,'shared');
  assert.equal(path.attributes.find(a=>a.name==='href').value,'#'+def.id);
  assert.equal(path.attributes.find(a=>a.name==='style').value,'fill:url(#'+def.id+')');
  path.attributes.find(a=>a.name==='href').value='#external';
  assert.equal(namespace(svg,root).reason,'text-stage-unresolved-reference');
  path.localName='set';
  assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');
});
test('staging rejects escaped or comment-obfuscated CSS resource references',()=>{
  const element=(name,value)=>({localName:'path',namespaceURI:'http://www.w3.org/2000/svg',id:'',attributes:[{name,value}],setAttribute(){}});
  const svg={localName:'svg',namespaceURI:'http://www.w3.org/2000/svg',id:'',attributes:[],querySelectorAll:()=>[child]};
  const root={querySelectorAll:()=>[]};
  let child=element('fill','u\\72l(https://example.test/x)');
  assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');
  child=element('style','fill:u\\72l(https://example.test/x)');
  assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');
  child=element('fill','u/**/rl(https://example.test/x)');
  assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');
});
test('staging rejects parsed inline layout and external image properties',()=>{
  const element=(property,value)=>({localName:'path',namespaceURI:'http://www.w3.org/2000/svg',id:'',
    attributes:[{name:'style',value:`${property}:${value}`}],
    style:{0:property,length:1,getPropertyValue:()=>value,getPropertyPriority:()=>''},setAttribute(){}});
  const svg={localName:'svg',namespaceURI:'http://www.w3.org/2000/svg',id:'',attributes:[],querySelectorAll:()=>[child]};
  const root={querySelectorAll:()=>[]};
  let child=element('position','fixed');
  assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');
  child=element('background-image','image-set("https://example.test/x" 1x)');
  assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');
  child=element('fill','image-set("https://example.test/x" 1x)');
  assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');
});
