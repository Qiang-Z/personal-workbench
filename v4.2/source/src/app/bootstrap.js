(function(global){
  function markPhase(){
    try{
      document.documentElement.setAttribute('data-wb-phase', '2');
      document.documentElement.setAttribute('data-wb-build', 'portable-refactor');
    }catch(e){}
  }
  function announce(){
    try{ console.info('[Workbench] Phase 2 incremental modules loaded'); }catch(e){}
  }
  global.WorkbenchBootstrap = {
    run: function(){ markPhase(); announce(); }
  };
})(window);
