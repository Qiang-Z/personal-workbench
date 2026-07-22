(function(global){
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g,function(c){ return '&#'+c.charCodeAt(0)+';'; }); }
  function metrics(){ return global.WorkbenchHealthMetrics; }
  function progressRow(label, value, goal, pct, helper){
    return '<div class="health-progress-row">'
      +'<div class="health-progress-head"><b>'+label+'</b><span>'+value+' / '+goal+'</span></div>'
      +'<div class="health-progress-track"><i style="width:'+Math.max(0,Math.min(100,pct))+'%"></i></div>'
      +'<small>'+helper+'</small></div>';
  }
  function renderTodayPlan(sp){
    var info=sp.todayPlan;
    if(!info){
      return '<div class="panel health-today"><div class="health-panel-title"><div><span>今天</span><h2>还没有运动安排</h2></div><span class="health-state gentle">轻量开始</span></div>'
        +'<p>可以安排一次短运动，也可以在完成后直接记录。没有计划不等于落后。</p>'
        +'<div class="health-actions"><button class="btn primary" onclick="openPlanSlot(\''+sp.range.mon+'\','+((new Date(sp.range.today+'T00:00:00').getDay()+6)%7)+')">＋ 安排今天</button>'
        +'<button class="btn" onclick="openForm(\'sport\',null,\''+sp.range.today+'\')">记录已完成运动</button></div></div>';
    }
    var p=info.plan;
    if(p.skipped){
      return '<div class="panel health-today skipped"><div class="health-panel-title"><div><span>今天</span><h2>'+esc(p.type)+' · '+(+p.minutes||0)+' 分钟</h2></div><span class="health-state gentle">已调整为休息</span></div>'
        +'<p>'+esc(p.note||'休息也是计划的一部分，按身体状态灵活调整即可。')+'</p>'
        +'<div class="health-actions"><button class="btn" onclick="restorePlan(\''+info.key+'\','+info.dayIdx+')">恢复计划</button><button class="btn quiet" onclick="reschedulePlan(\''+info.key+'\','+info.dayIdx+',1)">改到明天</button></div></div>';
    }
    if(sp.todayDone){
      return '<div class="panel health-today done"><div class="health-panel-title"><div><span>今天</span><h2>'+esc(p.type)+' · '+(+p.minutes||0)+' 分钟</h2></div><span class="health-state success">✓ 已完成</span></div>'
        +'<p>'+esc(p.note||'今天已经动过了，剩下的时间安心恢复。')+'</p>'
        +'<div class="health-actions"><button class="btn" onclick="setSportTab(\'log\')">查看运动记录</button><button class="btn quiet" onclick="openForm(\'sport\',null,\''+sp.range.today+'\')">再记一项</button></div></div>';
    }
    return '<div class="panel health-today active"><div class="health-panel-title"><div><span>今天的计划</span><h2>'+esc(p.type)+' · '+(+p.minutes||0)+' 分钟</h2></div><span class="health-state">待完成</span></div>'
      +'<p>'+esc(p.note||'按今天的状态完成即可，实际时长可以在记录时调整。')+'</p>'
      +'<div class="health-actions"><button class="btn primary" onclick="completePlan(\''+info.key+'\','+info.dayIdx+')">✓ 完成并记录</button>'
      +'<button class="btn" onclick="reschedulePlan(\''+info.key+'\','+info.dayIdx+',1)">改到明天</button>'
      +'<button class="btn quiet" onclick="skipPlan(\''+info.key+'\','+info.dayIdx+')">今天休息</button></div></div>';
  }
  function renderWeeklyProgress(sp){
    var minuteHelp=sp.remainingMinutes>0?'还差 '+sp.remainingMinutes+' 分钟，按状态分配到本周即可':'本周时长目标已经完成';
    var sessionHelp=sp.remainingSessions>0?'再完成 '+sp.remainingSessions+' 次即可达到自己设定的频次':'本周次数目标已经完成';
    return '<div class="panel"><div class="health-panel-title"><div><span>'+sp.range.mon+' ~ '+sp.range.sun+'</span><h2>本周进度</h2></div><button class="btn small" onclick="openHealthGoalForm()">调整目标</button></div>'
      +'<div class="health-progress-list">'
      +progressRow('运动时长',sp.weekDoneMinutes+' 分钟',sp.goals.weeklyMinutes+' 分钟',sp.minuteProgress,minuteHelp)
      +progressRow('运动次数',sp.weekDoneSessions+' 次',sp.goals.weeklySessions+' 次',sp.sessionProgress,sessionHelp)
      +'</div><div class="health-plan-note">已安排 '+sp.weekPlannedSessions+' 次 · 共 '+sp.weekPlannedMinutes+' 分钟</div></div>';
  }
  function renderRecentActivity(sp){
    var r=sp.recentLog;
    var body=r
      ? '<div class="health-recent-main"><span class="health-activity-icon">🏃</span><div><b>'+esc(r.sportType||'运动')+' · '+(+r.minutes||0)+' 分钟</b><small>'+esc(r.due||r.created||'')+(r.effort?' · '+effortLabel(r.effort):'')+'</small></div></div>'
      : '<div class="empty health-empty">完成一次运动后，这里会显示最近记录。</div>';
    return '<div class="panel"><div class="health-panel-title"><div><span>最近一次</span><h2>运动记录</h2></div><button class="btn small" onclick="setSportTab(\'log\')">全部记录</button></div>'+body+'</div>';
  }
  function effortLabel(v){ return ({light:'轻松',moderate:'刚好',hard:'吃力',max:'接近极限'})[v]||v; }
  function renderBodyTrend(wt){
    var main=wt.latestWeight!=null?wt.latestWeight.toFixed(1)+' kg':'尚未记录';
    var avg=wt.avg7!=null?'近 7 天均值 '+wt.avg7.toFixed(1)+' kg':'连续记录后可查看 7 天均值';
    var change=wt.change30==null?'近 30 天趋势待形成':('近 30 天 '+(wt.change30>0?'+':'')+wt.change30.toFixed(1)+' kg');
    return '<div class="panel"><div class="health-panel-title"><div><span>身体趋势</span><h2>'+main+'</h2></div><button class="btn small" onclick="openWeightForm()">记录体重</button></div>'
      +'<div class="health-trend-meta"><span>'+avg+'</span><span>'+change+'</span>'+(wt.target!=null?'<span>目标 '+esc(wt.target)+' kg</span>':'')+'</div>'
      +'<p class="health-muted">关注一段时间的变化，不必被单日波动影响。</p><button class="text-action" onclick="setSportTab(\'weight\')">查看身体趋势 →</button></div>';
  }
  function renderHealthHome(){
    var sp=metrics().sportSummary(), wt=metrics().weightSummary();
    var title=sp.todayPlan&&!sp.todayPlan.plan.skipped&&!sp.todayDone?'今天按计划动一动':'让运动适应生活，而不是增加负担';
    return '<section class="health-hero"><div><span>健康与运动</span><h1>'+title+'</h1><p>先看今天，再看本周；轻松记录真实完成情况，长期趋势自然会形成。</p></div>'
      +'<div><button class="btn" onclick="openWeightForm()">⚖️ 记录体重</button><button class="btn primary" onclick="openForm(\'sport\',null,\''+sp.range.today+'\')">＋ 记录运动</button></div></section>'
      +'<div class="health-home-grid"><div class="health-home-main">'+renderTodayPlan(sp)+renderWeeklyProgress(sp)+'</div>'
      +'<div class="health-home-side">'+renderRecentActivity(sp)+renderBodyTrend(wt)+'</div></div>';
  }
  function renderTabs(){
    var count=((getData().items||[]).filter(function(i){ return i.cat==='sport'&&i.status==='done'; }).length);
    var items=[
      { label:'☀️ 健康首页', active:global.sportTab==='overview', onClick:"setSportTab('overview')" },
      { label:'🏃 运动记录（'+count+'）', active:global.sportTab==='log', onClick:"setSportTab('log')" },
      { label:'⚖️ 身体趋势', active:global.sportTab==='weight', onClick:"setSportTab('weight')" },
      { label:'📅 目标与计划', active:global.sportTab==='plan', onClick:"setSportTab('plan')" }
    ];
    if(global.WorkbenchPanelKit && typeof global.WorkbenchPanelKit.chips==='function') return global.WorkbenchPanelKit.chips(items,{style:'margin:0 0 16px'});
    return '<div class="chips" style="margin:0 0 16px">'+items.map(function(i){ return '<span class="ctab '+(i.active?'on':'')+'" onclick="'+i.onClick+'">'+i.label+'</span>'; }).join('')+'</div>';
  }
  global.openHealthGoalForm=function(){
    var g=metrics().healthGoals(), data=getData();
    document.getElementById('hg_minutes').value=g.weeklyMinutes;
    document.getElementById('hg_sessions').value=g.weeklySessions;
    document.getElementById('hg_target_weight').value=data.targetWeight||'';
    document.getElementById('healthGoalMask').classList.add('show');
    document.getElementById('hg_minutes').focus();
  };
  global.closeHealthGoal=function(){ document.getElementById('healthGoalMask').classList.remove('show'); };
  global.submitHealthGoals=function(){
    var minutes=Math.round(+document.getElementById('hg_minutes').value||0);
    var sessions=Math.round(+document.getElementById('hg_sessions').value||0);
    if(minutes<1||sessions<1){ alert('每周目标需要大于 0'); return; }
    var data=getData();
    if(!data.prefs||typeof data.prefs!=='object') data.prefs={};
    data.prefs.healthGoals={weeklyMinutes:minutes,weeklySessions:sessions};
    var tw=parseFloat(document.getElementById('hg_target_weight').value);
    data.targetWeight=isNaN(tw)||tw<=0?null:tw;
    if(typeof global.save==='function') global.save();
    global.closeHealthGoal();
    if(typeof global.render==='function') global.render();
  };
  global.renderSportModule = function(){
    if(['overview','log','weight','plan'].indexOf(global.sportTab)<0) global.sportTab='overview';
    var html=renderTabs();
    if(global.sportTab==='overview') html+=renderHealthHome();
    else if(global.sportTab==='plan') html+=(global.renderSportPlanPanel?global.renderSportPlanPanel():global.renderSportPlan());
    else if(global.sportTab==='log') html+=(global.renderSportLogPanel?global.renderSportLogPanel():global.renderSportLog());
    else html+=(global.renderWeightsPanel?global.renderWeightsPanel():global.renderWeights());
    return html;
  };
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('sport', global.renderSportModule);
  }
})(window);
