(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '9');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase9');
      }catch(e){}
      try{ console.info('[Workbench] Phase 9 selectors and section helpers loaded'); }catch(e){}
      try{ if(typeof global.render === 'function') global.render(); else console.warn('[Workbench] Phase 9: render not available'); }catch(e){ console.error('[Workbench] Phase 9 render error', e); }
    };
  }
})(window);
