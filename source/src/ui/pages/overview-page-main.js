(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  global.renderOverview = function(){
    var html='<div class="grid cards">';
    for(var c in global.CATS){
      if(global.WorkbenchModules && !global.WorkbenchModules.isCategoryVisible(c)) continue;
      if(c==='finance'){
        var fin=global.WorkbenchOverviewSummary.financeSummary();
        html += '<div class="card finance"><div class="t">💰 总资产</div><div class="n">'+ fin.totalAssets.toFixed(0) +'</div><div class="d">'+ (fin.totalAssets?('基金 '+(fin.fundValue/fin.totalAssets*100).toFixed(0)+'% · 现金 '+(fin.cash/fin.totalAssets*100).toFixed(0)+'%'):'基金市值 + 现金结余(元)') +'</div></div>';
        continue;
      }
      var pg=global.WorkbenchOverviewSummary.catProgress(c);
      html += '<div class="card '+c+'"><div class="t">'+global.CATS[c].icon+' '+global.CATS[c].name+'</div>'
        + '<div class="n">'+pg.count+'</div>'
        + '<div class="bar"><i style="width:'+pg.pct+'%;background:'+global.CATS[c].color+'"></i></div></div>';
    }
    html+='</div>';
    var focus=global.WorkbenchOverviewSummary.focusItems();
    html+='<div class="panel" style="margin-top:14px"><h2>📌 今日聚焦（'+focus.today+'）</h2>';
    if(!focus.items.length) html+='<div class="empty">今天没有待办 / 逾期，状态很好 ✨</div>';
    else {
      html+='<div class="list">'+focus.items.slice(0,8).map(global.itemHTML).join('')+'</div>';
      if(focus.lateN) html+='<div class="d" style="color:#ef4444;margin-top:6px">⚠️ 其中有 '+focus.lateN+' 项已逾期</div>';
    }
    html+='</div>';
    var projs=global.WorkbenchOverviewSummary.activeProjects();
    if(projs.length){
      html+='<div class="panel" style="margin-top:14px"><h2>📁 进行中项目</h2><div class="list">';
      projs.forEach(function(x){
        html+='<div class="item"><div class="body"><div class="title">'+esc(x.project.name)+'</div>'
          + '<div class="meta"><span class="tag" style="background:#10b98122;color:var(--work)">里程碑 '+x.msDone+'/'+x.milestones.length+'</span><span class="tag" style="background:#10b98122;color:var(--work)">任务 '+x.tasks+'</span>' + (x.overdue?'<span class="tag" style="background:#ef444422;color:#ef4444">逾期 '+x.overdue+'</span>':'') + '</div>'
          + '<div class="bar"><i style="width:'+x.pct+'%;background:var(--work)"></i></div></div>'
          + '<div class="acts"><button class="icon-btn" onclick="setView(\'work\')">↗</button></div></div>';
      });
      html+='</div></div>';
    }
    var soon=global.WorkbenchOverviewSummary.upcomingItems();
    html+='<div class="panel" style="margin-top:14px"><h2>⏰ 近期待办 / 截止</h2>';
    html += !soon.length ? '<div class="empty">暂无带日期的待办，轻松～</div>' : '<div class="list">'+soon.map(global.itemHTML).join('')+'</div>';
    html+='</div>';
    return html;
  };
})(window);
(function(global){
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('overview', function(){ return (typeof global.decorOverview==='function' && typeof global.renderOverview==='function') ? global.decorOverview(global.renderOverview()) : ''; });
  }
})(window);
