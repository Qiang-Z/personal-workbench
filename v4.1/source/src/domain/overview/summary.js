(function(global){
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function catProgress(cat){
    var data=getData();
    var items=(data.items||[]).filter(function(i){ return i.cat===cat; });
    var todo=items.filter(function(i){ return i.status==='todo'; }).length;
    var doing=items.filter(function(i){ return i.status==='doing'; }).length;
    var done=items.filter(function(i){ return i.status==='done'; }).length;
    var total=items.length||1;
    return {items:items,count:items.length,todo:todo,doing:doing,done:done,pct:Math.round(done/total*100)};
  }
  function financeSummary(){
    var data=getData();
    var ta=typeof global.totalAssets==='function' ? global.totalAssets() : 0;
    var fv=(data.funds||[]).reduce(function(s,f){ return s + (typeof global.fundValue==='function' ? global.fundValue(f) : 0); },0);
    var cash=ta-fv;
    return {totalAssets:ta,fundValue:fv,cash:cash};
  }
  function focusItems(){
    var data=getData();
    var today=global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10);
    var focus=(data.items||[]).filter(function(i){
      var visible=!global.WorkbenchModules || global.WorkbenchModules.isCategoryVisible(i.cat);
      return visible && i.status!=='done' && i.due && (i.due===today || (global.daysBetween && global.daysBetween(today,i.due)<0));
    }).sort(function(a,b){ return a.due.localeCompare(b.due); });
    return {today:today,items:focus,lateN:focus.filter(function(i){ return i.due<today; }).length};
  }
  function activeProjects(){
    var data=getData();
    var today=global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10);
    return (data.projects||[]).filter(function(p){ return p.status!=='done'; }).map(function(p){
      var items=(data.items||[]).filter(function(i){ return i.cat==='work' && i.projectId===p.id; });
      var ms=items.filter(function(i){ return i.isMilestone; });
      var msDone=ms.filter(function(i){ return i.status==='done'; }).length;
      var done=items.filter(function(i){ return i.status==='done'; }).length;
      var tot=items.length||1;
      var tasks=items.filter(function(i){ return !i.isMilestone; }).length;
      var overdue=items.filter(function(i){ return i.status!=='done' && i.due && i.due<today; }).length;
      return {project:p,items:items,milestones:ms,msDone:msDone,done:done,pct:Math.round(done/tot*100),tasks:tasks,overdue:overdue};
    });
  }
  function upcomingItems(){
    var data=getData();
    return (data.items||[]).filter(function(i){
      return (!global.WorkbenchModules || global.WorkbenchModules.isCategoryVisible(i.cat)) && i.status!=='done' && i.due;
    }).sort(function(a,b){ return a.due.localeCompare(b.due); }).slice(0,6);
  }
  global.WorkbenchOverviewSummary = {
    catProgress: catProgress,
    financeSummary: financeSummary,
    focusItems: focusItems,
    activeProjects: activeProjects,
    upcomingItems: upcomingItems
  };
})(window);
