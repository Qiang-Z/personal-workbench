(function(global){
  function esc(s){return global.esc?global.esc(s):String(s==null?'':s);}
  function data(){return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{});}
  function dueText(days){if(days<0)return '已逾期 '+(-days)+' 天';if(days===0)return '今天截止';if(days<=7)return '还剩 '+days+' 天';return days+' 天后';}
  function riskClass(days){return days<0?'overdue':days<=7?'urgent':days<=30?'soon':'';}
  function openAction(x){
    if(x.type==='paper')return "openPaperForm('"+x.id+"')";
    if(x.type==='patent')return "openPatentForm('"+x.id+"')";
    if(x.type==='project')return "openRProjectForm('"+x.id+"')";
    return "openForm('research','"+x.id+"')";
  }
  function renderSummary(){
    var s=global.WorkbenchResearchSummary;var pc=s.paperCounts();var rp=s.projectCounts();var deadlines=s.deadlineItems();
    var risk=deadlines.filter(function(x){return x.days<=7;}).length;var kit=global.WorkbenchPanelKit;
    if(!kit)return '';
    return kit.summaryGrid([
      kit.summaryCard('research','📄 进行中论文',pc.active,'撰写 '+pc.writing+' · 审稿 '+pc.submitted+' · 修改 '+pc.revision),
      kit.summaryCard('research','⚠️ 近期风险',risk,'逾期或 7 天内需要处理',risk?'#ef4444':'var(--research)'),
      kit.summaryCard('research','🧭 缺少下一步',pc.missingNext,'进行中但未设置下一步的论文',pc.missingNext?'#f59e0b':'var(--research)'),
      kit.summaryCard('research','🏛️ 在研项目',rp.active,'总项目 '+rp.total+' · 45 天内结束 '+rp.endingSoon)
    ],'margin-bottom:14px');
  }
  function renderTabs(){
    var items=[
      {label:'🧭 科研首页',active:global.researchTab==='overview',onClick:"setResearchTab('overview')"},
      {label:'📄 论文',active:global.researchTab==='paper',onClick:"setResearchTab('paper')"},
      {label:'🏛️ 科研项目',active:global.researchTab==='project',onClick:"setResearchTab('project')"},
      {label:'📜 专利/软著',active:global.researchTab==='patent',onClick:"setResearchTab('patent')"}
    ];
    return global.WorkbenchPanelKit.chips(items,{style:'margin-bottom:16px'});
  }
  function renderPaperFilters(){
    var pc=global.WorkbenchResearchSummary.paperCounts();
    return global.WorkbenchPanelKit.chips([
      {label:'进行中 '+pc.active,active:global.paperKind==='active',onClick:"setPaperKind('active')"},
      {label:'撰写 '+pc.writing,active:global.paperKind==='writing',onClick:"setPaperKind('writing')"},
      {label:'投稿/审稿 '+pc.submitted,active:global.paperKind==='submitted',onClick:"setPaperKind('submitted')"},
      {label:'修改 '+pc.revision,active:global.paperKind==='revision',onClick:"setPaperKind('revision')"},
      {label:'已录用 '+pc.done,active:global.paperKind==='done',onClick:"setPaperKind('done')"},
      {label:'已归档 '+pc.archived,active:global.paperKind==='archived',onClick:"setPaperKind('archived')"}
    ],{style:'margin-bottom:16px'});
  }
  function renderDeadlines(){
    var list=global.WorkbenchResearchSummary.deadlineItems().slice(0,8);
    var body=list.map(function(x){
      return '<button class="research-deadline '+riskClass(x.days)+'" onclick="'+openAction(x)+'"><span class="deadline-date">'+esc(x.due)+'</span><span class="deadline-body"><b>'+esc(x.title)+'</b><small>'+esc(x.label)+'</small></span><span class="deadline-left">'+dueText(x.days)+'</span></button>';
    }).join('');
    if(!body)body='<div class="empty">暂无科研截止日。为论文设置“下一步截止日”后，会在这里统一提醒。</div>';
    return '<section class="panel"><div class="sec-head"><h2>⏰ 最近需要处理</h2><button class="btn" onclick="setView(\'calendar\')">查看日历</button></div><div class="research-deadlines">'+body+'</div></section>';
  }
  function renderNextActions(){
    var actions=global.WorkbenchResearchSummary.nextActions().slice(0,6);
    var body=actions.map(function(x){
      var due=x.due?'<span class="pstatus '+riskClass(x.days)+'">'+dueText(x.days)+'</span>':'';
      return '<div class="research-action"><span class="action-dot '+(x.waiting?'waiting':'')+'"></span><div><b>'+esc(x.text)+'</b><small>'+esc(x.paper.title)+'</small></div>'+due+'<button class="icon-btn" onclick="openPaperForm(\''+x.paper.id+'\')" title="编辑论文">✏️</button></div>';
    }).join('');
    if(!body)body='<div class="empty">还没有论文下一步。为正在推进的论文设置一个可执行的动作吧。</div>';
    return '<section class="panel"><div class="sec-head"><h2>🧭 论文下一步</h2><button class="btn primary" onclick="openPaperForm(null,\'writing\')">＋ 新建论文</button></div><div class="research-actions">'+body+'</div></section>';
  }
  function renderPipeline(){
    var pc=global.WorkbenchResearchSummary.paperCounts();
    return '<section class="research-pipeline"><button onclick="setResearchTab(\'paper\');setPaperKind(\'writing\')"><span>✍️</span><b>'+pc.writing+'</b><small>撰写中</small></button>'
      +'<button onclick="setResearchTab(\'paper\');setPaperKind(\'submitted\')"><span>📨</span><b>'+pc.submitted+'</b><small>投稿/审稿</small></button>'
      +'<button onclick="setResearchTab(\'paper\');setPaperKind(\'revision\')"><span>🛠️</span><b>'+pc.revision+'</b><small>修改中</small></button>'
      +'<button onclick="setResearchTab(\'paper\');setPaperKind(\'done\')"><span>✅</span><b>'+pc.done+'</b><small>已录用</small></button></section>';
  }
  function renderResearchTasks(){
    var items=(data().items||[]).filter(function(i){return i.cat==='research'&&i.status!=='done'&&i.sourceType!=='paper-action';}).sort(function(a,b){return String(a.due||'9999').localeCompare(String(b.due||'9999'));}).slice(0,8);
    var body=items.length?'<div class="list">'+items.map(global.itemHTML).join('')+'</div>':'<div class="empty">暂无独立科研事项。</div>';
    return '<section class="panel" style="margin-top:14px"><div class="sec-head"><h2>📋 科研事项</h2><button class="btn" onclick="openForm(\'research\')">＋ 新建事项</button></div>'+body+'</section>';
  }
  function renderHome(){
    return '<div class="research-hero"><div><span>科研进展助手</span><h1>先处理截止风险，再推进下一步</h1><p>论文、项目和专利共用一套日期与任务系统，不需要分别检查。</p></div><div><button class="btn primary" onclick="openPaperForm(null,\'writing\')">＋ 新建论文</button><button class="btn" onclick="openRProjectForm()">＋ 科研项目</button></div></div>'
      +renderSummary()+renderPipeline()+'<div class="research-home-grid">'+renderDeadlines()+renderNextActions()+'</div>'+renderResearchTasks();
  }
  global.renderResearchModule=function(){
    var html=renderTabs();
    if(global.researchTab==='overview')html+=renderHome();
    else if(global.researchTab==='paper')html+=renderPaperFilters()+(global.renderPapersPanel?global.renderPapersPanel(global.paperKind):global.renderPapers(global.paperKind));
    else if(global.researchTab==='project')html+=(global.renderRProjectsPanel?global.renderRProjectsPanel():global.renderRProjects());
    else html+=(global.renderPatentsPanel?global.renderPatentsPanel():global.renderPatents());
    return html;
  };
  if(global.WorkbenchModuleRegistry&&typeof global.WorkbenchModuleRegistry.register==='function')global.WorkbenchModuleRegistry.register('research',global.renderResearchModule);
})(window);
