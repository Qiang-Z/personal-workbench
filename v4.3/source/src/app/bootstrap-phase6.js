(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '6');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase6');
      }catch(e){}
      try{ console.info('[Workbench] Phase 6 router and panels loaded'); }catch(e){}
      try{ if(typeof global.render === 'function') global.render(); else console.warn('[Workbench] Phase 6: render not available'); }catch(e){ console.error('[Workbench] Phase 6 render error', e); }
    };
  }
})(window);
