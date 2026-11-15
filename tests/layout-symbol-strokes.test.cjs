const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={HTMLElement:class{},customElements:{get(){},define(){}},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.inspect=inspectStagedLayoutSymbolStrokes;globalThis.inspectPipes=inspectStagedLayoutPipeStrokes;globalThis.inspectAmbient=inspectStagedLayoutAmbientPaint;',context);
function fixture() {
  const shape=(localName,attrs,stroke,width)=>({localName,getAttribute:name=>attrs[name]??null,style:{stroke,strokeWidth:width,vectorEffect:'none'}});
  const drop=shape('path',{d:'M430 30C424 40 421 45 421 49A9 9 0 0 0 439 49C439 45 436 40 430 30Z'},'none','1px');
  const arrows=[shape('path',{class:'wa'},'rgb(255, 255, 255)','1.6px'),shape('path',{class:'wa'},'rgb(255, 255, 255)','1.6px')];
  const fan=shape('circle',{cx:'390',cy:'226',r:'42'},'rgb(12, 13, 15)','3px');
  const led=shape('circle',{cx:'434',cy:'353',r:'5'},'rgb(255, 255, 255)','1px');
  const wpDisplay=shape('rect',{x:'342',y:'282',width:'96',height:'46'},'rgb(255, 255, 255)','1px');
  const nodes=[drop,...arrows,fan,led,wpDisplay];
  const svg={isConnected:true,ownerDocument:{defaultView:{getComputedStyle:el=>el.style}},querySelectorAll:()=>nodes};
  return {svg,drop,arrows,fan,led,wpDisplay,nodes,shape};
}
test('computed symbol strokes are bounded without authorizing paint',()=>{
  const f=fixture();assert.equal(context.inspect(f.svg).reason,'layout-symbol-strokes-bound-only');
  for(const change of [x=>x.drop.style.stroke='red',x=>x.led.style.strokeWidth='10px',
    x=>x.fan.style.strokeWidth='50%',x=>x.arrows[0].style.strokeWidth='2px',x=>x.led.style.vectorEffect='non-scaling-stroke',
    x=>x.wpDisplay.style.strokeWidth='100px']) {
    const g=fixture();change(g);assert.equal(context.inspect(g.svg).reason,'layout-symbol-stroke-unproven');
  }
});
test('FM-only display does not accept an inherited oversized stroke',()=>{
  const f=fixture();f.nodes.splice(0,f.nodes.length,
    f.shape('path',{d:'M430 22C426 29 424 32 424 35A6 6 0 0 0 436 35C436 32 434 29 430 22Z'},'none','100px'),
    ...f.arrows,f.shape('rect',{x:'392',y:'62',width:'52',height:'34'},'rgb(255, 255, 255)','100px'));
  assert.equal(context.inspect(f.svg).reason,'layout-symbol-stroke-unproven');
  f.nodes.at(-1).style.strokeWidth='1px';assert.equal(context.inspect(f.svg).reason,'layout-symbol-strokes-bound-only');
});
test('baffle rectangle and lines reject inherited or oversized strokes',()=>{
  const f=fixture(),rect=f.shape('rect',{x:'73',y:'168',width:'128',height:'4'},'none','1px'),
    line=f.shape('path',{d:'M73 168H201M73 172H201'},'white','.7px');
  f.nodes.push(rect,line);assert.equal(context.inspect(f.svg).reason,'layout-symbol-strokes-bound-only');
  rect.style.stroke='red';assert.equal(context.inspect(f.svg).reason,'layout-symbol-stroke-unproven');
  rect.style.stroke='none';line.style.strokeWidth='2px';assert.equal(context.inspect(f.svg).reason,'layout-symbol-stroke-unproven');
});
test('pipe and stub stroke envelopes reject wider, missing and non-scaling styles',()=>{
  const matrix={a:1,b:0,c:0,d:1,e:0,f:0};
  const element=(name,width)=>({localName:name==='wk'?'rect':'path',getAttribute:()=>name,getScreenCTM:()=>matrix,style:{stroke:'red',strokeWidth:`${width}px`,vectorEffect:'none',strokeLinecap:'round',strokeLinejoin:'round'}});
  const paths=['w0','w1','w2'].flatMap((name,i)=>Array.from({length:4},()=>element(name,[10,7,2][i]))),
    stubs=Array.from({length:6},()=>element('wk',.8));
  const svg={isConnected:true,getScreenCTM:()=>matrix,ownerDocument:{defaultView:{getComputedStyle:el=>el.style}},
    querySelectorAll:selector=>selector==='path'?paths:selector==='rect'?stubs:[...paths,...stubs]};
  assert.equal(context.inspectPipes(svg).reason,'layout-pipe-strokes-bound-only');
  paths[0].style.strokeWidth='11px';assert.equal(context.inspectPipes(svg).reason,'layout-pipe-stroke-unproven');
  paths[0].style.strokeWidth='10px';stubs[0].style.strokeWidth='1px';assert.equal(context.inspectPipes(svg).reason,'layout-pipe-stroke-unproven');
  stubs[0].style.strokeWidth='.8px';paths[0].style.vectorEffect='non-scaling-stroke';assert.equal(context.inspectPipes(svg).reason,'layout-pipe-stroke-unproven');
  paths[0].style.vectorEffect='none';stubs.pop();assert.equal(context.inspectPipes(svg).reason,'layout-pipe-stroke-unproven');
  stubs.push(element('wk',.8));paths[0].getScreenCTM=()=>({...matrix,e:5});
  assert.equal(context.inspectPipes(svg).reason,'layout-pipe-stroke-unproven');
  paths[0].getScreenCTM=()=>matrix;paths.push(element('w0 wx',10));
  assert.equal(context.inspectPipes(svg).reason,'layout-pipe-stroke-unproven');
});
test('ambient paint rejects inherited stroke and oversized implicit widths',()=>{
  const effects={markerStart:'none',markerMid:'none',markerEnd:'none',clipPath:'none',mask:'none',mixBlendMode:'normal',filter:'none',opacity:'1',isolation:'auto',backdropFilter:'none'};
  const attrs={},shape={localName:'rect',getAttribute:name=>attrs[name]??null,closest:()=>null,
    style:{getPropertyValue:()=>''},computed:{...effects,stroke:'none',strokeWidth:'1px',vectorEffect:'none'}};
  const svg={isConnected:true,computed:{...effects},ownerDocument:{defaultView:{getComputedStyle:el=>el.computed}},querySelectorAll:()=>[shape],
    querySelector:()=>({localName:'filter'})};shape.parentElement=svg;
  assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-bound-only');
  shape.computed.markerStart='url(#evil)';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-unproven');
  shape.computed.markerStart='none';svg.computed.clipPath='url(#evil)';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-unproven');
  svg.computed.clipPath='none';
  const host={computed:{...effects,mixBlendMode:'multiply'},parentElement:null};svg.getRootNode=()=>({host});
  assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-unproven');
  host.computed.mixBlendMode='normal';host.computed.opacity='.5';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-unproven');
  host.computed.opacity='1';host.computed.backdropFilter='blur(3px)';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-unproven');
  host.computed.backdropFilter='none';shape.computed.filter='url("#ww-text-stage-1")';attrs.filter='url(#ww-text-stage-1)';
  assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-bound-only');
  shape.computed.filter='url("#foreign")';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-unproven');
  shape.computed.filter='none';delete attrs.filter;
  shape.computed.stroke='red';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-unproven');
  attrs.stroke='#fff';shape.computed.strokeWidth='100px';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-unproven');
  shape.computed.strokeWidth='1px';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-bound-only');
  attrs['stroke-width']='2';shape.computed.strokeWidth='2px';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-bound-only');
  shape.computed.strokeWidth='10%';assert.equal(context.inspectAmbient(svg).reason,'layout-ambient-paint-unproven');
});
