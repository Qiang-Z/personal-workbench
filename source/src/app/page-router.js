(function(global){
  function getApp(){ return document.getElementById('app'); }
  function chips(items, style){
    if(global.WorkbenchPanelKit && typeof global.WorkbenchPanelKit.chips === 'function') return global.WorkbenchPanelKit.chips(items, { style: style || '' });
    return '<div class="chips"'+(style?' style="'+style+'"':'')+'>'+items.map(function(it){ return '<span class="ctab '+(it.active?'on':'')+'" onclick="'+it.onClick+'">'+it.label+'</span>'; }).join('')+'</div>';
  }
  function renderCalendarPage(){
    try {
      var sc=global.calScope;
      if(sc!=='all' && global.WorkbenchModules && !global.WorkbenchModules.isCategoryVisible(sc)){
        sc='all';
        global.calScope='all';
      }
      var left = chips([
        { label:'📅 月', active:global.calView==='month', onClick:"setCalView('month')" },
        { label:'🗓️ 周', active:global.calView==='week', onClick:"setCalView('week')" },
        { label:'📋 日程', active:global.calView==='agenda', onClick:"setCalView('agenda')" }
      ]);
      var rightItems=[{ label:'全部', active:sc==='all', onClick:"setCalScope('all')" }];
      for(var c in global.CATS){
        if(global.WorkbenchModules && !global.WorkbenchModules.isCategoryVisible(c)) continue;
        rightItems.push({ label:global.CATS[c].name, active:sc===c, onClick:"setCalScope('"+c+"')" });
      }
      var right = chips(rightItems);
      var head='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">'+left+'<span class="spacer" style="flex:1"></span>'+right+'</div>';
      var body;
      if(global.calView==='week') body=global.renderWeek(sc);
      else if(global.calView==='agenda') body=global.renderAgenda(sc);
      else body=global.renderCalendar(sc);
      return head+body;
    } catch(e) {
      console.error('[Workbench] Error rendering calendar page', e);
      return '<div class="panel" style="margin:20px"><h2>⚠️ 日历渲染出错</h2><p>请刷新页面或检查控制台</p></div>';
    }
  }
  function modulePage(cat, opts){
    try {
      var html = global.renderModule(cat);
      return html;
    } catch(e) {
      console.error('[Workbench] Error rendering module page for: ' + cat, e);
      return '<div class="panel" style="margin:20px;border:1px solid #ef4444;border-radius:12px;padding:20px;background:#fef2f2"><h2 style="color:#ef4444">⚠️ 页面渲染出错</h2><p style="color:#991b1b;margin:8px 0">模块 <b>' + esc(cat) + '</b> 渲染时发生错误。</p><p style="color:#7f1d1d;font-size:13px">请尝试刷新页面或检查浏览器控制台。</p><button class="btn" style="margin-top:12px" onclick="location.reload()">🔄 刷新页面</button></div>';
    }
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return '&#' + c.charCodeAt(0) + ';'; }); }
  function registerDefaults(){
    var reg=global.WorkbenchPageRegistry;
    if(!reg || reg.__defaultsRegistered) return;
    try {
      reg.register('overview', function(){ return global.decorOverview(global.renderOverview()); });
      reg.register('review', function(){ return global.renderReview(); });
      reg.register('habit', function(){ return global.renderHabits(); });
      reg.register('news', function(){ global.renderNews(); return null; });
      reg.register('calendar', renderCalendarPage);
      reg.register('finance', function(){ return global.renderFunds(); });
      ['work','research','life','sport'].forEach(function(cat){ reg.register(cat, function(){ return modulePage(cat); }); });
    } catch(e) {
      console.error('[Workbench] Error registering default pages', e);
      // Attempt binary fallback: re-register using legacy renderModule only
      try {
        ['work','research','life','sport'].forEach(function(cat){
          reg.register(cat, function(){ return modulePage(cat); });
        });
      } catch(e2){}
    }
    reg.__defaultsRegistered = true;
  }
  function fallbackRender(){
    if(typeof global.__legacyRenderApp === 'function') {
      try { return global.__legacyRenderApp(); } catch(e) {}
    }
    var cat = global.currentCat;
    try {
      return global.renderModule(cat);
    } catch(e) {}
    return '';
  }
  function renderCurrent(){
    try {
      registerDefaults();
      var app=getApp();
      if(!app) return;
      var cat=global.currentCat;
      var html = global.WorkbenchPageRegistry ? global.WorkbenchPageRegistry.render(cat) : modulePage(cat);
      if(html!=null && String(html).trim().length > 10) app.innerHTML=html;
      else if(html!=null && String(html).trim().length <= 10) {
        // HTML output is too short/empty, attempt modulePage directly as fallback
        try {
          var fb = modulePage(cat);
          if(fb && String(fb).trim().length > 10) app.innerHTML = fb;
        } catch(e) {
          app.innerHTML = '<div class="panel" style="margin:20px;padding:20px;text-align:center"><h2>📭 暂无内容</h2><p style="color:var(--muted)">当前页面没有可显示的内容</p></div>';
        }
      }
      if(typeof global.v5RefreshBadges==='function') global.v5RefreshBadges();
      if(global.WorkbenchModules && typeof global.WorkbenchModules.renderChrome==='function') global.WorkbenchModules.renderChrome();
    } catch(e) {
      console.error('[Workbench] renderCurrent failed for cat: ' + global.currentCat, e);
      var app = getApp();
      if(app) {
        try {
          var fb = fallbackRender();
          if(fb) app.innerHTML = fb;
          else app.innerHTML = '<div class="panel" style="margin:20px;border:1px solid #ef4444;border-radius:12px;padding:20px;background:#fef2f2"><h2 style="color:#ef4444">⚠️ 页面渲染出错</h2><p style="color:#991b1b;margin:8px 0">页面渲染时发生错误，请查看浏览器控制台获取详情。</p><button class="btn" style="margin-top:12px" onclick="location.reload()">🔄 刷新页面</button></div>';
        } catch(e2) {
          app.innerHTML = '<div style="padding:40px;text-align:center"><h2>⚠️ 渲染失败</h2><p>请刷新页面重试</p></div>';
        }
      }
      if(typeof global.v5RefreshBadges === 'function') {
        try { global.v5RefreshBadges(); } catch(e3) {}
      }
    }
  }
  global.WorkbenchPageRouter={
    renderCalendarPage:renderCalendarPage,
    renderCurrent:renderCurrent,
    register:function(name, fn){ registerDefaults(); return global.WorkbenchPageRegistry.register(name, fn); },
    unregister:function(name){ return global.WorkbenchPageRegistry.unregister(name); },
    get:function(name){ registerDefaults(); return global.WorkbenchPageRegistry.get(name); },
    list:function(){ registerDefaults(); return global.WorkbenchPageRegistry.list(); },
    registerModulePage:function(name, opts){ registerDefaults(); return global.WorkbenchPageRegistry.register(name, function(){ return modulePage(name, opts||{}); }); }
  };
  if(typeof global.render==='function' && !global.__legacyRenderApp){ global.__legacyRenderApp=global.render; }
  global.render=function(){ return renderCurrent(); };
})(window);
