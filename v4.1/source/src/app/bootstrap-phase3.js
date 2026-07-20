(function(global){
  var oldRun = global.WorkbenchBootstrap && global.WorkbenchBootstrap.run;
  if(global.WorkbenchBootstrap){
    global.WorkbenchBootstrap.run = function(){
      if(typeof oldRun === 'function') oldRun();
      try{
        document.documentElement.setAttribute('data-wb-phase', '3');
        document.documentElement.setAttribute('data-wb-build', 'portable-refactor-phase3');
      }catch(e){}
      try{ console.info('[Workbench] Phase 3 modules loaded'); }catch(e){}
    };
  }
})(window);
