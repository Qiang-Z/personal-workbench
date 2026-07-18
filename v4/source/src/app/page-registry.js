(function(global){
  var fallback = function(name){
    if(typeof global.renderModule === 'function') return global.renderModule(name);
    return '';
  };
  var pages = {};
  function register(name, fn){ if(name && typeof fn === 'function') pages[name] = fn; return fn; }
  function has(name){ return typeof pages[name] === 'function'; }
  function get(name){ return pages[name] || null; }
  function unregister(name){ delete pages[name]; }
  function list(){ return Object.keys(pages); }
  function render(name){
    var fn = get(name);
    if(fn) {
      try {
        return fn.apply(global, Array.prototype.slice.call(arguments, 1));
      } catch(e) {
        console.error('[Workbench] PageRegistry render error for: ' + name, e);
      }
    }
    try {
      return fallback.apply(global, arguments);
    } catch(e) {
      console.error('[Workbench] PageRegistry fallback render error for: ' + name, e);
      return null;
    }
  }
  global.WorkbenchPageRegistry = {
    register: register,
    has: has,
    get: get,
    unregister: unregister,
    list: list,
    render: render,
    fallback: function(){ return fallback; }
  };
})(window);
