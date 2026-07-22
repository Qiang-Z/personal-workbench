(function(global){
  function attach(){
    if(global.__wbStoreActionBridgeAttached) return;
    if(!global.WorkbenchActions || !global.WorkbenchStore) return;
    global.__wbStoreActionBridgeAttached = true;
    global.WorkbenchActions.subscribe(function(evt){
      try {
        if(!evt || !/:after$/.test(evt.type)) return;
        var patch = { lastAction: evt.type, lastActionPayload: evt.payload || null };
        if(evt.type==='nav:setView:after') patch.currentCat = evt.payload && evt.payload.view;
        if(evt.type==='query:search:after') patch.searchKw = String((evt.payload && evt.payload.value) || '').trim().toLowerCase();
        if(evt.type==='tab:calendarView:after') patch.calView = evt.payload && evt.payload.view;
        global.WorkbenchStore.setState(patch);
      } catch(e) {
        console.error('[Workbench] StoreActionBridge error handling action:', evt && evt.type, e);
      }
    });
  }
  global.WorkbenchStoreActionBridge = { attach: attach };
  attach();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', attach, { once:true });
})(window);
