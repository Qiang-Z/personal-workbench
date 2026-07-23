(function(global){
  function data(){
    try {
      if(global.WorkbenchData && typeof global.WorkbenchData.getData === 'function') return global.WorkbenchData.getData();
    } catch(e) {
      console.error('[Workbench] Selectors data() error', e);
    }
    return global.data || {};
  }
  function uiState(){
    if(global.WorkbenchStore && typeof global.WorkbenchStore.getState === 'function') return global.WorkbenchStore.getState();
    return {
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
  }
  function parseSearch(kw){
    kw = String(kw || '').trim().toLowerCase();
    var tags = [];
    kw = kw.replace(/tag[:：]([^\s,，]+)/g, function(_, t){ tags.push(String(t || '').toLowerCase()); return ''; }).trim();
    return { kw: kw, tags: tags };
  }
  function matchesSearch(item, parsed, fullData){
    if(!parsed || (!parsed.kw && !(parsed.tags||[]).length)) return true;
    var p = ((fullData.projects||[]).find(function(x){ return x.id===item.projectId; }) || {});
    var hay = [item.title, item.note, item.sportType, p.name, ((item.tags||[]).join(' '))].join(' ').toLowerCase();
    if(parsed.kw && !hay.includes(parsed.kw)) return false;
    if(parsed.tags && parsed.tags.length){
      var itemTags=(item.tags||[]).map(function(x){ return String(x || '').toLowerCase(); });
      if(!parsed.tags.every(function(t){ return itemTags.includes(t); })) return false;
    }
    return true;
  }
  function sortItems(items){
    var o={todo:0,doing:1,done:2};
    var p={high:0,mid:1,low:2};
    return (items||[]).slice().sort(function(a,b){
      var sa=o[a.status], sb=o[b.status];
      if(sa!==sb) return sa-sb;
      return (p[a.prio]||9)-(p[b.prio]||9);
    });
  }
  function filteredItems(cat){
    var fullData = data();
    var state = uiState();
    var items=(fullData.items||[]).slice();
    var target = cat || state.currentCat;
    if(target && ['overview','calendar','review','habit','news'].indexOf(target)<0) items=items.filter(function(i){ return i.cat===target; });
    var parsed = parseSearch(state.searchKw);
    items = items.filter(function(i){ return matchesSearch(i, parsed, fullData); });
    return sortItems(items);
  }
  function workModuleModel(){
    var fullData=data();
    var state=uiState();
    var items=(fullData.items||[]);
    var filtered=filteredItems('work');
    var projects=(fullData.projects||[]);
    var tmpItems=items.filter(function(i){ return i.cat==='work' && !i.projectId; });
    var agendaItems=items.filter(function(i){ return i.cat==='work' && i.due; }).slice().sort(function(a,b){ return a.due.localeCompare(b.due); });
    return {
      state: state,
      projects: projects,
      activeProjects: projects.filter(function(p){ return (p.status||'active')!=='done'; }),
      completedProjects: projects.filter(function(p){ return p.status==='done'; }),
      tmpItems: tmpItems,
      tmpOpenItems: tmpItems.filter(function(i){ return i.status!=='done'; }),
      tmpCompletedItems: tmpItems.filter(function(i){ return i.status==='done'; }),
      agendaItems: agendaItems,
      agendaOpenItems: agendaItems.filter(function(i){ return i.status!=='done'; }),
      agendaCompletedItems: agendaItems.filter(function(i){ return i.status==='done'; }),
      filteredItems: filtered,
      openFilteredItems: filtered.filter(function(i){ return i.status!=='done'; }),
      completedFilteredItems: filtered.filter(function(i){ return i.status==='done'; }),
      workView: state.workView || global.workView || 'list',
      collapseState: global.collapseState || {}
    };
  }
  global.WorkbenchSelectors = {
    data: data,
    uiState: uiState,
    parseSearch: parseSearch,
    filteredItems: filteredItems,
    sortItems: sortItems,
    workModuleModel: workModuleModel
  };
})(window);
