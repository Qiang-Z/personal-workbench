(function(global){
  function getData(){return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{});}
  function today(){return typeof global.todayStr==='function'?global.todayStr():new Date().toISOString().slice(0,10);}
  function addDays(ds,n){var d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function weekday(ds){var d=new Date(ds+'T00:00:00');return (d.getDay()+6)%7;}
  function monday(ds){return addDays(ds,-weekday(ds));}
  function weekDates(ds){var mon=monday(ds);return Array.from({length:7},function(_,i){return addDays(mon,i);});}
  function isActive(h){return h&&h.status!=='paused'&&h.status!=='archived';}
  function daysFor(h){
    if(Array.isArray(h.days)&&h.days.length)return h.days.map(Number).filter(function(x){return x>=0&&x<=6;});
    return h.freq==='weekly'?[0,1,2,3,4,5,6]:[0,1,2,3,4,5,6];
  }
  function doneOn(h,ds){return !!(h&&h.logs&&h.logs[ds]);}
  function restOn(h,ds){return !!(h&&h.skips&&h.skips[ds]);}
  function weekDone(h,ds){return weekDates(ds).filter(function(d){return d<=today()&&doneOn(h,d);}).length;}
  function weekTarget(h){return h.freq==='weekly'?Math.max(1,+h.target||1):daysFor(h).length;}
  function dueOn(h,ds){
    if(!isActive(h))return false;
    if(h.freq==='weekly')return weekDone(h,ds)<weekTarget(h);
    return daysFor(h).indexOf(weekday(ds))>=0;
  }
  function scheduleLabel(h){
    if(h.freq==='weekly')return '每周 '+weekTarget(h)+' 次';
    var days=daysFor(h);if(days.length===7)return '每天';
    var names=['周一','周二','周三','周四','周五','周六','周日'];return days.map(function(i){return names[i];}).join('、');
  }
  function dailyStreak(h){
    var ds=today(),count=0,started=false;
    for(var i=0;i<180;i++,ds=addDays(ds,-1)){
      if(!dueOn(h,ds))continue;
      if(!started&&ds===today()&&!doneOn(h,ds)&&!restOn(h,ds))continue;
      started=true;if(restOn(h,ds))continue;if(doneOn(h,ds))count++;else break;
    }
    return count;
  }
  function weeklyStreak(h){
    var mon=monday(today()),count=0;
    for(var w=0;w<26;w++){
      var start=addDays(mon,-7*w),dates=weekDates(start),done=dates.filter(function(d){return d<=today()&&doneOn(h,d);}).length;
      if(w===0&&done<weekTarget(h))continue;if(done>=weekTarget(h))count++;else break;
    }
    return count;
  }
  function consistency(h,days){
    days=days||28;var td=today();
    if(h.freq==='weekly'){
      var weeks=Math.max(1,Math.ceil(days/7)),score=0;
      for(var w=0;w<weeks;w++){var dates=weekDates(addDays(monday(td),-7*w)),done=dates.filter(function(d){return d<=td&&doneOn(h,d);}).length;score+=Math.min(1,done/weekTarget(h));}
      return Math.round(score/weeks*100);
    }
    var expected=0,done=0;
    for(var i=0;i<days;i++){var ds=addDays(td,-i);if(!dueOn(h,ds)||restOn(h,ds))continue;expected++;if(doneOn(h,ds))done++;}
    return expected?Math.round(done/expected*100):0;
  }
  function model(h){
    var td=today(),wd=weekDone(h,td),target=weekTarget(h),done=doneOn(h,td),rest=restOn(h,td),due=dueOn(h,td);
    return {habit:h,active:isActive(h),doneToday:done,restToday:rest,dueToday:due,resolvedToday:done||rest||!due,
      weekDone:wd,weekTarget:target,weekPct:Math.min(100,Math.round(wd/target*100)),schedule:scheduleLabel(h),
      streak:h.freq==='weekly'?weeklyStreak(h):dailyStreak(h),streakUnit:h.freq==='weekly'?'周':'次',consistency:consistency(h,28),
      cells:weekDates(td).map(function(ds){return {date:ds,done:doneOn(h,ds),rest:restOn(h,ds),due:h.freq==='weekly'?true:dueOn(h,ds),today:ds===td,future:ds>td};})};
  }
  function summary(){
    var all=(getData().habits||[]).map(model),active=all.filter(function(m){return m.active;}),todayList=active.filter(function(m){return m.dueToday&&!m.restToday;});
    return {all:all,active:active,paused:all.filter(function(m){return !m.active;}),today:todayList,dueToday:todayList.length,
      doneToday:todayList.filter(function(m){return m.doneToday;}).length,remaining:todayList.filter(function(m){return !m.doneToday;}).length,
      restToday:active.filter(function(m){return m.restToday;}).length};
  }
  function reviewWeeks(count){
    count=count||4;var out=[],td=today(),start=monday(td),active=(getData().habits||[]).filter(isActive);
    for(var w=count-1;w>=0;w--){var mon=addDays(start,-7*w),dates=weekDates(mon),done=0,target=0;active.forEach(function(h){done+=dates.filter(function(d){return d<=td&&doneOn(h,d);}).length;target+=h.freq==='weekly'?weekTarget(h):dates.filter(function(d){return d<=td&&dueOn(h,d)&&!restOn(h,d);}).length;});out.push({start:mon,done:done,target:target,pct:target?Math.min(100,Math.round(done/target*100)):0});}
    return out;
  }
  global.WorkbenchHabitMetrics={today:today,addDays:addDays,weekday:weekday,monday:monday,weekDates:weekDates,isActive:isActive,daysFor:daysFor,
    doneOn:doneOn,restOn:restOn,weekDone:weekDone,weekTarget:weekTarget,dueOn:dueOn,scheduleLabel:scheduleLabel,consistency:consistency,model:model,summary:summary,reviewWeeks:reviewWeeks};
})(window);
