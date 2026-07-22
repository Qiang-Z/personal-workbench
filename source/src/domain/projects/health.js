(function(global){
  function summarizeProject(project){
    var data = (global.WorkbenchData && global.WorkbenchData.getData()) || global.data || { items: [] };
    var today = global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10);
    var items = (data.items || []).filter(function(i){ return i.cat === 'work' && i.projectId === project.id; });
    var milestones = items.filter(function(i){ return !!i.isMilestone; });
    var msDone = milestones.filter(function(i){ return i.status === 'done'; }).length;
    var done = items.filter(function(i){ return i.status === 'done'; }).length;
    var total = items.length || 1;
    var pct = Math.round(done / total * 100);
    var tasks = items.filter(function(i){ return !i.isMilestone; }).length;
    var overdue = items.filter(function(i){ return i.status !== 'done' && i.due && i.due < today; }).length;
    var riskMs = items.filter(function(i){ return i.isMilestone && i.status !== 'done' && i.due && global.daysBetween && global.daysBetween(today, i.due) <= 7 && global.daysBetween(today, i.due) >= 0; }).length;
    var estSum = items.reduce(function(s, i){ return s + (+i.estH || 0); }, 0);
    var actSum = items.reduce(function(s, i){ return s + (+i.actH || 0); }, 0);
    var acc = (estSum && actSum) ? (actSum / estSum * 100) : null;
    var health = (project.status === 'done') ? 'green' : (overdue >= 3 || riskMs > 0 ? 'red' : overdue > 0 ? 'amber' : 'green');
    var healthMap = { green:['#10b981','健康'], amber:['#f59e0b','注意'], red:['#ef4444','风险'] };
    return {
      project: project,
      items: items,
      milestones: milestones,
      milestoneDone: msDone,
      done: done,
      total: total,
      pct: pct,
      tasks: tasks,
      overdue: overdue,
      riskMs: riskMs,
      actHours: actSum,
      estHours: estSum,
      accuracy: acc,
      health: health,
      healthMeta: healthMap[health],
      sortedItems: items.slice().sort(function(a,b){ return (a.status==='done') - (b.status==='done'); })
    };
  }
  global.WorkbenchProjectHealth = { summarizeProject: summarizeProject };
})(window);
