(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  function kit(){ return global.WorkbenchPanelKit || {}; }
  function selectors(){ return global.WorkbenchSelectors || {}; }
  function model(){ return selectors().workModuleModel ? selectors().workModuleModel() : { state:{}, projects:[], tmpItems:[], agendaItems:[], filteredItems:[], workView:global.workView||'list', collapseState:global.collapseState||{} }; }
  function countByStatus(items, done){
    return (items||[]).filter(function(item){ return done ? item.status==='done' : item.status!=='done'; }).length;
  }
  function projectCollapseKey(project){
    var value=String((project&&project.id)||'project');
    var hash=0;
    for(var i=0;i<value.length;i++) hash=((hash<<5)-hash+value.charCodeAt(i))|0;
    return 'work_project_'+Math.abs(hash);
  }
  function renderTaskSnippet(item){
    return '<div class="ptask"><input type="checkbox" class="chk" ' + (item.status==='done'?'checked':'') + ' onchange="toggle(\'' + item.id + '\')">'
      + '<span class="ptitle ' + (item.status==='done'?'done':'') + '" onclick="openForm(\'work\',\'' + item.id + '\')">' + esc(item.title) + '</span>'
      + (item.isMilestone?'<span class="star" title="里程碑">★</span>':'')
      + '</div>';
  }
  function renderProjectMeta(summary){
    var p=[];
    var badge = global.WorkbenchPanelKit && global.WorkbenchPanelKit.badge;
    if(badge){
      p.push(badge('里程碑 '+summary.milestoneDone+'/'+summary.milestones.length,'#10b98122','var(--work)'));
      p.push(badge('任务 '+summary.tasks,'#10b98122','var(--work)'));
      if(summary.overdue) p.push(badge('逾期 '+summary.overdue,'#ef444422','#ef4444'));
      if(summary.riskMs) p.push(badge('风险里程碑 '+summary.riskMs,'#f59e0b22','#b45309'));
      if(summary.accuracy !== null) p.push(badge('估算准确率 '+summary.accuracy.toFixed(0)+'%','#6366f122','#6366f1'));
      return p.join('');
    }
    return '里程碑 '+summary.milestoneDone+'/'+summary.milestones.length+' · 任务 '+summary.tasks
      + (summary.overdue ? ' · 逾期 ' + summary.overdue : '')
      + (summary.riskMs ? ' · ⚠风险里程碑 ' + summary.riskMs : '')
      + (summary.accuracy !== null ? (' · 估算准确率 ' + summary.accuracy.toFixed(0) + '%') : '');
  }
  function renderProjectTasks(summary){
    var k=kit();
    var openItems=summary.openItems || summary.items.filter(function(item){ return item.status!=='done'; });
    var completedItems=summary.completedItems || summary.items.filter(function(item){ return item.status==='done'; });
    var openList=openItems.length
      ? openItems.map(renderTaskSnippet).join('')
      : (k.empty ? k.empty('当前没有待完成任务') : '<div class="empty">当前没有待完成任务</div>');
    var completed='';
    if(completedItems.length){
      completed='<details class="work-completed-tasks"><summary><span>✓ 已完成</span><b>'+completedItems.length+'</b></summary>'
        +'<div class="work-completed-task-list">'+completedItems.map(renderTaskSnippet).join('')+'</div></details>';
    }
    return '<div class="ptasks"><div class="ph"><span>待完成任务</span><span>'+openItems.length+' 项</span></div>'
      +openList+completed+'</div>';
  }
  function renderProjectCard(summary){
    var p = summary.project;
    var k = kit();
    var key=projectCollapseKey(p);
    var collapsed=!!((model().collapseState||{})[key]);
    var healthBadge = p.status==='done'
      ? (k.badge ? k.badge('已完成','#10b98118','#047857') : '<span class="tag" style="background:#10b98118;color:#047857">已完成</span>')
      : (k.badge ? k.badge(summary.healthMeta[1], summary.healthMeta[0]+'22', summary.healthMeta[0]) : '<span class="tag" style="background:' + summary.healthMeta[0] + '22;color:' + summary.healthMeta[0] + ';margin-left:4px;font-size:11px">' + summary.healthMeta[1] + '</span>');
    return '<article class="card work work-project-card'+(collapsed?' collapsed':'')+'" data-collapse="'+key+'">'
      + '<div class="work-project-card-head"><div class="work-project-card-title"><div class="t">' + esc(p.name) + ' ' + healthBadge + '</div>'
      + '<div class="work-project-progress"><b>'+summary.pct+'%</b><span>'+summary.done+'/'+summary.items.length+' 已完成</span></div></div>'
      + '<button type="button" class="work-project-toggle" aria-label="'+(collapsed?'展开':'折叠')+'项目 '+esc(p.name)+'" aria-expanded="'+(!collapsed)+'" onclick="event.stopPropagation();toggleCollapse(\''+key+'\')" title="'+(collapsed?'展开项目':'折叠项目')+'"><span>▾</span></button></div>'
      + '<div class="work-project-card-body">'
      + '<div class="d">' + renderProjectMeta(summary) + '</div>'
      + '<div class="bar"><i style="width:' + summary.pct + '%;background:var(--work)"></i></div>'
      + renderProjectTasks(summary)
      + '<div class="acts" style="margin-top:10px">'
      + '<button class="btn" onclick="openForm(\'work\',null,null,\'' + p.id + '\')">＋任务</button>'
      + '<button class="icon-btn" aria-label="编辑项目 '+esc(p.name)+'" title="编辑项目" onclick="openProjectForm(\'' + p.id + '\')">✏️</button>'
      + '<button class="icon-btn" aria-label="删除项目 '+esc(p.name)+'" title="删除项目" onclick="delProject(\'' + p.id + '\')">🗑️</button>'
      + '</div></div></article>';
  }
  function renderProjectGrid(projects){
    var html='<div class="grid cards work-project-grid">';
    projects.forEach(function(p){
      try {
        html += renderProjectCard(global.WorkbenchProjectHealth.summarizeProject(p));
      } catch(e) {
        console.error('[Workbench] Error rendering project card:', p && p.id, e);
        html += '<div class="card work"><div class="t">⚠️ 项目渲染错误</div><div class="d">该项目数据可能存在问题</div></div>';
      }
    });
    return html+'</div>';
  }
  function renderProjectGroups(vm){
    var k=kit();
    var active=vm.activeProjects || vm.projects.filter(function(p){ return (p.status||'active')!=='done'; });
    var completed=vm.completedProjects || vm.projects.filter(function(p){ return p.status==='done'; });
    var html='<section class="work-project-section"><div class="work-project-section-head"><div><b>进行中项目</b><span>把注意力留给仍需推进的工作</span></div><strong>'+active.length+'</strong></div>';
    html+=active.length
      ? renderProjectGrid(active)
      : (k.empty ? k.empty(completed.length?'当前没有进行中的项目。':'还没有项目。建立你的研发课题 / 基金申请 / 平台建设项目吧。') : '<div class="empty">当前没有进行中的项目。</div>');
    html+='</section>';
    if(completed.length){
      html+='<details class="work-project-archive"><summary><span><b>✓ 已完成项目</b><small>默认收起，随时可以回来查看</small></span><strong>'+completed.length+'</strong></summary>'
        +'<div class="work-project-archive-body">'+renderProjectGrid(completed)+'</div></details>';
    }
    return html;
  }
  function renderProjectSummaryCards(vm){
    var totals = { projects: vm.projects.length, active:0, overdue:0, risk:0 };
    vm.projects.forEach(function(p){
      var s=global.WorkbenchProjectHealth.summarizeProject(p);
      if((p.status||'active')!=='done') totals.active += 1;
      totals.overdue += s.overdue || 0;
      totals.risk += s.riskMs || 0;
    });
    var k=kit();
    if(k.summaryGrid){
      return k.summaryGrid([
        k.summaryCard('work','📁 项目总数',totals.projects,'活跃 '+totals.active+' 个'),
        k.summaryCard('work','📝 临时任务',vm.tmpItems.length,'未挂项目的工作事项'),
        k.summaryCard('work','🗓️ 已排期事项',vm.agendaItems.length,'带日期的工作任务'),
        k.summaryCard('work','⚠ 风险信号',totals.overdue + totals.risk,'逾期 '+totals.overdue+' · 风险里程碑 '+totals.risk, (totals.overdue+totals.risk)?'#ef4444':'var(--work)')
      ], 'margin-bottom:14px');
    }
    return '';
  }
  global.renderWorkProjects = function(){
    var vm = model();
    var k = kit();
    var activeCount=(vm.activeProjects||[]).length;
    var completedCount=(vm.completedProjects||[]).length;
    if(!vm.activeProjects && !vm.completedProjects){
      activeCount=vm.projects.filter(function(p){ return (p.status||'active')!=='done'; }).length;
      completedCount=vm.projects.length-activeCount;
    }
    var body=renderProjectGroups(vm);
    var actions = k.toolbar ? k.toolbar([{ label:'＋ 新项目', primary:true, onClick:'event.stopPropagation();openProjectForm()' }]) : '<button class="btn primary" onclick="event.stopPropagation();openProjectForm()">＋ 新项目</button>';
    var title='📁 项目管理（进行中 '+activeCount+' · 已完成 '+completedCount+'）';
    var panel = k.collapsible
      ? k.collapsible('work_projects', title, body, { collapsed:!!((vm.collapseState||{}).work_projects), headerActions:actions })
      : '<div class="panel collapsible '+((vm.collapseState||{}).work_projects?'collapsed':'')+'" data-collapse="work_projects"><div class="panel-h" onclick="toggleCollapse(\'work_projects\')"><h2>'+title+'</h2><span>'+actions+'<span class="caret">▾</span></span></div><div class="panel-b">'+body+'</div></div>';
    return renderProjectSummaryCards(vm) + panel;
  };
  function renderWorkTabs(vm){
    var k=kit();
    if(k.chips){
      return k.chips([
        { label:'☰ 列表', active:vm.workView==='list', onClick:"setWorkView('list')" },
        { label:'🗂️ 看板', active:vm.workView==='board', onClick:"setWorkView('board')" }
      ], { style:'margin-top:14px' });
    }
    return '<div class="chips" style="margin-top:14px"><span class="ctab ' + (vm.workView==='list'?'on':'') + '" onclick="setWorkView(\'list\')">☰ 列表</span><span class="ctab ' + (vm.workView==='board'?'on':'') + '" onclick="setWorkView(\'board\')">🗂️ 看板</span></div>';
  }
  function renderItemList(items, emptyText){
    var k=kit();
    if(items && items.length){
      var html=items.map(global.itemHTML).join('');
      return k.list ? k.list(html) : '<div class="list">'+html+'</div>';
    }
    return k.empty ? k.empty(emptyText) : '<div class="empty">'+emptyText+'</div>';
  }
  function renderSeparatedItemList(items, emptyText){
    var k=kit();
    items=items||[];
    if(!items.length) return k.empty ? k.empty(emptyText) : '<div class="empty">'+emptyText+'</div>';
    var openItems=items.filter(function(item){ return item.status!=='done'; });
    var completedItems=items.filter(function(item){ return item.status==='done'; });
    var html='<div class="work-item-group"><div class="work-item-group-head"><span>待完成</span><b>'+openItems.length+'</b></div>'
      +(openItems.length ? renderItemList(openItems, '') : (k.empty ? k.empty('当前没有待完成事项') : '<div class="empty">当前没有待完成事项</div>'))+'</div>';
    if(completedItems.length){
      html+='<details class="work-completed-items"><summary><span>✓ 已完成</span><b>'+completedItems.length+'</b></summary>'
        +'<div class="work-completed-items-body">'+renderItemList(completedItems, '')+'</div></details>';
    }
    return html;
  }
  function renderWorkModule(){
    var vm = model();
    var html = '';
    html += global.renderWorkProjects();
    html += renderSectionWithModel(vm, 'tmp_work', '📝 临时任务（待完成 ' + countByStatus(vm.tmpItems,false) + ' · 已完成 '+countByStatus(vm.tmpItems,true)+'）', renderSeparatedItemList(vm.tmpItems, '暂无临时任务，点「＋ 新建」记录零散工作。'), {
      style:'margin-top:14px',
      headerActions:'<button class="btn primary" onclick="event.stopPropagation();openForm(\'work\')">＋ 新建</button>'
    });
    html += renderWorkTabs(vm);
    html += renderSectionWithModel(vm, 'cal_work', '📅 工作日历', global.renderCalendar('work'));
    html += renderSectionWithModel(vm, 'ag_work', '🗓️ 日程（待完成 '+countByStatus(vm.agendaItems,false)+' · 已完成 '+countByStatus(vm.agendaItems,true)+'）', renderSeparatedItemList(vm.agendaItems, '暂无工作日程。'), { style:'margin-top:14px' });
    var allBody = vm.workView==='board' ? global.renderKanban('work') : renderSeparatedItemList(vm.filteredItems, '暂无工作事项。');
    html += renderSectionWithModel(vm, 'all_work', '📋 全部工作事项（待完成 '+countByStatus(vm.filteredItems,false)+' · 已完成 '+countByStatus(vm.filteredItems,true)+'）', allBody, { style:'margin-top:14px' });
    return html;
  }
  function renderSectionWithModel(vm, key, title, body, opts){
    var k=kit();
    var collapsed = !!((vm.collapseState||{})[key]);
    opts = Object.assign({ collapsed: collapsed }, opts || {});
    if(k.collapsible) return k.collapsible(key, title, body, opts);
    return '<div class="panel collapsible ' + (collapsed?'collapsed':'') + '"'+(opts.style?' style="'+opts.style+'"':'')+' data-collapse="'+key+'">'
      + '<div class="panel-h" onclick="toggleCollapse(\''+key+'\')"><h2>'+title+'</h2><span style="display:flex;align-items:center;gap:8px">'+(opts.headerActions||'')+'<span class="caret">▾</span></span></div>'
      + '<div class="panel-b">'+body+'</div></div>';
  }
  global.renderWorkModule = renderWorkModule;
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('work', renderWorkModule);
  }
})(window);
