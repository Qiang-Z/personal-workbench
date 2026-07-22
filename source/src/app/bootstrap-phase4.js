(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '4');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase4');
      }catch(e){}
      try{ console.info('[Workbench] Phase 4 modules loaded'); }catch(e){}
    };
  }
})(window);
