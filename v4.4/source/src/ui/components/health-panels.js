(function(global){
  function badge(text, bg, fg){ return global.WorkbenchPanelKit ? global.WorkbenchPanelKit.badge(text, bg, fg) : ('<span class="tag" style="background:'+bg+';color:'+fg+'">'+text+'</span>'); }
  var legacyWeights = typeof global.renderWeights==='function' ? global.renderWeights : null;
  var legacySportLog = typeof global.renderSportLog==='function' ? global.renderSportLog : null;
  var legacySportPlan = typeof global.renderSportPlan==='function' ? global.renderSportPlan : null;
  global.renderWeightsPanel = function(){
    if(!legacyWeights) return '';
    return legacyWeights();
  };
  global.renderSportPlanPanel = function(){
    if(!legacySportPlan) return '';
    var sp=global.WorkbenchHealthMetrics.sportSummary();
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>🎯 我的每周目标</h2><button class="btn small" onclick="openHealthGoalForm()">调整目标</button></div><div class="meta">'
      + badge('目标 '+sp.goals.weeklyMinutes+' 分钟','#8b5cf622','#8b5cf6')
      + badge('目标 '+sp.goals.weeklySessions+' 次','#6366f122','#6366f1')
      + badge('已完成 '+sp.weekDoneMinutes+' 分钟 / '+sp.weekDoneSessions+' 次','#10b98122','#10b981')
      + '</div></div>';
    return head + legacySportPlan();
  };
  global.renderSportLogPanel = function(){
    if(!legacySportLog) return '';
    var sp=global.WorkbenchHealthMetrics.sportSummary();
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>🏃 运动记录摘要</h2></div><div class="meta">'
      + badge('总记录 '+sp.totalLogs,'#8b5cf622','#8b5cf6')
      + badge('累计 '+sp.totalLoggedMinutes+' 分','#10b98122','#10b981')
      + badge('本周 '+sp.weekDoneMinutes+' 分 · '+sp.weekDoneSessions+' 次','#6366f122','#6366f1')
      + '</div></div>';
    return head + legacySportLog();
  };
})(window);
