(function(global){
  function data(){return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{});}
  function metrics(){return global.WorkbenchLifeSummary;}
  function esc(v){return global.esc?global.esc(v):String(v==null?'':v);}
  function money(v){return (+v||0).toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2});}
  function renderTabs(){
    var tabs=[['overview','☀️ 生活首页'],['tasks','📋 生活事项'],['travel','🧳 出行'],['books','📚 阅读'],['dates','🎉 重要日子']];
    return '<div class="chips life-tabs">'+tabs.map(function(t){return '<span class="ctab '+(global.lifeTab===t[0]?'on':'')+'" onclick="setLifeTab(\''+t[0]+'\')">'+t[1]+'</span>';}).join('')+'</div>';
  }
  function summaryCard(label,value,note,cls){return '<div class="life-summary-card '+(cls||'')+'"><span>'+label+'</span><b>'+value+'</b><small>'+note+'</small></div>';}
  function taskList(items,limit){var list=limit?items.slice(0,limit):items;return list.length?'<div class="list">'+list.map(global.itemHTML).join('')+'</div>':'<div class="empty">目前没有需要处理的事项。</div>';}
  function renderNextTravel(t){
    if(!t)return '<div class="life-empty-action"><span>🧳</span><b>还没有下一段出行</b><p>有安排时再添加，不需要提前维护空计划。</p><button class="btn small" onclick="openTravelForm()">添加出行</button></div>';
    var st=metrics().travelStatus(t),cp=metrics().travelChecklistProgress(t),days=t.start?metrics().dayDiff(metrics().today(),t.start):null;
    return '<div class="life-focus-card"><div class="life-focus-head"><div><span>'+(st==='ongoing'?'正在出行':(days!=null?'距离出发 '+days+' 天':'日期待定'))+'</span><h3>'+esc(t.title||'未命名出行')+'</h3></div><button class="btn small" onclick="setLifeTab(\'travel\')">查看准备</button></div>'
      +(t.nextAction?'<div class="life-next-action"><span>下一步</span><b>'+esc(t.nextAction)+'</b></div>':'')
      +'<div class="life-progress-head"><span>准备清单</span><b>'+cp.done+' / '+cp.total+'</b></div><div class="life-progress"><i style="width:'+cp.pct+'%"></i></div></div>';
  }
  function renderCurrentBook(b){
    if(!b)return '<div class="life-empty-action"><span>📚</span><b>当前没有在读书籍</b><p>只保留真正想读的书，不必追求书单数量。</p><button class="btn small" onclick="openBookForm()">添加书籍</button></div>';
    var p=Math.max(0,Math.min(100,+b.progress||0));
    return '<div class="life-focus-card"><div class="life-focus-head"><div><span>当前在读</span><h3>'+esc(b.title)+'</h3><small>'+esc(b.author||'作者未填写')+'</small></div><button class="btn small" onclick="setLifeTab(\'books\')">继续阅读</button></div>'
      +(b.nextAction?'<div class="life-next-action"><span>下一步</span><b>'+esc(b.nextAction)+'</b>'+(b.nextDue?'<small>'+esc(b.nextDue)+'</small>':'')+'</div>':'')
      +'<div class="life-progress-head"><span>阅读进度</span><b>'+p+'%</b></div><div class="life-progress book"><i style="width:'+p+'%"></i></div></div>';
  }
  function renderImportantDates(limit){
    var list=metrics().importantDates().slice(0,limit||99);
    if(!list.length)return '<div class="life-empty-action compact"><span>🎉</span><b>还没有重要日子</b><button class="btn small" onclick="openAnniversaryForm()">添加</button></div>';
    return '<div class="life-date-list">'+list.map(function(x){var a=x.item,d=x.next.days;return '<div class="life-date-row"><div class="life-date-count '+(d<=7?'soon':'')+'"><b>'+d+'</b><small>天</small></div><div><b>'+esc(a.name)+'</b><small>'+esc(x.next.date)+(a.note?' · '+esc(a.note):'')+'</small></div><button class="btn small" onclick="createAnniversaryPrep(\''+a.id+'\')">准备</button></div>';}).join('')+'</div>';
  }
  function renderOverview(){
    var m=metrics().homeModel(),nextTrip=m.travels.next,nextDate=m.dates.next&&m.dates.next.item,nextBook=m.books.next;
    return '<section class="life-hero"><div><span>生活行动助手</span><h1>把接下来的生活安排好</h1><p>只关注近期需要处理的事项，历史记录和长期清单留在需要时再看。</p></div><div><button class="btn" onclick="openForm(\'life\')">＋ 生活事项</button><button class="btn primary" onclick="openTravelForm()">＋ 出行计划</button></div></section>'
      +'<div class="life-summary-grid">'+summaryCard('今天需要处理',m.tasks.today.length,'含已到期生活事项',m.tasks.today.length?'urgent':'')
      +summaryCard('未来 7 天',m.tasks.upcoming.length,'即将到来的生活安排')
      +summaryCard('下一段出行',nextTrip?esc(nextTrip.title):'暂无',nextTrip&&nextTrip.start?nextTrip.start:'按需要添加')
      +summaryCard('最近重要日子',nextDate?esc(nextDate.name):'暂无',m.dates.next?m.dates.next.next.days+' 天后':'按需要添加')+'</div>'
      +'<div class="life-home-grid"><div class="life-home-main"><section class="panel"><div class="life-panel-head"><div><span>今天与已到期</span><h2>先处理这些生活事项</h2></div><button class="text-action life-link" onclick="setLifeTab(\'tasks\')">全部事项 →</button></div>'+taskList(m.tasks.today,5)+'</section>'
      +'<section class="panel"><div class="life-panel-head"><div><span>下一段安排</span><h2>出行准备</h2></div></div>'+renderNextTravel(nextTrip)+'</section></div>'
      +'<div class="life-home-side"><section class="panel"><div class="life-panel-head"><div><span>提前准备</span><h2>近期重要日子</h2></div><button class="text-action life-link" onclick="setLifeTab(\'dates\')">全部 →</button></div>'+renderImportantDates(3)+'</section>'
      +'<section class="panel"><div class="life-panel-head"><div><span>保持一个阅读焦点</span><h2>当前阅读</h2></div></div>'+renderCurrentBook(nextBook)+'</section></div></div>';
  }
  function group(title,note,items,open){
    return '<section class="panel life-task-group '+(!open?'collapsed':'')+'"><div class="life-panel-head"><div><span>'+note+'</span><h2>'+title+' <small>'+items.length+'</small></h2></div></div>'+(items.length?taskList(items):'<div class="empty">这里暂时没有事项。</div>')+'</section>';
  }
  function renderTasks(){
    var g=metrics().taskGroups();
    return '<section class="life-section-head"><div><span>生活事项</span><h1>只看真正需要处理的事情</h1><p>日期浏览统一放在全局日历，这里按照行动时间分组。</p></div><button class="btn primary" onclick="openForm(\'life\')">＋ 添加事项</button></section>'
      +'<div class="life-task-layout"><div>'+group('今天与已到期','优先处理',g.today,true)+group('接下来 7 天','近期安排',g.upcoming,true)+'</div><div>'+group('暂无日期','以后再安排',g.unscheduled,true)+group('更晚事项','7 天以后',g.later,true)+'<details class="panel life-completed"><summary>已完成（'+g.completed.length+'）</summary>'+(g.completed.length?taskList(g.completed.slice(0,30)):'<div class="empty">还没有完成记录。</div>')+'</details></div></div>';
  }
  function travelCard(t){
    var st=metrics().travelStatus(t),labels={planning:'计划中',upcoming:'未出发',ongoing:'进行中',past:'已结束'},cp=metrics().travelChecklistProgress(t),spent=metrics().travelSpent(t),budget=+t.budget||0;
    var checks=cp.items.length?'<div class="life-checklist">'+cp.items.map(function(c,i){return '<button class="life-check '+(c.done?'done':'')+'" onclick="toggleTravelCheck(\''+t.id+'\','+i+')"><i>'+(c.done?'✓':'')+'</i><span>'+esc(c.text)+'</span></button>';}).join('')+'</div>':'<div class="life-muted">还没有准备清单。</div>';
    return '<article class="life-travel-card '+st+'"><div class="life-travel-top"><div><span class="life-status '+st+'">'+labels[st]+'</span><h2>'+esc(t.title||'未命名出行')+'</h2><small>'+(t.start||'日期待定')+(t.end?' → '+t.end:'')+'</small></div><div class="acts"><button class="icon-btn" onclick="openTravelForm(\''+t.id+'\')">✏️</button><button class="icon-btn" onclick="delTravel(\''+t.id+'\')">🗑️</button></div></div>'
      +(t.nextAction?'<div class="life-next-action"><span>下一步</span><b>'+esc(t.nextAction)+'</b></div>':'')
      +'<div class="life-travel-stats"><span>准备 <b>'+cp.pct+'%</b></span><span>预算 <b>¥'+money(budget)+'</b></span><span>已记录支出 <b>¥'+money(spent)+'</b></span></div><div class="life-progress"><i style="width:'+cp.pct+'%"></i></div>'+checks
      +'<div class="life-travel-actions"><button class="btn small primary" onclick="openTravelExpense(\''+t.id+'\')">＋ 记录出行支出</button>'+(t.note?'<span>'+esc(t.note)+'</span>':'')+'</div></article>';
  }
  function renderTravel(){
    var list=(data().travels||[]).slice().sort(function(a,b){var sa=metrics().travelStatus(a)==='past'?1:0,sb=metrics().travelStatus(b)==='past'?1:0;return sa-sb||String(a.start||'9999').localeCompare(String(b.start||'9999'));});
    var active=list.filter(function(t){return metrics().travelStatus(t)!=='past';}),past=list.filter(function(t){return metrics().travelStatus(t)==='past';});
    return '<section class="life-section-head"><div><span>出行准备助手</span><h1>从计划到出发，一项项准备</h1><p>清单可以直接勾选，关联的财务支出会自动汇总。</p></div><button class="btn primary" onclick="openTravelForm()">＋ 添加出行</button></section>'
      +(active.length?'<div class="life-travel-list">'+active.map(travelCard).join('')+'</div>':'<div class="panel empty">还没有待准备的出行。</div>')
      +(past.length?'<details class="panel life-archive"><summary>已结束的出行（'+past.length+'）</summary><div class="life-travel-list">'+past.map(travelCard).join('')+'</div></details>':'');
  }
  function bookCard(b){
    var st=metrics().normalizeBookStatus(b.status),p=Math.max(0,Math.min(100,+b.progress||0));
    return '<article class="life-book-card"><div class="life-book-main"><div><span class="life-status '+st+'">'+(st==='reading'?'在读':st==='done'?'已读':'想读')+'</span><h2>'+esc(b.title||'未命名')+'</h2><small>'+esc(b.author||'作者未填写')+'</small></div><div class="acts"><button class="icon-btn" onclick="openBookForm(\''+b.id+'\')">✏️</button><button class="icon-btn" onclick="delBook(\''+b.id+'\')">🗑️</button></div></div>'
      +(b.nextAction?'<div class="life-next-action"><span>下一步</span><b>'+esc(b.nextAction)+'</b>'+(b.nextDue?'<small>'+esc(b.nextDue)+'</small>':'')+'</div>':'')
      +'<div class="life-progress-head"><span>进度</span><b>'+p+'%</b></div><div class="life-progress book"><i style="width:'+p+'%"></i></div>'
      +(b.note?'<p class="life-book-note">“'+esc(b.note)+'”</p>':'')+'<div class="life-book-actions">'+(st==='want'?'<button class="btn small primary" onclick="startBook(\''+b.id+'\')">开始阅读</button>':st==='reading'?'<button class="btn small primary" onclick="advanceBook(\''+b.id+'\',10)">进度 ＋10%</button><button class="btn small" onclick="finishBook(\''+b.id+'\')">标记读完</button>':'<span>完成于 '+esc(b.endDate||'未记录')+'</span>')+'</div></article>';
  }
  function renderBooks(){
    var all=data().books||[],status=global.bookStatus||'reading',list=status==='all'?all:all.filter(function(b){return metrics().normalizeBookStatus(b.status)===status;});
    return '<section class="life-section-head"><div><span>阅读行动</span><h1>保持一个清晰的阅读焦点</h1><p>进度不必精确，记住下一步和一句话收获更重要。</p></div><button class="btn primary" onclick="openBookForm()">＋ 添加书籍</button></section>'
      +'<div class="chips life-subtabs"><span class="ctab '+(status==='reading'?'on':'')+'" onclick="setBookStatus(\'reading\')">在读</span><span class="ctab '+(status==='want'?'on':'')+'" onclick="setBookStatus(\'want\')">想读</span><span class="ctab '+(status==='done'?'on':'')+'" onclick="setBookStatus(\'done\')">已读</span><span class="ctab '+(status==='all'?'on':'')+'" onclick="setBookStatus(\'all\')">全部</span></div>'
      +(list.length?'<div class="life-book-grid">'+list.map(bookCard).join('')+'</div>':'<div class="panel empty">这个分类下还没有书籍。</div>');
  }
  function renderDates(){
    var list=metrics().importantDates();
    return '<section class="life-section-head"><div><span>重要日子</span><h1>提前记得，也提前准备</h1><p>生日、纪念日和重要日期都可以设置准备时间，并生成生活事项。</p></div><button class="btn primary" onclick="openAnniversaryForm()">＋ 添加重要日子</button></section>'
      +(list.length?'<div class="life-important-grid">'+list.map(function(x){var a=x.item,d=x.next.days,remind=+a.remindDays||7;return '<article class="life-important-card '+(d<=remind?'soon':'')+'"><div class="life-important-date"><b>'+d+'</b><small>天后</small></div><div class="life-important-body"><span>'+(a.type==='birthday'?'🎂 生日':a.type==='anniversary'?'💝 纪念日':'📌 重要日期')+'</span><h2>'+esc(a.name)+'</h2><p>'+esc(x.next.date)+' · 提前 '+remind+' 天准备</p>'+(a.note?'<small>'+esc(a.note)+'</small>':'')+'</div><div class="life-important-actions"><button class="btn small primary" onclick="createAnniversaryPrep(\''+a.id+'\')">创建准备事项</button><button class="icon-btn" onclick="openAnniversaryForm(\''+a.id+'\')">✏️</button><button class="icon-btn" onclick="delAnniversary(\''+a.id+'\')">🗑️</button></div></article>';}).join('')+'</div>':'<div class="panel empty">还没有重要日子。</div>');
  }
  global.toggleTravelCheck=function(id,index){var t=(data().travels||[]).find(function(x){return x.id===id;});if(!t)return;t.checklist=metrics().checklistItems(t);if(!t.checklist[index])return;t.checklist[index].done=!t.checklist[index].done;global.save();global.render();};
  global.openTravelExpense=function(id){global.openFinanceForm(null,null,'expense');var el=document.getElementById('fn_travel');if(el)el.value=id;};
  global.startBook=function(id){var b=(data().books||[]).find(function(x){return x.id===id;});if(!b)return;b.status='reading';if(!b.startDate)b.startDate=metrics().today();global.save();global.render();};
  global.advanceBook=function(id,amount){var b=(data().books||[]).find(function(x){return x.id===id;});if(!b)return;b.status='reading';if(!b.startDate)b.startDate=metrics().today();b.progress=Math.min(100,(+b.progress||0)+amount);if(b.progress>=100){b.status='done';b.endDate=metrics().today();}global.save();global.render();};
  global.finishBook=function(id){var b=(data().books||[]).find(function(x){return x.id===id;});if(!b)return;b.status='done';b.progress=100;b.endDate=b.endDate||metrics().today();global.save();global.render();};
  global.createAnniversaryPrep=function(id){
    var d=data(),a=(d.anniversaries||[]).find(function(x){return x.id===id;});if(!a)return;var next=metrics().nextImportantDate(a);if(!next)return alert('请先填写有效日期');
    var existing=(d.items||[]).find(function(i){return i.id===a.prepTaskId&&i.status!=='done';});if(existing){global.setLifeTab('tasks');return;}
    var remind=+a.remindDays||7,due=metrics().addDays(next.date,-remind);if(due<metrics().today())due=metrics().today();var task={id:global.uid(),cat:'life',title:'为「'+a.name+'」做准备',status:'todo',due:due,note:a.note||'',sourceAnniversaryId:a.id};
    d.items.push(task);a.prepTaskId=task.id;global.save();global.setLifeTab('tasks');
  };
  global.renderLifeModule=function(){
    if(global.lifeTab==='anniversary')global.lifeTab='dates';
    if(['overview','tasks','travel','books','dates'].indexOf(global.lifeTab)<0)global.lifeTab='overview';
    var body=global.lifeTab==='tasks'?renderTasks():(global.lifeTab==='travel'?renderTravel():(global.lifeTab==='books'?renderBooks():(global.lifeTab==='dates'?renderDates():renderOverview())));
    return renderTabs()+body;
  };
  if(global.WorkbenchModuleRegistry&&typeof global.WorkbenchModuleRegistry.register==='function')global.WorkbenchModuleRegistry.register('life',global.renderLifeModule);
})(window);
