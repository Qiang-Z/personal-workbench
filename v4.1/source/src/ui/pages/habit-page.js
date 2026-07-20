(function(global){
  if(typeof global.renderHabits !== 'function') return;
  var legacyRenderHabits = global.renderHabits;
  function renderSummary(){
    var hb=global.WorkbenchHealthMetrics.habitSummary();
    var sp=global.WorkbenchHealthMetrics.sportSummary();
    var kit=global.WorkbenchPanelKit;
    if(kit){
      return kit.summaryGrid([
        kit.summaryCard('life','🔥 习惯总数',hb.total,'正在跟踪的习惯'),
        kit.summaryCard('life','✅ 今日打卡',hb.doneToday,'今日已完成的习惯数'),
        kit.summaryCard('life','📈 本周累计',hb.totalWeek,'本周所有习惯打卡次数'),
        kit.summaryCard('sport','🏃 运动联动',sp.weekDoneMinutes,'本周运动分钟，可与习惯复盘一起看')
      ], 'margin-bottom:14px');
    }
    var html='<div class="grid cards" style="margin-bottom:14px">';
    html+='<div class="card life"><div class="t">🔥 习惯总数</div><div class="n">'+hb.total+'</div><div class="d">正在跟踪的习惯</div></div>';
    html+='<div class="card life"><div class="t">✅ 今日打卡</div><div class="n">'+hb.doneToday+'</div><div class="d">今日已完成的习惯数</div></div>';
    html+='<div class="card life"><div class="t">📈 本周累计</div><div class="n">'+hb.totalWeek+'</div><div class="d">本周所有习惯打卡次数</div></div>';
    html+='<div class="card sport"><div class="t">🏃 运动联动</div><div class="n">'+sp.weekDoneMinutes+'</div><div class="d">本周运动分钟，可与习惯复盘一起看</div></div>';
    html+='</div>';
    return html;
  }
  global.renderHabits = function(){
    return renderSummary() + legacyRenderHabits();
  };
})(window);
(function(global){
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('habit', (typeof global.renderHabits==='function') ? global.renderHabits : function(){ return ''; });
  }
})(window);
