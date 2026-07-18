(function(global){
  function buildOverviewEnhancements(){
    var today = global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10);
    var data = (global.WorkbenchData && global.WorkbenchData.getData()) || global.data || { items: [], finances: [], prefs: {} };
    var visibleItems = (data.items || []).filter(function(i){ return !global.WorkbenchModules || global.WorkbenchModules.isCategoryVisible(i.cat); });
    var td = visibleItems.filter(function(i){ return i.status !== 'done' && i.due === today; }).length;
    var od = visibleItems.filter(function(i){ return i.status !== 'done' && i.due && i.due < today; }).length;
    var health = global.WorkbenchHealthMetrics && global.WorkbenchHealthMetrics.sportSummary ? global.WorkbenchHealthMetrics.sportSummary() : null;
    var goalMinutes = health ? health.goals.weeklyMinutes : 150;
    var wkMins = health ? health.weekDoneMinutes : 0;
    var mNow = new Date().toISOString().slice(0,7);
    var inc = 0, exp = 0;
    (data.finances || []).forEach(function(f){
      if(f.date && f.date.slice(0,7) === mNow){
        if(f.type === 'income') inc += +f.amount || 0;
        else exp += +f.amount || 0;
      }
    });
    var bal = inc - exp;
    var sizeWarn = '';
    try{
      var sz = JSON.stringify(data).length;
      if(sz > 1.5 * 1024 * 1024){
        sizeWarn = '<div class="bulk-bar" style="border-color:#f59e0b;color:#92400e">⚠️ 本地数据 ' + (sz/1024/1024).toFixed(1) + ' MB，已接近浏览器上限，建议备份后导出归档。</div>';
      }
    }catch(e){}
    var top3 = typeof global.v5Top3Today === 'function' ? global.v5Top3Today() : '';
    var secondary =
      '<div class="today-mc"><div class="t">🚨 已逾期</div><div class="n" style="color:' + (od>0?'#ef4444':'var(--text)') + '">' + od + '</div><div class="d">条需要处理</div></div>' +
      '<div class="today-mc"><div class="t">⏰ 今日截止</div><div class="n">' + td + '</div><div class="d">条事项</div></div>';
    if(!global.WorkbenchModules || global.WorkbenchModules.isEnabled('sport')) secondary +=
      '<div class="today-mc"><div class="t">🏃 本周运动</div><div class="n">' + wkMins + '</div><div class="d">分钟 · 我的目标 ' + goalMinutes + '</div></div>';
    if(!global.WorkbenchModules || global.WorkbenchModules.isEnabled('finance')) secondary +=
      '<div class="today-mc"><div class="t">💰 本月结余</div><div class="n" style="color:' + (bal>=0?'#10b981':'#ef4444') + '">' + (bal>=0?'+':'-') + Math.abs(bal).toFixed(2) + '</div><div class="d">元</div></div>';
    var kpi =
      '<div class="today-mustdo" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">' + top3 + '</div>' +
      '<div class="today-mustdo" style="background:transparent;border:0;box-shadow:none;padding:0;margin-top:6px">' +
      secondary + '</div>';
    var healthNudge='';
    if((!global.WorkbenchModules || global.WorkbenchModules.isEnabled('sport')) && health && health.todayPlan && !health.todayDone && !health.todayPlan.plan.skipped){
      var hp=health.todayPlan;
      var safeType=global.esc?global.esc(hp.plan.type):String(hp.plan.type||'运动');
      var safeNote=global.esc?global.esc(hp.plan.note||'按今天的状态完成即可，实际时长可以调整。'):String(hp.plan.note||'');
      healthNudge='<div class="today-health-nudge"><div><span>今天的运动</span><b>'+safeType+' · '+(+hp.plan.minutes||0)+' 分钟</b><small>'+safeNote+'</small></div>'
        +'<div><button class="btn primary" onclick="completePlan(\''+hp.key+'\','+hp.dayIdx+')">完成并记录</button><button class="btn" onclick="setView(\'sport\')">打开健康首页</button></div></div>';
    }
    return {
      banner: typeof global.v5DailyBanner === 'function' ? global.v5DailyBanner() : '',
      recent: typeof global.v5RecentQuickAdds === 'function' ? global.v5RecentQuickAdds() : '',
      kpi: kpi,
      health: healthNudge,
      sizeWarn: sizeWarn
    };
  }
  global.WorkbenchOverviewDomain = { buildOverviewEnhancements: buildOverviewEnhancements };
})(window);
