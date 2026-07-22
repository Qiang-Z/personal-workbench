(function(global){
  var KEY = typeof global.BAK_KEY !== 'undefined' ? global.BAK_KEY : 'workbench_backups_v1';
  var MAX = typeof global.BAK_MAX !== 'undefined' ? global.BAK_MAX : 30;
  function read(){
    try{
      var s = localStorage.getItem(KEY);
      var arr = s ? JSON.parse(s) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(e){ return []; }
  }
  function write(arr){
    localStorage.setItem(KEY, JSON.stringify(arr));
    return arr;
  }
  function snapshot(){
    var data = global.WorkbenchRepository && global.WorkbenchRepository.getSnapshot ? global.WorkbenchRepository.getSnapshot() : JSON.parse(JSON.stringify(global.data || {}));
    if(data && data.__savedAt) delete data.__savedAt;
    return data;
  }
  var api = {
    list: read,
    create: function(force){
      try{
        var now = Date.now();
        if(typeof global.lastBak !== 'undefined' && typeof global.BAK_MIN_GAP !== 'undefined' && !force && now - global.lastBak < global.BAK_MIN_GAP) return read();
        if(typeof global.lastBak !== 'undefined') global.lastBak = now;
        var arr = read();
        arr.push({ ts: now, data: snapshot() });
        while(arr.length > MAX) arr.shift();
        return write(arr);
      }catch(e){ return read(); }
    },
    restore: function(ts){
      var item = read().find(function(x){ return x.ts === ts; });
      if(!item) return null;
      var defaults = {items:[],projects:[],funds:[],papers:[],patents:[],rprojects:[],books:[],travels:[],anniversaries:[],weights:[],finances:[],habits:[],theme:'light',weekPlans:{}};
      var next = Object.assign(defaults, item.data || {});
      if(global.WorkbenchRepository && global.WorkbenchRepository.replaceState) global.WorkbenchRepository.replaceState(next);
      else global.data = next;
      if(typeof global.save === 'function') global.save();
      if(typeof global.render === 'function') global.render();
      return next;
    },
    remove: function(ts){
      return write(read().filter(function(x){ return x.ts !== ts; }));
    }
  };
  global.WorkbenchBackupRepo = api;
  global.loadBak = api.list;
  global.pushBackup = function(force){ return api.create(force); };
  global.restoreBak = function(ts){
    if(!confirm('恢复到该备份？当前未备份的内容会被覆盖（恢复前会自动再存一份当前快照）')) return;
    api.create(true);
    var restored = api.restore(ts);
    if(typeof global.renderBak === 'function') global.renderBak();
    if(restored && typeof global.fmtBak === 'function') alert('已恢复到 ' + global.fmtBak(ts));
  };
  global.delBak = function(ts){ api.remove(ts); if(typeof global.renderBak === 'function') global.renderBak(); };
  global.bakNow = function(){ api.create(true); if(typeof global.renderBak === 'function') global.renderBak(); };
})(window);
