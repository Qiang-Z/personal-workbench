(function(global){
  try {
    if(global.WorkbenchBootstrap && typeof global.WorkbenchBootstrap.run === 'function'){
      global.WorkbenchBootstrap.run();
    } else {
      console.warn('[Workbench] Bootstrap not found, app may not initialize properly');
      // Ensure initial render still happens via legacy path
      if(typeof global.render === 'function') {
        try { global.render(); } catch(e) { console.error('[Workbench] Initial render failed', e); }
      }
    }
  } catch(e) {
    console.error('[Workbench] Bootstrap failed', e);
    // Attempt fallback render
    try {
      if(typeof global.render === 'function') global.render();
    } catch(e2) {
      console.error('[Workbench] Fallback render also failed', e2);
    }
  }
})(window);
