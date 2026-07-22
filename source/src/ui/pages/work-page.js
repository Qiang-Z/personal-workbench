(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  function kit(){ return global.WorkbenchPanelKit || {}; }
  function selectors(){ return global.WorkbenchSelectors || {}; }
  function model(){ return selectors().workModuleModel ? selectors().workModuleModel() : { state:{}, projects:[], tmpItems:[], agendaItems:[], filteredItems:[], workView:global.workView||'list', collapseState:global.collapseState||{} }; }
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
  function renderProjectCard(summary){
    var p = summary.project;
    var k = kit();
    var healthBadge = p.status==='done'
      ? '✅'
      : (k.badge ? k.badge(summary.healthMeta[1], summary.healthMeta[0]+'22', summary.healthMeta[0]) : '<span class="tag" style="background:' + summary.healthMeta[0] + '22;color:' + summary.healthMeta[0] + ';margin-left:4px;font-size:11px">' + summary.healthMeta[1] + '</span>');
    var taskList = summary.items.length ? summary.sortedItems.map(renderTaskSnippet).join('') : (k.empty ? k.empty('暂无任务，点「＋任务」添加') : '<div class="empty">暂无任务，点「＋任务」添加</div>');
    return '<div class="card work">'
      + '<div class="t">' + esc(p.name) + ' ' + healthBadge + '</div>'
      + '<div class="n">' + summary.pct + '%</div>'
      + '<div class="d">' + renderProjectMeta(summary) + '</div>'
      + '<div class="bar"><i style="width:' + summary.pct + '%;background:var(--work)"></i></div>'
      + '<div class="ptasks"><div class="ph"><span>任务清单</span><span>' + summary.done + '/' + summary.items.length + '</span></div>' + taskList + '</div>'
      + '<div class="acts" style="margin-top:10px">'
      + '<button class="btn" onclick="openForm(\'work\',null,null,\'' + p.id + '\')">＋任务</button>'
      + '<button class="icon-btn" onclick="openProjectForm(\'' + p.id + '\')">✏️</button>'
      + '<button class="icon-btn" onclick="delProject(\'' + p.id + '\')">🗑️</button>'
      + '</div></div>';
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
    var body='';
    if(!vm.projects.length){
      body += k.empty ? k.empty('还没有项目。建立你的研发课题 / 基金申请 / 平台建设项目吧。') : '<div class="empty">还没有项目。建立你的研发课题 / 基金申请 / 平台建设项目吧。</div>';
    }else{
      body += '<div class="grid cards">';
      vm.projects.forEach(function(p){
        try {
          body += renderProjectCard(global.WorkbenchProjectHealth.summarizeProject(p));
        } catch(e) {
          console.error('[Workbench] Error rendering project card:', p && p.id, e);
          body += '<div class="card work"><div class="t">⚠️ 项目渲染错误</div><div class="d">该项目数据可能存在问题</div></div>';
        }
      });
      body += '</div>';
    }
    var actions = k.toolbar ? k.toolbar([{ label:'＋ 新项目', primary:true, onClick:'openProjectForm()' }]) : '<button class="btn primary" onclick="openProjectForm()">＋ 新项目</button>';
    var panel = k.infoPanel ? k.infoPanel('📁 项目管理', body, { actions: actions }) : '<div class="panel"><div class="sec-head"><h2>📁 项目管理</h2>'+actions+'</div>'+body+'</div>';
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
  function renderSection(key, title, body, opts){
    var k=kit();
    var collapsed = !!((model().collapseState||{})[key]);
    opts = Object.assign({ collapsed: collapsed }, opts || {});
    if(k.collapsible) return k.collapsible(key, title, body, opts);
    return '<div class="panel collapsible ' + (collapsed?'collapsed':'') + '"'+(opts.style?' style="'+opts.style+'"':'')+' data-collapse="'+key+'">'
      + '<div class="panel-h" onclick="toggleCollapse(\''+key+'\')"><h2>'+title+'</h2><span style="display:flex;align-items:center;gap:8px">'+(opts.headerActions||'')+'<span class="caret">▾</span></span></div>'
      + '<div class="panel-b">'+body+'</div></div>';
  }
  function renderWorkModule(){
    var vm = model();
    var html = '';
    html += global.renderWorkProjects();
    html += renderSectionWithModel(vm, 'tmp_work', '📝 临时任务（' + vm.tmpItems.length + '）', renderItemList(vm.tmpItems, '暂无临时任务，点「＋ 新建」记录零散工作。'), {
      style:'margin-top:14px',
      headerActions:'<button class="btn primary" onclick="event.stopPropagation();openForm(\'work\')">＋ 新建</button>'
    });
    html += renderWorkTabs(vm);
    html += renderSectionWithModel(vm, 'cal_work', '📅 工作日历', global.renderCalendar('work'));
    html += renderSectionWithModel(vm, 'ag_work', '🗓️ 日程（按日期）', renderItemList(vm.agendaItems, '暂无工作日程。'), { style:'margin-top:14px' });
    var allBody = vm.workView==='board' ? global.renderKanban('work') : renderItemList(vm.filteredItems, '暂无工作事项。');
    html += renderSectionWithModel(vm, 'all_work', '📋 全部工作事项', allBody, { style:'margin-top:14px' });
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
