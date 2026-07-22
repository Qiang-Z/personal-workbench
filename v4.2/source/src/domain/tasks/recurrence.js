(function(global){
  function pad(n){ return String(n).padStart(2, '0'); }
  function parseYMD(ymd){
    var m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    return { y:+m[1], m:+m[2], d:+m[3] };
  }
  function formatYMD(y,m,d){ return y + '-' + pad(m) + '-' + pad(d); }
  function dim(y,m){ return new Date(y, m, 0).getDate(); }
  function addDaysYMD(ymd, days){
    var dt = new Date((ymd || (global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10))) + 'T00:00:00');
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0,10);
  }
  function addMonthsKeepDay(ymd, months){
    var p = parseYMD(ymd || (global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10)));
    if(!p) return addDaysYMD(global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10), 30 * months);
    var monthIndex = (p.m - 1) + months;
    var year = p.y + Math.floor(monthIndex / 12);
    var month = ((monthIndex % 12) + 12) % 12 + 1;
    if(monthIndex < 0 && ((monthIndex % 12) !== 0)) year -= 1;
    var day = Math.min(p.d, dim(year, month));
    return formatYMD(year, month, day);
  }
  function nextDueForTask(task){
    var recur = task && task.recur;
    var base = (task && task.due) || (global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10));
    if(!recur || recur === 'none') return null;
    if(recur === 'daily') return addDaysYMD(base, 1);
    if(recur === 'weekly') return addDaysYMD(base, 7);
    if(recur === 'monthly') return addMonthsKeepDay(base, 1);
    return addDaysYMD(base, 1);
  }
  function buildNextTask(task){
    var nextDue = nextDueForTask(task);
    if(!nextDue) return null;
    if(!task.seriesId) task.seriesId = task.id || (global.uid ? global.uid() : String(Date.now()));
    var next = Object.assign({}, task, {
      id: global.uid ? global.uid() : (String(Date.now()) + Math.random().toString(36).slice(2,5)),
      due: nextDue,
      status: 'todo',
      completedAt: null,
      created: global.todayStr ? global.todayStr() : new Date().toISOString().slice(0,10),
      seriesId: task.seriesId,
      sourceTaskId: task.id || task.sourceTaskId || null
    });
    return next;
  }
  function hasDuplicateFutureTask(task, nextDue){
    var items = (global.data && global.data.items) || [];
    var sid = task.seriesId || task.id;
    return items.some(function(x){
      return x && x.id !== task.id && (x.seriesId || x.id) === sid && x.due === nextDue && x.status !== 'done';
    });
  }
  global.WorkbenchRecurrence = {
    nextDueForTask: nextDueForTask,
    buildNextTask: buildNextTask
  };
  global.genRecur = function(task){
    if(!task || !task.recur || task.recur === 'none') return;
    var nextDue = nextDueForTask(task);
    if(!nextDue) return;
    if(hasDuplicateFutureTask(task, nextDue)) return;
    var next = buildNextTask(task);
    if(next && global.data && Array.isArray(global.data.items)) global.data.items.push(next);
  };
})(window);
