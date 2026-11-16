// Only for isolated renderer/commit tests: retain real routing, rendering,
// commit and rollback while the browser-only asynchronous text gate is tested
// separately in layout-text-lifecycle.test.cjs. Never loaded by product code.
module.exports = `\n{
  const realTextGate=requestLayoutVolumeMeasurement;
  requestLayoutVolumeMeasurement=(owner,card,html,candidate)=>{
    const value=card._cfg.volumen;
    if (candidate?.status==='heating-candidate' || card._cfg.typ==='getrennt' || (value!==null && value!==undefined && value!==''))
      return realTextGate(owner,card,html,candidate);
    const match=html.match(/<svg viewBox="([^"]+)"/);
    const viewport=layoutCandidateViewport({getAttribute:()=>match?.[1]});
    return viewport ? {status:'rendered-candidate',html,viewport} : {status:'unsupported',errors:[{code:'text-stage-viewport-unproven'}]};
  };
}\n`;
