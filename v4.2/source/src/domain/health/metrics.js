(function(global){
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function dateAdd(ds, amount){
    if(typeof global.slotDate === 'function') return global.slotDate(ds, amount);
    var d=new Date(ds+'T00:00:00');
    d.setDate(d.getDate()+amount);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function weekRange(){
    var today=typeof global.todayStr === 'function' ? global.todayStr() : new Date().toISOString().slice(0,10);
    var mon=typeof global.mondayOf === 'function' ? global.mondayOf(today) : today;
    var sun=dateAdd(mon,6);
    return { today:today, mon:mon, sun:sun };
  }
  function healthGoals(){
    var data=getData();
    if(!data.prefs || typeof data.prefs!=='object') data.prefs={};
    var raw=data.prefs.healthGoals||{};
    var minutes=Math.max(0,Math.round(+raw.weeklyMinutes||150));
    var sessions=Math.max(0,Math.round(+raw.weeklySessions||3));
    return { weeklyMinutes:minutes, weeklySessions:sessions };
  }
  function planForDate(ds){
    if(!ds) return null;
    var key=typeof global.mondayOf==='function' ? global.mondayOf(ds) : ds;
    var dayIdx=(new Date(ds+'T00:00:00').getDay()+6)%7;
    var slots=typeof global.weekPlanSlots==='function' ? global.weekPlanSlots(key) : (((getData().weekPlans||{})[key])||[]);
    var plan=(slots||[])[dayIdx]||null;
    return plan ? { key:key, dayIdx:dayIdx, date:ds, plan:plan } : null;
  }
  function completedForDate(ds, plan){
    return (getData().items||[]).filter(function(i){
      if(i.cat!=='sport'||i.status!=='done'||i.due!==ds) return false;
      return !plan || !plan.type || i.sportType===plan.type || (i.planKey&&i.planDay!=null);
    });
  }
  function sportSummary(){
    var data=getData(), range=weekRange(), goals=healthGoals();
    var logs=(data.items||[]).filter(function(i){ return i.cat==='sport'; });
    var doneLogs=logs.filter(function(i){ return i.status==='done'; });
    var weekLogs=doneLogs.filter(function(i){ return i.due && i.due>=range.mon && i.due<=range.today; });
    var completed=weekLogs.reduce(function(s,i){ return s + (+i.minutes||0); },0);
    var totalLogged=doneLogs.reduce(function(s,i){ return s + (+i.minutes||0); },0);
    var planned=0, plannedSessions=0;
    var weekSlots=typeof global.weekPlanSlots === 'function' ? global.weekPlanSlots(range.mon) : (((data.weekPlans||{})[range.mon])||[]);
    (weekSlots||[]).forEach(function(s){
      if(s&&!s.skipped){ planned += (+s.minutes||0); plannedSessions += 1; }
    });
    var todayPlan=planForDate(range.today);
    var todayDone=todayPlan ? completedForDate(range.today,todayPlan.plan).length>0 : completedForDate(range.today).length>0;
    var recent=doneLogs.slice().sort(function(a,b){ return String(b.due||b.created||'').localeCompare(String(a.due||a.created||'')); })[0]||null;
    var minutePct=goals.weeklyMinutes>0?Math.min(100,Math.round(completed/goals.weeklyMinutes*100)):0;
    var sessionPct=goals.weeklySessions>0?Math.min(100,Math.round(weekLogs.length/goals.weeklySessions*100)):0;
    return {
      totalLogs:doneLogs.length,
      weekDoneMinutes:completed,
      weekDoneSessions:weekLogs.length,
      weekPlannedMinutes:planned,
      weekPlannedSessions:plannedSessions,
      totalLoggedMinutes:totalLogged,
      minuteProgress:minutePct,
      sessionProgress:sessionPct,
      remainingMinutes:Math.max(0,goals.weeklyMinutes-completed),
      remainingSessions:Math.max(0,goals.weeklySessions-weekLogs.length),
      todayPlan:todayPlan,
      todayDone:todayDone,
      recentLog:recent,
      goals:goals,
      range:range
    };
  }
  function weightSummary(){
    var ws=(getData().weights||[]).slice().sort(function(a,b){ return String(a.date||'').localeCompare(String(b.date||'')); });
    var latest=ws.length ? ws[ws.length-1] : null;
    var first=ws.length ? ws[0] : null;
    var latestWeight=latest && latest.weight!=null ? +latest.weight : null;
    var firstWeight=first && first.weight!=null ? +first.weight : null;
    var today=typeof global.todayStr==='function'?global.todayStr():new Date().toISOString().slice(0,10);
    var from7=dateAdd(today,-6), from30=dateAdd(today,-29);
    var recent7=ws.filter(function(w){ return w.date>=from7&&w.date<=today&&w.weight!=null; });
    var recent30=ws.filter(function(w){ return w.date>=from30&&w.date<=today&&w.weight!=null; });
    var avg7=recent7.length?recent7.reduce(function(sum,w){ return sum+(+w.weight||0); },0)/recent7.length:null;
    var change30=recent30.length>=2?+(+recent30[recent30.length-1].weight-(+recent30[0].weight)).toFixed(1):null;
    return {
      count: ws.length,
      latest: latest,
      latestWeight: latestWeight,
      diff: latestWeight!=null && firstWeight!=null ? +(latestWeight-firstWeight).toFixed(1) : null,
      avg7: avg7==null?null:+avg7.toFixed(1),
      change30: change30,
      latestBodyFat:latest&&latest.bodyFat!=null?+latest.bodyFat:null,
      latestWaist:latest&&latest.waist!=null?+latest.waist:null,
      target: getData().targetWeight || null
    };
  }
  function habitSummary(){
    var data=getData(), today=typeof global.todayStr === 'function' ? global.todayStr() : new Date().toISOString().slice(0,10);
    var habits=(data.habits||[]);
    var doneToday=0, totalWeek=0;
    var mon=typeof global.mondayOf === 'function' ? global.mondayOf(today) : today;
    habits.forEach(function(h){
      var logs=h.logs||{};
      if(logs[today]) doneToday += 1;
      Object.keys(logs).forEach(function(k){ if(k>=mon && k<=today) totalWeek += 1; });
    });
    return { total:habits.length, doneToday:doneToday, totalWeek:totalWeek };
  }
  global.WorkbenchHealthMetrics = {
    weekRange: weekRange,
    healthGoals: healthGoals,
    planForDate: planForDate,
    completedForDate: completedForDate,
    sportSummary: sportSummary,
    weightSummary: weightSummary,
    habitSummary: habitSummary
  };
})(window);
