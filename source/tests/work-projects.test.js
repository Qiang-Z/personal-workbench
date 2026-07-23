const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const window={
  data:{
    projects:[
      {id:'active-project',name:'进行中的平台建设',status:'active'},
      {id:'completed-project',name:'已结束的专项工作',status:'done'}
    ],
    items:[
      {id:'a-open',cat:'work',projectId:'active-project',title:'待处理的项目任务',status:'doing',prio:'high',due:'2026-07-25'},
      {id:'a-done',cat:'work',projectId:'active-project',title:'已处理的项目任务',status:'done',prio:'mid',due:'2026-07-20'},
      {id:'p-done',cat:'work',projectId:'completed-project',title:'归档项目任务',status:'done',prio:'low'},
      {id:'tmp-open',cat:'work',title:'临时待办',status:'todo',prio:'mid'},
      {id:'tmp-done',cat:'work',title:'临时完成项',status:'done',prio:'mid'}
    ]
  },
  currentCat:'work',
  workView:'list',
  collapseState:{},
  todayStr(){return '2026-07-23';},
  daysBetween(a,b){return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);},
  esc(v){return String(v==null?'':v);},
  itemHTML(item){return '<div class="item '+(item.status==='done'?'done':'')+'">'+item.title+'</div>';},
  renderCalendar(){return '<div class="calendar"></div>';},
  renderKanban(){return '<div class="kanban"></div>';}
};
window.window=window;
const context=vm.createContext({window,console,Date});
[
  '../src/domain/projects/health.js',
  '../src/ui/helpers/panel-kit.js',
  '../src/app/selectors.js',
  '../src/ui/pages/work-page.js'
].forEach(rel=>{
  const file=path.resolve(__dirname,rel);
  vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
});

const model=window.WorkbenchSelectors.workModuleModel();
assert.equal(model.activeProjects.length,1);
assert.equal(model.completedProjects.length,1);
assert.equal(model.tmpOpenItems.length,1);
assert.equal(model.tmpCompletedItems.length,1);

const summary=window.WorkbenchProjectHealth.summarizeProject(window.data.projects[0]);
assert.equal(summary.openItems.length,1);
assert.equal(summary.completedItems.length,1);

const projectsHtml=window.renderWorkProjects();
assert.match(projectsHtml,/data-collapse="work_projects"/,'项目管理整区应可折叠');
assert.match(projectsHtml,/work-project-card/,'单个项目卡应提供折叠结构');
assert.match(projectsHtml,/待完成任务/);
assert.match(projectsHtml,/work-completed-tasks/,'项目内完成任务应单独收起');
assert.ok(projectsHtml.indexOf('进行中的平台建设')<projectsHtml.indexOf('已完成项目'),'进行中项目应先显示');
assert.ok(projectsHtml.indexOf('已结束的专项工作')>projectsHtml.indexOf('已完成项目'),'完成项目应进入归档区');

const pageHtml=window.renderWorkModule();
assert.match(pageHtml,/临时任务（待完成 1 · 已完成 1）/);
assert.match(pageHtml,/全部工作事项（待完成 2 · 已完成 3）/);
assert.match(pageHtml,/work-completed-items/,'工作列表的完成项应放入独立折叠区');

console.log('work-projects.test.js: ok');
