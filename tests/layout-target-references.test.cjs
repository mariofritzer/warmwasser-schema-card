const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={HTMLElement:class{},customElements:{get(){},define(){}},window:{},console:{info(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../warmwasser-schema-card.js'),'utf8')+
  '\nglobalThis.api={inspectLayoutTargetReferences,css:CSS};',context);
const {inspectLayoutTargetReferences:inspect,css}=context.api;
function fixture() {
  class Sheet {constructor(){this.disabled=false;this.media={mediaText:''};}replaceSync(value){this.cssRules=[{cssText:value}];}}
  const sheet=new Sheet();sheet.replaceSync(css);
  const style={localName:'style',textContent:css,sheet,getAttribute:name=>name==='media'?(style.media??null):null};
  const doc={defaultView:{CSSStyleSheet:Sheet}};
  const root={host:{isConnected:true},adoptedStyleSheets:[],outside:[],
    querySelectorAll:selector=>selector==='style,link'?[style]:[...root.outside,referenceId]};
  const slot={querySelector:()=>reference};
  const referenceId={id:'wwNut'},reference={isConnected:true,parentNode:slot,getRootNode:()=>root,contains:el=>el===referenceId};
  const parent={isConnected:true,ownerDocument:doc,getRootNode:()=>root,querySelector:()=>slot};
  const gradient={localName:'linearGradient',namespaceURI:'http://www.w3.org/2000/svg',id:'wwNut',attributes:[{name:'id',value:'wwNut'}],
    setAttribute(name,value){if(name==='id')this.id=value;}};
  const svg={localName:'svg',namespaceURI:'http://www.w3.org/2000/svg',id:'',attributes:[],
    querySelectorAll:()=>[gradient]};
  doc.createElement=()=>({content:{querySelectorAll:()=>[svg]},set innerHTML(_) {}});
  return {parent,root,style,svg,gradient};
}
test('checks target CSSOM, local IDs and stylesheet references without granting paint',()=>{
  const f=fixture(),result=inspect(f.parent,'<svg/>');
  assert.equal(result.status,'unsupported');assert.equal(result.reason,'layout-target-references-bound-only');
});
test('foreign sheets, modified CSSOM and conflicting IDs fail closed',()=>{
  for(const change of [f=>f.root.adoptedStyleSheets.push({}),f=>f.style.textContent+=' ',
    f=>f.style.sheet.cssRules[0].cssText+=' ',f=>f.root.outside.push({id:'wwNut'}),
    f=>f.gradient.attributes.push({name:'href',value:'https://example.test/x'}),
    f=>f.style.media='print',f=>f.style.sheet.media.mediaText='print',f=>f.style.sheet.disabled=true,f=>f.style.disabled=true]) {
    const f=fixture();change(f);assert.equal(inspect(f.parent,'<svg/>').reason,'layout-target-references-unproven');
  }
});
