(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function renderSummaryCards(){
    var lt=global.WorkbenchLifeSummary.lifeTaskSummary();
    var bk=global.WorkbenchLifeSummary.bookSummary();
    var tv=global.WorkbenchLifeSummary.travelSummary();
    var an=global.WorkbenchLifeSummary.anniversarySummary();
    var kit=global.WorkbenchPanelKit;
    if(kit){
      return kit.summaryGrid([
        kit.summaryCard('life','📋 生活事项',lt.total,'未完成 '+lt.open+' · 带日期 '+lt.due),
        kit.summaryCard('life','📚 读书',bk.total,'在读 '+bk.reading+' · 已读 '+bk.done+' · 待读 '+bk.wishlist),
        kit.summaryCard('life','🧳 出行',tv.total,'未出发 '+tv.upcoming+' · 进行中 '+tv.ongoing+' · 预算 '+tv.budgetTotal.toFixed(0)),
        kit.summaryCard('life','🎉 纪念日',an.total,'7天内 '+an.upcoming7+' · 30天内 '+an.upcoming30+(an.next&&an.next.item?(' · 最近 '+esc(an.next.item.name)):''))
      ]);
    }
    var html='<div class="grid cards">';
    html+='<div class="card life"><div class="t">📋 生活事项</div><div class="n">'+lt.total+'</div><div class="d">未完成 '+lt.open+' · 带日期 '+lt.due+'</div></div>';
    html+='<div class="card life"><div class="t">📚 读书</div><div class="n">'+bk.total+'</div><div class="d">在读 '+bk.reading+' · 已读 '+bk.done+' · 待读 '+bk.wishlist+'</div></div>';
    html+='<div class="card life"><div class="t">🧳 出行</div><div class="n">'+tv.total+'</div><div class="d">未出发 '+tv.upcoming+' · 进行中 '+tv.ongoing+' · 预算 '+tv.budgetTotal.toFixed(0)+'</div></div>';
    html+='<div class="card life"><div class="t">🎉 纪念日</div><div class="n">'+an.total+'</div><div class="d">7天内 '+an.upcoming7+' · 30天内 '+an.upcoming30+(an.next&&an.next.item?(' · 最近 '+esc(an.next.item.name)):'')+'</div></div>';
    html+='</div>';
    return html;
  }
  function renderTabs(){
    var data=getData();
    if(global.WorkbenchPanelKit && typeof global.WorkbenchPanelKit.chips==='function'){
      return global.WorkbenchPanelKit.chips([
        { label:'📋 任务', active:global.lifeTab==='tasks', onClick:"setLifeTab('tasks')" },
        { label:'📚 读书（'+((data.books||[]).length)+'）', active:global.lifeTab==='books', onClick:"setLifeTab('books')" },
        { label:'🧳 旅行（'+((data.travels||[]).length)+'）', active:global.lifeTab==='travel', onClick:"setLifeTab('travel')" },
        { label:'🎉 纪念日（'+((data.anniversaries||[]).length)+'）', active:global.lifeTab==='anniversary', onClick:"setLifeTab('anniversary')" }
      ], { style:'margin:16px 0' });
    }
    return '<div class="chips" style="margin:16px 0">'
      + '<span class="ctab '+(global.lifeTab==='tasks'?'on':'')+'" onclick="setLifeTab(\'tasks\')">📋 任务</span>'
      + '<span class="ctab '+(global.lifeTab==='books'?'on':'')+'" onclick="setLifeTab(\'books\')">📚 读书（'+((data.books||[]).length)+'）</span>'
      + '<span class="ctab '+(global.lifeTab==='travel'?'on':'')+'" onclick="setLifeTab(\'travel\')">🧳 旅行（'+((data.travels||[]).length)+'）</span>'
      + '<span class="ctab '+(global.lifeTab==='anniversary'?'on':'')+'" onclick="setLifeTab(\'anniversary\')">🎉 纪念日（'+((data.anniversaries||[]).length)+'）</span>'
      + '</div>';
  }
  function renderTaskBlocks(){
    var data=getData();
    var cat='life', k={cal:'cal_'+cat,ag:'ag_'+cat,all:'all_'+cat};
    var html='';
    html+='<div class="panel collapsible '+(((global.collapseState||{})[k.cal])?'collapsed':'')+'" data-collapse="'+k.cal+'">'
      + '<div class="panel-h" onclick="toggleCollapse(\''+k.cal+'\')"><h2>📅 生活日历</h2><span class="caret">▾</span></div>'
      + '<div class="panel-b">'+global.renderCalendar(cat)+'</div></div>';
    var ag=(data.items||[]).filter(function(i){ return i.cat===cat && i.due; }).sort(function(a,b){ return a.due.localeCompare(b.due); });
    html+='<div class="panel collapsible '+(((global.collapseState||{})[k.ag])?'collapsed':'')+'" style="margin-top:14px" data-collapse="'+k.ag+'">'
      + '<div class="panel-h" onclick="toggleCollapse(\''+k.ag+'\')"><h2>🗓️ 日程（按日期）</h2><span class="caret">▾</span></div>'
      + '<div class="panel-b">'+(ag.length?'<div class="list">'+ag.map(global.itemHTML).join('')+'</div>':'<div class="empty">暂无带日期的生活事项。</div>')+'</div></div>';
    var items=(global.WorkbenchSelectors && typeof global.WorkbenchSelectors.filteredItems==='function') ? global.WorkbenchSelectors.filteredItems('life') : global.filtered();
    html+='<div class="panel collapsible '+(((global.collapseState||{})[k.all])?'collapsed':'')+'" style="margin-top:14px" data-collapse="'+k.all+'">'
      + '<div class="panel-h" onclick="toggleCollapse(\''+k.all+'\')"><h2>🌿 生活全部（'+items.length+'）</h2><span class="caret">▾</span></div>'
      + '<div class="panel-b">'+(items.length?'<div class="list">'+items.map(global.itemHTML).join('')+'</div>':'<div class="empty">还没有生活事项。</div>')+'</div></div>';
    return html;
  }
  global.renderLifeModule = function(){
    var html='';
    html += renderSummaryCards();
    html += renderTabs();
    if(global.lifeTab==='books') return html + (global.renderBooksPanel ? global.renderBooksPanel() : global.renderBooks());
    if(global.lifeTab==='travel') return html + (global.renderTravelsPanel ? global.renderTravelsPanel() : global.renderTravels());
    if(global.lifeTab==='anniversary') return html + (global.renderAnniversariesPanel ? global.renderAnniversariesPanel() : global.renderAnniversaries());
    return html + renderTaskBlocks();
  };
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('life', global.renderLifeModule);
  }
})(window);
