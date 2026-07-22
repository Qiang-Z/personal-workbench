(function(global){
  function status(state, title){ if(typeof global.syncSetDot === 'function') global.syncSetDot(state, title); }
  var api = {
    isEnabled: function(){ return !!(global.syncCfg && global.syncCfg.enabled && global.syncCfg.token); },
    getConfig: function(){ return Object.assign({}, global.syncCfg || {}); },
    saveConfigFromDom: function(){
      if(!global.syncCfg) global.syncCfg = { token:'', gistId:'', enabled:false };
      global.syncCfg.token = (document.getElementById('s_token') || {}).value ? document.getElementById('s_token').value.trim() : global.syncCfg.token;
      global.syncCfg.gistId = (document.getElementById('s_gist') || {}).value ? document.getElementById('s_gist').value.trim() : global.syncCfg.gistId;
      global.syncCfg.enabled = !!((document.getElementById('s_enabled') || {}).checked);
      if(typeof global.saveSyncCfg === 'function') global.saveSyncCfg();
      return api.getConfig();
    },
    push: function(){ if(typeof global.syncPush === 'function') return global.syncPush(); status('off', '未启用同步'); },
    pull: function(){ if(typeof global.syncPull === 'function') return global.syncPull(); status('off', '未启用同步'); },
    wrapPayload: function(){ return typeof global.syncWrap === 'function' ? global.syncWrap() : null; }
  };
  global.WorkbenchSyncAdapter = api;
})(window);
