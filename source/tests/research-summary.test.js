const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const today = '2026-07-18';
const day = 24 * 60 * 60 * 1000;
const window = {
  data: {
    papers: [
      { id:'p1', title:'撰写中论文', status:'writing', nextAction:'补充实验', nextDue:'2026-07-20' },
      { id:'p2', title:'等待中论文', status:'review', nextAction:'继续修改', waitingFor:'编辑决定', followUpAt:'2026-07-17' },
      { id:'p3', title:'已录用论文', status:'accepted' }
    ],
    patents: [{ id:'pt1', title:'专利A', feeDue:'2026-07-25' }],
    rprojects: [{ id:'rp1', title:'项目A', status:'active', end:'2026-08-10' }],
    items: [{ id:'t1', cat:'research', title:'研究任务', status:'todo', due:'2026-07-19' }]
  },
  todayStr(){ return today; },
  daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/day); }
};
window.window = window;
const context = vm.createContext({ window, console, Date });
const file = path.resolve(__dirname,'../src/domain/research/summary.js');
vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});

const summary = window.WorkbenchResearchSummary;
const counts = summary.paperCounts();
assert.equal(counts.active,2);
assert.equal(counts.writing,1);
assert.equal(counts.submitted,1);
assert.equal(counts.done,1);
assert.equal(counts.waiting,1);

const actions = summary.nextActions();
assert.equal(actions[0].paper.id,'p2','已过跟进日的等待事项应最优先');
assert.equal(actions[0].waiting,true);
assert.match(actions[0].text,/编辑决定/);

const deadlines = summary.deadlineItems();
assert.equal(deadlines[0].type,'paper');
assert.equal(deadlines[0].id,'p2');
assert.ok(deadlines.some(x=>x.type==='patent'));
assert.ok(deadlines.some(x=>x.type==='project'));
assert.ok(deadlines.some(x=>x.type==='task'));

console.log('research-summary.test.js: ok');
