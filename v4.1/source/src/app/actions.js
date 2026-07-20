(function(global){
  var listeners = [];
  function emit(type, payload){
    var evt = { type:type, payload:payload||{}, at:Date.now() };
    listeners.slice().forEach(function(fn){ try{ fn(evt); }catch(e){} });
    try{ document.dispatchEvent(new CustomEvent('workbench:action', { detail: evt })); }catch(e){}
    return evt;
  }
  function subscribe(fn){ listeners.push(fn); return function(){ listeners = listeners.filter(function(x){ return x !== fn; }); }; }
  var __rendering = 0;
  function wrap(name, type, payloadBuilder){
    var orig = global[name];
    if(typeof orig !== 'function' || orig.__wbActionWrapped) return;
    var wrapped = function(){
      if(name === 'render') {
        if(__rendering > 0) return;
        __rendering++;
      }
      var args = Array.prototype.slice.call(arguments);
      var payload = typeof payloadBuilder === 'function' ? payloadBuilder.apply(null, args) : { args: args };
      try { emit(type + ':before', payload); } catch(e) {}
      try {
        var result = orig.apply(this, args);
      } catch(e) {
        console.error('[Workbench] Action error in ' + name, e);
        result = undefined;
      }
      try { emit(type + ':after', payload); } catch(e) {}
      if(name === 'render') __rendering--;
      return result;
    };
    wrapped.__wbActionWrapped = true;
    global[name] = wrapped;
  }
  global.WorkbenchActions = { emit: emit, subscribe: subscribe, wrap: wrap };
  wrap('setView', 'nav:setView', function(view){ return { view:view }; });
  wrap('onSearch', 'query:search', function(value){ return { value:value }; });
  wrap('setResearchTab', 'tab:research', function(tab){ return { tab:tab }; });
  wrap('setPaperKind', 'tab:paperKind', function(kind){ return { kind:kind }; });
  wrap('setLifeTab', 'tab:life', function(tab){ return { tab:tab }; });
  wrap('setBookStatus', 'tab:bookStatus', function(status){ return { status:status }; });
  wrap('setWorkView', 'tab:workView', function(view){ return { view:view }; });
  wrap('setCalScope', 'tab:calScope', function(scope){ return { scope:scope }; });
  wrap('setCalView', 'tab:calendarView', function(view){ return { view:view }; });
  wrap('setSportTab', 'tab:sport', function(tab){ return { tab:tab }; });
  wrap('setFinView', 'tab:finance', function(view){ return { view:view }; });
  wrap('openForm', 'form:item', function(cat, id){ return { cat:cat, id:id||null }; });
  wrap('openProjectForm', 'form:project', function(id){ return { id:id||null }; });
  wrap('openPaperForm', 'form:paper', function(id){ return { id:id||null }; });
  wrap('openPatent', 'form:patent', function(id){ return { id:id||null }; });
  wrap('openFundForm', 'form:fund', function(id){ return { id:id||null }; });
  wrap('openNavForm', 'form:nav', function(id){ return { id:id||null }; });
  wrap('save', 'data:save');
  wrap('render', 'ui:render');
})(window);
