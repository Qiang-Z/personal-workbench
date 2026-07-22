(function(global){
  var state = {
    currentCat: global.currentCat,
    workView: global.workView,
    researchTab: global.researchTab,
    paperKind: global.paperKind,
    lifeTab: global.lifeTab,
    bookStatus: global.bookStatus,
    finView: global.finView,
    sportTab: global.sportTab,
    calScope: global.calScope,
    calView: global.calView,
    searchKw: global.searchKw,
    lastAction: null,
    lastActionPayload: null
  };
  var listeners = [];
  function emit(){ listeners.forEach(function(fn){ try{ fn(Object.assign({}, state)); }catch(e){} }); }
  function set(patch){ Object.assign(state, patch || {}); emit(); }
  global.WorkbenchStore = {
    getState: function(){ return Object.assign({}, state); },
    setState: set,
    subscribe: function(fn){ listeners.push(fn); return function(){ listeners = listeners.filter(function(x){ return x !== fn; }); }; }
  };
  function wrap(name, map){
    var orig = global[name];
    if(typeof orig !== 'function' || orig.__wbStoreWrapped) return;
    global[name] = function(){
      var args = Array.prototype.slice.call(arguments);
      var result;
      try {
        result = orig.apply(this, args);
      } catch(e) {
        console.error('[Workbench] Store wrap error in ' + name, e);
        throw e;
      }
      try {
        set(map.apply(null, args));
      } catch(e) {
        console.error('[Workbench] Store setState error in ' + name, e);
      }
      return result;
    };
    global[name].__wbStoreWrapped = true;
  }
  wrap('setView', function(c){ return { currentCat: c, searchKw: '' }; });
  wrap('onSearch', function(v){ return { searchKw: String(v || '').trim().toLowerCase() }; });
  wrap('setResearchTab', function(v){ return { researchTab: v }; });
  wrap('setPaperKind', function(v){ return { paperKind: v }; });
  wrap('setLifeTab', function(v){ return { lifeTab: v }; });
  wrap('setBookStatus', function(v){ return { bookStatus: v }; });
  wrap('setWorkView', function(v){ return { workView: v }; });
  wrap('setCalScope', function(v){ return { calScope: v }; });
  wrap('setCalView', function(v){ return { calView: v }; });
  wrap('setSportTab', function(v){ return { sportTab: v }; });
  wrap('setFinView', function(v){ return { finView: v }; });
})(window);
