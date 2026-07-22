(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '5');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase5');
      }catch(e){}
      try{ console.info('[Workbench] Phase 5 modules loaded'); }catch(e){}
    };
  }
})(window);
