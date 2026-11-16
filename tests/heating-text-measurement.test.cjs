const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={HTMLElement:class {},customElements:{get(){},define(){}},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.api={transformMeasuredTextBox,checkMeasuredTextReserve,measureLegacyHeatingSvgText,stageLegacyHeatingTextCandidate,namespaceLegacyHeatingSvgIds,setTargetCheck:fn=>{const old=inspectLayoutTargetReferences;inspectLayoutTargetReferences=fn;return old;}};',context);
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
  const parent={nodeType:1,isConnected:true,ownerDocument:doc,parentElement:null,getRootNode:()=>root,
    append(element){element.isConnected=true;element.parentElement=this;element.parentNode=this;if(element.child)element.child.isConnected=true;this.child=element;},
    removeChild(element){element.isConnected=false;element.parentNode=null;element.parentElement=null;return element;},
    insertBefore(element){element.isConnected=true;element.parentNode=this;element.parentElement=this;this.lastInserted=element;return element;}};
  f.svg.localName='svg'; f.svg.namespaceURI='http://www.w3.org/2000/svg'; f.svg.id=''; f.svg.attributes=[];
  f.svg.removeAttribute=()=>{};
  f.svg.cloneNode=()=>({outerHTML:f.svg.outerHTML,removeAttribute(){}});
  f.svg.getRootNode=()=>root;
  f.svg.querySelectorAll=selector=>selector==='[id]'?[]:[f.node];
  f.node.localName='text'; f.node.namespaceURI='http://www.w3.org/2000/svg'; f.node.id=''; f.node.attributes=[];
  let removed=false;
  doc.createElement=name=>{
    if(name==='template') {f.svg.isConnected=false;return {content:{children:[f.svg],childNodes:[f.svg]},set innerHTML(value){this.value=value;}};}
    return {style:{},setAttribute(){},append(svg){this.child=svg;svg.isConnected=true;svg.parentElement=this;svg.parentNode=this;},
      removeChild(svg){this.child=null;svg.isConnected=false;svg.parentNode=null;svg.parentElement=null;return svg;},
      remove(){removed=true;this.isConnected=false;if(this.child)this.child.isConnected=false;}};
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
test('connected staging evidence revalidates synchronously and releases exactly once',async()=>{
  const f=stagingFixture();f.ready();f.style.height='150px';f.svg.style={};
  f.svg.ownerDocument.defaultView.MutationObserver=class {observe(){}takeRecords(){return [];}disconnect(){}};
  const paint={d:'M0 0H10',fill:'red'};
  Object.defineProperty(f.svg,'outerHTML',{enumerable:true,get:()=>`<svg><path d="${paint.d}" fill="${paint.fill}"/></svg>`});
  f.node.getAttribute=name=>({x:'137',y:'338',class:'wc wt wo'})[name];
  const reference={...f.svg,parentNode:f.parent,parentElement:f.parent},text={...f.node};
  text.parentElement=reference;reference.querySelectorAll=()=>[text];reference.contains=n=>n===text;
  const shape=(name,attrs,stroke,width)=>({localName:name,getAttribute:k=>attrs[k]??null,getScreenCTM:()=>identity,
    computed:{stroke,strokeWidth:width,vectorEffect:'none',strokeLinecap:'round',strokeLinejoin:'round'}});
  const drop=shape('path',{d:'M430 30C424 40 421 45 421 49A9 9 0 0 0 439 49C439 45 436 40 430 30Z'},'none','1px');
  const arrows=[shape('path',{class:'wa'},'white','1.6px'),shape('path',{class:'wa'},'white','1.6px')];
  const paths=['w0','w1','w2'].flatMap((cl,i)=>Array.from({length:4},()=>shape('path',{class:cl},'red',['10px','7px','2px'][i])));
  const stubs=Array.from({length:6},()=>shape('rect',{class:'wk'},'black','.8px'));
  f.svg.ownerDocument.defaultView.getComputedStyle=el=>el.computed||f.style;
  f.svg.querySelectorAll=selector=>selector==='[id]'?[]:selector==='*'?[f.node]:selector==='text'?[f.node]
    :selector==='path,circle'?[drop,...arrows,...paths]:selector==='path'?[drop,...arrows,...paths]
    :selector==='rect'?stubs:selector==='[class]'?[...arrows,...paths,...stubs]:[];
  const result=await stage(f.parent,'<svg></svg>','theme-1',1,()=>true,reference,undefined,true,'independent',true,true);
  assert.equal(result.textStyleParity,'independent-text-measurements-only');assert.ok(result.held);
  assert.equal(result.held.validate(),true);
  paint.d='M0 0H999';assert.equal(result.held.validate(),false);assert.equal(result.held.reason,'svg-mutated');
  paint.d='M0 0H10';assert.equal(result.held.validate(),true);
  paint.fill='blue';assert.equal(result.held.validate(),false);assert.equal(result.held.reason,'svg-mutated');
  paint.fill='red';assert.equal(result.held.validate(),true);
  const query=f.svg.querySelectorAll;f.svg.querySelectorAll=selector=>selector==='*'?[{...f.node}]:query(selector);
  assert.equal(result.held.validate(),false);assert.equal(result.held.reason,'svg-mutated');
  f.svg.querySelectorAll=query;assert.equal(result.held.validate(),true);
  f.listeners.loadingdone();assert.equal(result.held.validate(),false);
  result.held.release();result.held.release();assert.equal(result.held.validate(),false);
});
test('candidate and reference mutations during font wait cannot become a new baseline',async()=>{
  for (const target of ['candidate-d','candidate-fill','reference-d','candidate-reverted']) {
    const f=stagingFixture();f.style.height='150px';f.svg.style={};
    let candidate='<svg><path d="M0 0H10" fill="red"/></svg>',referenceMarkup='<svg><path d="M0 0H10" fill="red"/></svg>';
    Object.defineProperty(f.svg,'outerHTML',{enumerable:true,get:()=>candidate});
    let observer;
    f.svg.ownerDocument.defaultView.MutationObserver=class {constructor(){observer=this;this.records=[];}observe(){}takeRecords(){return this.records.splice(0);}disconnect(){}};
    const reference={...f.svg,parentNode:f.parent,parentElement:f.parent},text={...f.node};
    Object.defineProperty(reference,'outerHTML',{get:()=>referenceMarkup});
    text.parentElement=reference;reference.querySelectorAll=()=>[text];reference.contains=n=>n===text;
    const pending=stage(f.parent,'<svg></svg>','theme-1',1,()=>true,reference,undefined,true,'independent',true,true);
    if(target==='candidate-d') candidate='<svg><path d="M0 0H999" fill="red"/></svg>';
    if(target==='candidate-fill') candidate='<svg><path d="M0 0H10" fill="blue"/></svg>';
    if(target==='reference-d') referenceMarkup='<svg><path d="M0 0H999" fill="red"/></svg>';
    if(target==='candidate-reverted') {candidate='<svg><path d="M0 0H999" fill="red"/></svg>';candidate='<svg><path d="M0 0H10" fill="red"/></svg>';observer.records.push({type:'attributes'});}
    f.ready();const result=await pending;
    assert.equal(result.reason,'text-stage-invalidated',target);assert.equal(result.held,undefined,target);assert.equal(f.removed(),true,target);
  }
});
test('target probe uses the measured node once and rolls back on success or failure',async()=>{
  const originalTargetCheck=context.api.setTargetCheck(()=>({reason:'layout-target-references-bound-only'}));
  try {for(const outcome of ['accept','reject','throw','stale','mutate','reparent','reference-mutated','new-owner','clone-replaces-owner','rearm-mutation','commit','commit-scroll','commit-scroll-corrupt','commit-reject','commit-stale','commit-cleanup-owner','commit-cleanup-mutate','commit-receipt-font','commit-receipt-dom','commit-receipt-transient','commit-receipt-transient-late','commit-receipt-reparent']) {
    const f=stagingFixture();f.ready();f.style.height='150px';f.svg.style={};f.svg.outerHTML='<svg/>';
    if(outcome==='rearm-mutation')f.svg.removeAttribute=()=>{f.svg.outerHTML='<svg><path d="M0 0H999"/></svg>';};
    const observers=[];
    f.svg.ownerDocument.defaultView.MutationObserver=class {constructor(){this.records=[];observers.push(this);}observe(){}takeRecords(){return this.records.splice(0);}disconnect(){}};
    f.node.getAttribute=name=>({x:'137',y:'338',class:'wc wt wo'})[name];
    const reference={...f.svg,parentNode:f.parent,parentElement:f.parent,isConnected:true},text={...f.node};
    text.parentElement=reference;reference.querySelectorAll=()=>[text];reference.contains=n=>n===text;
    reference.cloneNode=function(){return {...this,outerHTML:this.outerHTML,parentNode:null,parentElement:null,isConnected:false};};
    const shape=(name,attrs,stroke,width)=>({localName:name,getAttribute:k=>attrs[k]??null,getScreenCTM:()=>identity,
      computed:{stroke,strokeWidth:width,vectorEffect:'none',strokeLinecap:'round',strokeLinejoin:'round'}});
    const drop=shape('path',{d:'M430 30C424 40 421 45 421 49A9 9 0 0 0 439 49C439 45 436 40 430 30Z'},'none','1px');
    const arrows=[shape('path',{class:'wa'},'white','1.6px'),shape('path',{class:'wa'},'white','1.6px')];
    const paths=['w0','w1','w2'].flatMap((cl,i)=>Array.from({length:4},()=>shape('path',{class:cl},'red',['10px','7px','2px'][i])));
    const stubs=Array.from({length:6},()=>shape('rect',{class:'wk'},'black','.8px'));
    f.svg.ownerDocument.defaultView.getComputedStyle=el=>el.computed||f.style;
    let rogueRemovals=0;
    f.svg.remove=function(){if(this.parentNode?.removeChild)this.parentNode.removeChild(this);else {this.parentNode=null;this.isConnected=false;}};
    f.svg.querySelectorAll=selector=>selector==='[id]'?[]:selector==='*'?[f.node]:selector==='text'?[f.node]
      :selector==='path,circle'?[drop,...arrows,...paths]:selector==='path'?[drop,...arrows,...paths]
      :selector==='rect'?stubs:selector==='[class]'?[...arrows,...paths,...stubs]:[];
    let fresh=true,owner=true;const replacement={isConnected:false};
    const staged=await stage(f.parent,'<svg></svg>','theme-1',1,()=>fresh,reference,undefined,true,'independent',true,true,()=>owner);
    assert.ok(staged.held);let calls=0,referenceRemovals=0;
    const removeChild=f.parent.removeChild;
    f.parent.removeChild=function(node){if(node===reference)referenceRemovals++;return removeChild.call(this,node);};
    if(outcome==='clone-replaces-owner') {
      const clone=reference.cloneNode;
      reference.cloneNode=function(){const backup=clone.call(this);assert.equal(this.isConnected,true);owner=false;fresh=false;return backup;};
    }
    const result=staged.held.probe((node,records)=>{
      calls++;assert.equal(node,f.svg);assert.equal(records.length,1);
      assert.equal(staged.held.probe(()=>true).status,'unsupported');
      if(outcome==='throw')throw Error('reentrant failure');
      if(outcome==='stale')fresh=false;
      if(outcome==='mutate')node.outerHTML='<svg><path d="M0 0H999"/></svg>';
      if(outcome==='reference-mutated')reference.outerHTML='<svg><path fill="red"/></svg>';
      if(outcome==='new-owner') {owner=false;fresh=false;f.parent.insertBefore(replacement,null);}
      if(outcome==='reparent') {
        node.parentNode={removeChild(child){rogueRemovals++;child.parentNode=null;child.isConnected=false;}};
        throw Error('reparented');
      }
      return outcome!=='reject';
    });
    const probeAccepted=['accept','commit','commit-scroll','commit-scroll-corrupt','commit-reject','commit-stale','commit-cleanup-owner','commit-cleanup-mutate','commit-receipt-font','commit-receipt-dom','commit-receipt-transient','commit-receipt-transient-late','commit-receipt-reparent'].includes(outcome);
    assert.equal(result.status,probeAccepted?'validated-target-probe':'unsupported');
    assert.equal(calls,outcome==='clone-replaces-owner'?0:1);
    if(outcome==='clone-replaces-owner') {assert.equal(referenceRemovals,0);staged.held.release();}
    if(outcome.startsWith('commit')) {
      if(outcome==='commit-stale')fresh=false;
      if(outcome==='commit-cleanup-owner' || outcome==='commit-cleanup-mutate') {
        const wrapper=f.parent.child,remove=wrapper.remove;
        wrapper.remove=function(){if(outcome==='commit-cleanup-owner'){owner=false;fresh=false;f.parent.insertBefore(replacement,null);}
          else f.svg.outerHTML='<svg><path d="M0 0H999"/></svg>';return remove.call(this);};
      }
      let armed=false;
      const consumed=staged.held.consume((node)=>{assert.equal(node,f.svg);if(armed){armed=false;observers.at(-1).records.push({type:'attributes'});}return outcome!=='commit-reject';});
      const committed=['commit','commit-scroll','commit-scroll-corrupt','commit-receipt-font','commit-receipt-dom','commit-receipt-transient','commit-receipt-transient-late','commit-receipt-reparent'].includes(outcome);
      assert.equal(consumed.status,committed?'committed-target':'unsupported');
      if(committed) {
        assert.equal(f.svg.parentNode,f.parent);assert.equal(reference.isConnected,false);
        if(outcome==='commit-receipt-reparent') {
          f.svg.id='wwNut';f.svg.parentNode={removeChild(child){rogueRemovals++;child.parentNode=null;child.isConnected=false;}};
          assert.equal(consumed.rollback(),true);assert.equal(rogueRemovals,1);assert.equal(f.svg.isConnected,false);
          assert.equal(reference.parentNode,f.parent);continue;
        }
        if(outcome==='commit-receipt-font')f.listeners.loadingdone();
        if(outcome==='commit-receipt-dom')f.svg.outerHTML='<svg><path fill="red"/></svg>';
        if(outcome==='commit-receipt-transient')observers.at(-1).records.push({type:'attributes'});
        if(outcome==='commit-receipt-transient-late')armed=true;
        if(outcome==='commit-scroll' || outcome==='commit-scroll-corrupt') {
          f.svg.ownerDocument.defaultView.scrollY=899;
          const matrix={...identity,f:outcome==='commit-scroll'?-899:-898};
          f.svg.getScreenCTM=()=>matrix;f.node.getScreenCTM=()=>matrix;
          for(const shape of [drop,...arrows,...paths,...stubs]) shape.getScreenCTM=()=>matrix;
        }
        assert.equal(consumed.consume(),outcome==='commit'||outcome==='commit-scroll',outcome);assert.equal(consumed.consume(),false);
        if(outcome==='commit'||outcome==='commit-scroll')consumed.seal();
        else if(outcome==='commit-scroll-corrupt') consumed.rollback();
        else {assert.equal(consumed.rollback(),true);assert.equal(reference.parentNode,f.parent);}
      }
      else if(outcome==='commit-cleanup-owner') {assert.equal(f.parent.lastInserted,replacement);assert.equal(reference.isConnected,false);}
      else {assert.equal(reference.parentNode,f.parent);staged.held.release();}
      assert.equal(staged.held.consume(()=>true).status,'unsupported');continue;
    }
    if(outcome==='reference-mutated') {assert.notEqual(f.parent.lastInserted,reference);assert.equal(f.parent.lastInserted.outerHTML,'<svg/>');}
    else if(outcome==='new-owner') {assert.equal(f.parent.lastInserted,replacement);assert.equal(reference.isConnected,false);}
    else {assert.equal(reference.parentNode,f.parent);assert.equal(reference.isConnected,true);}
    if(outcome==='accept') {assert.equal(f.svg.isConnected,true);assert.equal(staged.held.validate(),true);staged.held.release();}
    assert.equal(f.svg.isConnected,false);
    if(outcome==='reparent')assert.equal(rogueRemovals,1);
    assert.equal(staged.held.probe(()=>true).status,'unsupported');
  }} finally {context.api.setTargetCheck(originalTargetCheck);}
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
  svg.isConnected=true;assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');svg.isConnected=false;
  const prepared=namespace(svg,root);assert.equal(prepared.status,'prepared');
  assert.notEqual(def.id,'shared');
  assert.equal(path.attributes.find(a=>a.name==='href').value,'#'+def.id);
  assert.equal(path.attributes.find(a=>a.name==='style').value,'fill:url(#'+def.id+')');
  svg.isConnected=true;assert.equal(prepared.restore().reason,'text-stage-restore-unavailable');
  svg.isConnected=false;assert.equal(prepared.restore().reason,'text-stage-restore-id-conflict');
  assert.equal(prepared.restore(root).reason,'text-stage-restore-id-conflict');
  assert.equal(prepared.restore({querySelectorAll:()=>[]}).status,'restored');
  assert.equal(def.id,'shared');assert.equal(path.attributes.find(a=>a.name==='href').value,'#shared');
  assert.equal(path.attributes.find(a=>a.name==='style').value,'fill:url(#shared)');
  assert.equal(prepared.restore().reason,'text-stage-restore-unavailable');
  const changed=namespace(svg,root);assert.equal(changed.status,'prepared');
  const namespacedId=def.id;
  path.attributes.find(a=>a.name==='href').value='#external';
  assert.equal(changed.restore({querySelectorAll:()=>[]}).reason,'text-stage-restore-invalidated');
  assert.equal(def.id,namespacedId);
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
test('independent parity permits only the valve motor counter-rotation and still rejects changed text styles or matrices',async()=>{
  for (const mode of ['valid','other-text','invalid-rotation','linear-matrix','font-change','translated-mode']) {
    const f=stagingFixture();f.ready();f.style.height='150px';f.svg.style={};
    f.node.textContent=mode==='other-text'?'Other':'M';
    f.node.getAttribute=name=>({x:'100',y:'103',transform:mode==='invalid-rotation'?'rotate(-91 100 100)':'rotate(-90 100 100)'})[name]??null;
    if(mode==='linear-matrix')f.node.getScreenCTM=()=>({...identity,a:1.1});
    const reference={...f.svg,parentNode:f.parent,parentElement:f.parent},text={...f.node};
    text.getAttribute=name=>({x:'100',y:'103'})[name]??null;text.getScreenCTM=()=>identity;text.parentElement=reference;
    reference.querySelectorAll=()=>[text];reference.contains=n=>n===text;
    const styled=(transform,fontWeight='400')=>({...f.style,0:'transform',length:1,fontWeight,getPropertyValue:name=>name==='transform'?transform:''});
    f.svg.ownerDocument.defaultView.getComputedStyle=el=>el===f.node?styled('matrix(0, -1, 1, 0, 0, 0)',mode==='font-change'?'700':'400'):styled('none');
    const result=await stage(f.parent,'<svg></svg>','theme-1',1,()=>true,reference,undefined,false,mode==='translated-mode'?'translated':'independent',mode!=='translated-mode');
    if(mode==='valid')assert.equal(result.textStyleParity,'independent-text-measurements-only');
    else assert.equal(result.reason,'text-stage-style-mismatch',mode);
  }
});
test('staging permits plain ellipses but rejects active attributes and external references',()=>{
  const ellipse={localName:'ellipse',namespaceURI:'http://www.w3.org/2000/svg',id:'',attributes:[{name:'cx',value:'156'},{name:'rx',value:'50'}],setAttribute(){}};
  const svg={localName:'svg',namespaceURI:'http://www.w3.org/2000/svg',id:'',attributes:[],querySelectorAll:()=>[ellipse]};
  const root={querySelectorAll:()=>[]};assert.equal(namespace(svg,root).status,'prepared');
  ellipse.attributes.push({name:'onload',value:'alert(1)'});assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');ellipse.attributes.pop();
  ellipse.attributes.push({name:'fill',value:'url(https://example.test/x)'});assert.equal(namespace(svg,root).reason,'text-stage-unresolved-reference');
});
test('sensor theme fill accepts only a directly resolved color before staging',()=>{
  const value='var(--secondary-background-color,#2a2d33)';
  const child={localName:'rect',namespaceURI:'http://www.w3.org/2000/svg',id:'',attributes:[{name:'style',value:`fill:${value}`}],
    style:{0:'fill',length:1,getPropertyValue:()=>value,getPropertyPriority:()=>''},setAttribute(){}};
  const svg={localName:'svg',namespaceURI:'http://www.w3.org/2000/svg',id:'',attributes:[],querySelectorAll:()=>[child]};
  let resolved='#242424';
  const root={querySelectorAll:()=>[],host:{ownerDocument:{defaultView:{getComputedStyle:()=>({getPropertyValue:()=>resolved})}}}};
  assert.equal(namespace(svg,root).status,'prepared');
  for(const unsafe of ['url(https://example.test/x)','var(--other)','red; background:url(https://example.test/x)']) {
    resolved=unsafe;assert.equal(namespace(svg,root).reason,'text-stage-invalid-candidate');
  }
});
