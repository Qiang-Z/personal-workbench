(function(global){
  function data(){return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{});}
  function metrics(){return global.WorkbenchHabitMetrics;}
  function esc(v){return global.esc?global.esc(v):String(v==null?'':v);}
  function tabs(){var items=[['today','☀️ 今天'],['all','🌱 全部习惯'],['review','📊 温和回顾']];return '<div class="chips habit-tabs">'+items.map(function(x){return '<span class="ctab '+(global.habitTab===x[0]?'on':'')+'" onclick="setHabitTab(\''+x[0]+'\')">'+x[1]+'</span>';}).join('')+'</div>';}
  function weekCells(m){var names=['一','二','三','四','五','六','日'];return '<div class="habit-week">'+m.cells.map(function(c,i){var cls=(c.done?'done ':c.rest?'rest ':c.due?'due ':'')+(c.today?'today ':'')+(c.future?'future':'');var disabled=c.future||!c.due;return '<button class="habit-day '+cls+'" '+(disabled?'disabled':'onclick="toggleHabit(\''+m.habit.id+'\',\''+c.date+'\')"')+' title="'+c.date+'"><span>'+names[i]+'</span><i>'+(c.done?'✓':c.rest?'休':'')+'</i></button>';}).join('')+'</div>';}
  function habitCard(m,manage){
    var h=m.habit,state=m.doneToday?'done':m.restToday?'rest':'open';
    return '<article class="habit-action-card '+state+'"><div class="habit-card-top"><div><span>'+esc(m.schedule)+'</span><h2>'+esc(h.name||'未命名习惯')+'</h2>'+(h.minimum?'<p>最小行动：'+esc(h.minimum)+'</p>':'')+'</div><div class="habit-card-score"><b>'+m.consistency+'%</b><small>近 4 周</small></div></div>'
      +(h.cue?'<div class="habit-cue"><span>提醒自己</span><b>'+esc(h.cue)+'</b></div>':'')+weekCells(m)
      +'<div class="habit-card-meta"><span>本周 '+m.weekDone+' / '+m.weekTarget+'</span><span>连续 '+m.streak+' '+m.streakUnit+'</span>'+(h.why?'<span>'+esc(h.why)+'</span>':'')+'</div>'
      +'<div class="habit-card-actions">'+(m.doneToday?'<button class="btn success" onclick="checkHabitToday(\''+h.id+'\')">✓ 今天完成了</button>':m.restToday?'<button class="btn" onclick="restHabitToday(\''+h.id+'\')">今天已休息</button>':'<button class="btn primary" onclick="checkHabitToday(\''+h.id+'\')">完成最小一步</button>')
      +(m.dueToday&&!m.doneToday?'<button class="btn quiet" onclick="restHabitToday(\''+h.id+'\')">今天休息</button>':'')
      +(manage?'<button class="icon-btn" onclick="openHabitForm(\''+h.id+'\')" title="编辑">✏️</button><button class="icon-btn" onclick="pauseHabit(\''+h.id+'\')" title="暂停">⏸</button><button class="icon-btn" onclick="delHabit(\''+h.id+'\')" title="删除">🗑️</button>':'')+'</div></article>';
  }
  function emptyToday(){return '<section class="panel habit-empty"><span>🌿</span><h2>今天没有待完成的习惯</h2><p>可以安心休息，也可以添加一个真正想保持的小行动。</p><button class="btn primary" onclick="openHabitForm()">添加第一个习惯</button></section>';}
  function renderToday(){
    var s=metrics().summary(),pct=s.dueToday?Math.round(s.doneToday/s.dueToday*100):100;
    return '<section class="habit-hero"><div><span>今日习惯助手</span><h1>'+(s.remaining?'今天只做最小的一步':'今天已经安排好了')+'</h1><p>'+(s.remaining?'不追求完美，完成最容易开始的那一步就够了。':'没有未完成压力，保持自己的节奏。')+'</p></div><div class="habit-today-ring" style="--habit-pct:'+pct+'%"><b>'+s.doneToday+' / '+s.dueToday+'</b><small>今日完成</small></div></section>'
      +'<div class="habit-summary-grid"><div><span>今天待做</span><b>'+s.dueToday+'</b><small>只显示今天适合做的习惯</small></div><div><span>已经完成</span><b>'+s.doneToday+'</b><small>完成最小行动也算</small></div><div><span>今天休息</span><b>'+s.restToday+'</b><small>休息不会被当成失败</small></div><div><span>正在保持</span><b>'+s.active.length+'</b><small>暂停的习惯不参与提醒</small></div></div>'
      +(s.today.length?'<div class="habit-action-list">'+s.today.map(function(m){return habitCard(m,false);}).join('')+'</div>':emptyToday())
      +(s.today.length&&s.remaining===0?'<div class="habit-gentle-success">✨ 今天的习惯已经完成。去做别的事吧，不需要继续刷数据。</div>':'');
  }
  function renderAll(){
    var s=metrics().summary();
    return '<section class="habit-section-head"><div><span>全部习惯</span><h1>留下真正值得保持的习惯</h1><p>习惯太多会变成新的待办清单。暂停不是放弃，只是暂时不提醒。</p></div><button class="btn primary" onclick="openHabitForm()">＋ 新建习惯</button></section>'
      +(s.active.length?'<div class="habit-action-list">'+s.active.map(function(m){return habitCard(m,true);}).join('')+'</div>':'<div class="panel empty">还没有正在保持的习惯。</div>')
      +(s.paused.length?'<details class="panel habit-paused"><summary>已暂停（'+s.paused.length+'）</summary><div class="habit-paused-list">'+s.paused.map(function(m){var h=m.habit;return '<div class="habit-paused-row"><div><b>'+esc(h.name)+'</b><small>'+esc(m.schedule)+'</small></div><button class="btn small primary" onclick="resumeHabit(\''+h.id+'\')">恢复</button><button class="icon-btn" onclick="openHabitForm(\''+h.id+'\')">✏️</button><button class="icon-btn" onclick="delHabit(\''+h.id+'\')">🗑️</button></div>';}).join('')+'</div></details>':'');
  }
  function renderReview(){
    var s=metrics().summary(),weeks=metrics().reviewWeeks(4),best=s.active.slice().sort(function(a,b){return b.consistency-a.consistency;})[0];
    return '<section class="habit-section-head"><div><span>温和回顾</span><h1>看趋势，不责怪某一天</h1><p>回顾用来调整目标是否合适，而不是追求永远不断的连续天数。</p></div></section>'
      +'<div class="habit-review-grid"><section class="panel"><div class="habit-panel-head"><div><span>最近四周</span><h2>完成节奏</h2></div></div><div class="habit-week-bars">'+weeks.map(function(w){return '<div><span>'+w.start.slice(5)+'</span><div><i style="width:'+w.pct+'%"></i></div><b>'+w.done+' / '+w.target+'</b></div>';}).join('')+'</div></section>'
      +'<section class="panel"><div class="habit-panel-head"><div><span>一个观察</span><h2>'+(best?'最稳定的是「'+esc(best.habit.name)+'」':'先从一个小习惯开始')+'</h2></div></div><p class="habit-review-note">'+(best?'近四周完成度 '+best.consistency+'%。如果某个习惯长期很难开始，可以把“最小行动”再缩小一点。':'不需要一次建立很多习惯。选择一个每天容易开始的动作即可。')+'</p></section></div>'
      +(s.active.length?'<section class="panel habit-review-list"><div class="habit-panel-head"><div><span>逐项查看</span><h2>习惯状态</h2></div></div>'+s.active.map(function(m){return '<div class="habit-review-row"><div><b>'+esc(m.habit.name)+'</b><small>'+esc(m.schedule)+' · 本周 '+m.weekDone+'/'+m.weekTarget+'</small></div><div class="habit-review-track"><i style="width:'+m.consistency+'%"></i></div><b>'+m.consistency+'%</b><button class="btn small" onclick="openHabitForm(\''+m.habit.id+'\')">调整</button></div>';}).join('')+'</section>':'');
  }
  global.setHabitTab=function(tab){global.habitTab=tab;global.render();};
  global.checkHabitToday=function(id){var h=(data().habits||[]).find(function(x){return x.id===id;});if(!h)return;if(!h.logs)h.logs={};if(!h.skips)h.skips={};var td=metrics().today();delete h.skips[td];if(h.logs[td])delete h.logs[td];else h.logs[td]=true;global.save();global.render();};
  global.restHabitToday=function(id){var h=(data().habits||[]).find(function(x){return x.id===id;});if(!h)return;if(!h.logs)h.logs={};if(!h.skips)h.skips={};var td=metrics().today();delete h.logs[td];if(h.skips[td])delete h.skips[td];else h.skips[td]=true;global.save();global.render();};
  global.pauseHabit=function(id){var h=(data().habits||[]).find(function(x){return x.id===id;});if(!h)return;h.status='paused';global.save();global.render();};
  global.resumeHabit=function(id){var h=(data().habits||[]).find(function(x){return x.id===id;});if(!h)return;h.status='active';global.save();global.render();};
  global.renderHabits=function(){if(!global.habitTab)global.habitTab='today';var body=global.habitTab==='all'?renderAll():(global.habitTab==='review'?renderReview():renderToday());return tabs()+body;};
  if(global.WorkbenchModuleRegistry&&typeof global.WorkbenchModuleRegistry.register==='function')global.WorkbenchModuleRegistry.register('habit',global.renderHabits);
})(window);
