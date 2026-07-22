(function(global){
  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function ensure(){
    return global.WorkbenchData && global.WorkbenchData.getData ? global.WorkbenchData.getData() : (global.data || {});
  }
  var repo = {
    getState: function(){ return ensure(); },
    getSnapshot: function(){ return clone(ensure()); },
    replaceState: function(next, opts){
      var data = global.WorkbenchData && global.WorkbenchData.setData ? global.WorkbenchData.setData(next || {}) : (global.data = next || {});
      if(opts && opts.persist && typeof global.save === 'function') global.save();
      return data;
    },
    patchState: function(patch, opts){
      var data = global.WorkbenchData && global.WorkbenchData.patchData ? global.WorkbenchData.patchData(patch || {}) : Object.assign(global.data || {}, patch || {});
      if(opts && opts.persist && typeof global.save === 'function') global.save();
      return data;
    },
    list: function(key){
      var data = ensure();
      return Array.isArray(data[key]) ? data[key] : [];
    },
    setCollection: function(key, list, opts){
      var patch = {}; patch[key] = Array.isArray(list) ? list : [];
      return repo.patchState(patch, opts);
    },
    upsertById: function(key, entity, opts){
      var arr = repo.list(key).slice();
      var idx = arr.findIndex(function(x){ return x && entity && x.id === entity.id; });
      if(idx >= 0) arr[idx] = Object.assign({}, arr[idx], entity);
      else arr.push(entity);
      return repo.setCollection(key, arr, opts);
    },
    removeById: function(key, id, opts){
      return repo.setCollection(key, repo.list(key).filter(function(x){ return x && x.id !== id; }), opts);
    },
    persistNow: function(){ if(typeof global.save === 'function') global.save(); },
    renderNow: function(){ if(typeof global.render === 'function') global.render(); }
  };
  global.WorkbenchRepository = repo;
})(window);
