(function(global){
  if(typeof global.renderReview !== 'function') return;
  function renderReviewModule(){
    return global.renderReview();
  }
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('review', renderReviewModule);
  }
})(window);
