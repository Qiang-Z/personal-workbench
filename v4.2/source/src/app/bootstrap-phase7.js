(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '7');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase7');
      }catch(e){}
      try{ console.info('[Workbench] Phase 7 registry and actions loaded'); }catch(e){}
      try{ if(typeof global.render === 'function') global.render(); else console.warn('[Workbench] Phase 7: render not available'); }catch(e){ console.error('[Workbench] Phase 7 render error', e); }
    };
  }
})(window);
