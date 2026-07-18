(function(global){
  var MAX_PINNED = 3;
  var CORE = ['overview','work','calendar','review','more'];
  var MODULES = [
    { id:'research', name:'科研', icon:'🔬', group:'专业场景', description:'管理论文、专利、科研项目和审稿截止日期。' },
    { id:'life', name:'生活', icon:'🌿', group:'生活管理', description:'统一收纳生活事项、读书、旅行和纪念日。' },
    { id:'sport', name:'健康与运动', shortName:'健康', icon:'🏃', group:'生活管理', description:'从今天出发安排运动，轻松记录完成情况和身体趋势。' },
    { id:'habit', name:'习惯', icon:'🔥', group:'效率管理', description:'记录每日打卡和连续坚持情况。' },
    { id:'finance', name:'财务', icon:'💰', group:'专业场景', description:'记录收支、预算、基金持仓与净值。' },
    { id:'news', name:'信息热榜', shortName:'热榜', icon:'📰', group:'信息工具', description:'聚合多个信息源；默认关闭，避免打断专注。' }
  ];
  var moduleMap = {};
  MODULES.forEach(function(item){ moduleMap[item.id] = item; });

  function getData(){ return global.data || {}; }
  function ensureConfig(){
    var data = getData();
    if(!data.prefs || typeof data.prefs !== 'object') data.prefs = {};
    if(!data.prefs.moduleConfig || typeof data.prefs.moduleConfig !== 'object'){
      data.prefs.moduleConfig = { enabled:{}, pinned:[] };
    }
    var cfg = data.prefs.moduleConfig;
    if(!cfg.enabled || typeof cfg.enabled !== 'object') cfg.enabled = {};
    if(!Array.isArray(cfg.pinned)) cfg.pinned = [];
    cfg.pinned = cfg.pinned.filter(function(id, index, arr){
      return !!moduleMap[id] && !!cfg.enabled[id] && arr.indexOf(id) === index;
    }).slice(0, MAX_PINNED);
    return cfg;
  }
  function isCore(id){ return CORE.indexOf(id) >= 0; }
  function isEnabled(id){ return isCore(id) || !!ensureConfig().enabled[id]; }
  function isCategoryVisible(cat){ return cat === 'work' || isEnabled(cat); }
  function isPinned(id){ return ensureConfig().pinned.indexOf(id) >= 0; }
  function moduleById(id){ return moduleMap[id] || null; }
  function countFor(id){
    var data=getData();
    var items=(data.items||[]).filter(function(item){ return item.cat===id; }).length;
    if(id==='research') return items+(data.papers||[]).length+(data.patents||[]).length+(data.rprojects||[]).length;
    if(id==='life') return items+(data.books||[]).length+(data.travels||[]).length+(data.anniversaries||[]).length;
    if(id==='sport') return items+(data.weights||[]).length;
    if(id==='habit') return (data.habits||[]).length;
    if(id==='finance') return (data.finances||[]).length+(data.funds||[]).length;
    if(id==='news') return 0;
    return items;
  }
  function persist(){
    if(typeof global.save === 'function') global.save();
    renderChrome();
    if(typeof global.render === 'function') global.render();
  }
  function setEnabled(id, enabled){
    if(!moduleMap[id]) return;
    var cfg=ensureConfig();
    cfg.enabled[id]=!!enabled;
    if(!enabled) cfg.pinned=cfg.pinned.filter(function(x){ return x!==id; });
    if(!enabled && global.currentCat===id){
      global.currentCat='more';
      if(global.WorkbenchStore && global.WorkbenchStore.setState) global.WorkbenchStore.setState({currentCat:'more'});
    }
    persist();
    if(typeof global.toast==='function') global.toast(enabled ? '已启用「'+moduleMap[id].name+'」' : '已隐藏「'+moduleMap[id].name+'」，原有数据仍保留');
  }
  function toggleEnabled(id){ setEnabled(id, !isEnabled(id)); }
  function togglePinned(id){
    var meta=moduleMap[id];
    if(!meta) return;
    var cfg=ensureConfig();
    if(!cfg.enabled[id]) cfg.enabled[id]=true;
    var index=cfg.pinned.indexOf(id);
    if(index>=0) cfg.pinned.splice(index,1);
    else {
      if(cfg.pinned.length>=MAX_PINNED){
        if(typeof global.toast==='function') global.toast('顶部最多固定 '+MAX_PINNED+' 个可选模块');
        return;
      }
      cfg.pinned.push(id);
    }
    persist();
  }
  function movePinned(id, direction){
    var cfg=ensureConfig();
    var from=cfg.pinned.indexOf(id);
    var to=from+direction;
    if(from<0 || to<0 || to>=cfg.pinned.length) return;
    var tmp=cfg.pinned[from];cfg.pinned[from]=cfg.pinned[to];cfg.pinned[to]=tmp;
    persist();
  }
  function openModule(id){
    if(!isEnabled(id)){
      setEnabled(id,true);
    }
    if(typeof global.setView==='function') global.setView(id);
  }
  function navButton(meta){
    var label=meta.shortName||meta.name;
    var badgeId='bd-'+meta.id;
    var badge = meta.id==='news' ? '' : '<span class="badge" id="'+badgeId+'"></span>';
    return '<button class="tab" data-cat="'+meta.id+'" onclick="setView(\''+meta.id+'\')" type="button"><span class="ico">'+meta.icon+'</span>'+label+badge+'</button>';
  }
  function renderNavigation(){
    var slot=document.getElementById('moduleNav');
    if(!slot) return;
    var cfg=ensureConfig();
    slot.innerHTML=cfg.pinned.map(function(id){ return navButton(moduleMap[id]); }).join('');
    var active=global.currentCat;
    document.querySelectorAll('#nav .tab').forEach(function(tab){
      var on=tab.dataset.cat===active;
      tab.classList.toggle('active',on);
      if(on) tab.setAttribute('aria-current','page'); else tab.removeAttribute('aria-current');
    });
    if(typeof global.v5RefreshBadges==='function') global.v5RefreshBadges();
  }
  function renderSaveStatus(){
    var el=document.getElementById('saveState');
    if(!el) return;
    var ts=getData().__savedAt;
    if(!ts){el.textContent='已保存在本机';return;}
    try{
      el.textContent='已保存 '+new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    }catch(e){ el.textContent='已保存在本机'; }
  }
  function renderChrome(){ renderNavigation();renderSaveStatus(); }

  var originalSetView=global.setView;
  if(typeof originalSetView==='function'){
    global.setView=function(id){
      if(moduleMap[id] && !isEnabled(id)){
        originalSetView.call(global,'more');
        if(typeof global.toast==='function') global.toast('请先在「更多」中启用「'+moduleMap[id].name+'」');
        return;
      }
      var result=originalSetView.apply(this,arguments);
      renderNavigation();
      return result;
    };
  }

  global.WorkbenchModules = {
    list:function(){ return MODULES.slice(); },
    get:moduleById,
    config:ensureConfig,
    isCore:isCore,
    isEnabled:isEnabled,
    isCategoryVisible:isCategoryVisible,
    isPinned:isPinned,
    countFor:countFor,
    setEnabled:setEnabled,
    toggleEnabled:toggleEnabled,
    togglePinned:togglePinned,
    movePinned:movePinned,
    open:openModule,
    renderChrome:renderChrome,
    maxPinned:MAX_PINNED
  };
  global.toggleWorkbenchModule=toggleEnabled;
  global.toggleWorkbenchModulePin=togglePinned;
  global.moveWorkbenchModule=movePinned;
  global.openWorkbenchModule=openModule;
  renderChrome();
})(window);
