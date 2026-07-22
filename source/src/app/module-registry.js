(function(global){
  var fallback = typeof global.renderModule === 'function' ? global.renderModule : function(){ return ''; };
  var modules = {};
  function register(name, fn){ if(name && typeof fn === 'function') modules[name] = fn; return fn; }
  function has(name){ return typeof modules[name] === 'function'; }
  function get(name){ return modules[name] || null; }
  function unregister(name){ delete modules[name]; }
  function render(name){
    var fn = get(name);
    if(fn) {
      try {
        return fn.apply(global, Array.prototype.slice.call(arguments, 1));
      } catch(e) {
        console.error('[Workbench] ModuleRegistry render error for: ' + name, e);
      }
    }
    try {
      return fallback.apply(global, Array.prototype.slice.call(arguments));
    } catch(e) {
      console.error('[Workbench] ModuleRegistry fallback render error for: ' + name, e);
      return '';
    }
  }
  global.WorkbenchModuleRegistry = {
    register: register,
    has: has,
    get: get,
    unregister: unregister,
    render: render,
    fallback: function(){ return fallback; }
  };
  global.renderModule = function(name){
    return render.apply(null, arguments);
  };
})(window);
