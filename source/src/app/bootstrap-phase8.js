(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '8');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase8');
      }catch(e){}
      try{ if(global.WorkbenchStoreActionBridge && typeof global.WorkbenchStoreActionBridge.attach==='function') global.WorkbenchStoreActionBridge.attach(); }catch(e){}
      try{ console.info('[Workbench] Phase 8 page registry and store bridge loaded'); }catch(e){}
      try{ if(typeof global.render === 'function') global.render(); else console.warn('[Workbench] Phase 8: render not available'); }catch(e){ console.error('[Workbench] Phase 8 render error', e); }
    };
  }
})(window);
