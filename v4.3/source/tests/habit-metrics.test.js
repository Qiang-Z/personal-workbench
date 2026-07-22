const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const today='2026-07-19';
const window={
  data:{habits:[
    {id:'daily',name:'每天阅读',freq:'daily',days:[0,1,2,3,4,5,6],minimum:'读 2 页',logs:{'2026-07-18':true}},
    {id:'weekly',name:'整理房间',freq:'weekly',target:3,logs:{'2026-07-13':true,'2026-07-15':true}},
    {id:'met',name:'本周已完成',freq:'weekly',target:2,logs:{'2026-07-14':true,'2026-07-16':true}},
    {id:'done',name:'今天完成',freq:'daily',logs:{[today]:true}},
    {id:'rest',name:'今天休息',freq:'daily',logs:{},skips:{[today]:true}},
    {id:'paused',name:'暂停习惯',freq:'daily',status:'paused',logs:{}}
  ]},
  todayStr(){return today;},
  esc(v){return String(v==null?'':v);},
  save(){},render(){},
};
window.window=window;
const context=vm.createContext({window,console,Date});
const metricsFile=path.resolve(__dirname,'../src/domain/habit/metrics.js');
vm.runInContext(fs.readFileSync(metricsFile,'utf8'),context,{filename:metricsFile});

const metrics=window.WorkbenchHabitMetrics;
assert.equal(metrics.weekday(today),6);
assert.equal(metrics.scheduleLabel(window.data.habits[0]),'每天');
assert.equal(metrics.weekDone(window.data.habits[1],today),2);
assert.equal(metrics.dueOn(window.data.habits[1],today),true,'未达到周目标时今天仍应显示');
assert.equal(metrics.dueOn(window.data.habits[2],today),false,'达到周目标后不应继续制造待办');
assert.equal(metrics.isActive(window.data.habits[5]),false);

const summary=metrics.summary();
assert.equal(summary.active.length,5);
assert.equal(summary.paused.length,1);
assert.equal(summary.dueToday,3,'今日列表应包含待做和已完成的到期习惯');
assert.equal(summary.doneToday,1);
assert.equal(summary.remaining,2);
assert.equal(summary.restToday,1);
assert.equal(metrics.model(window.data.habits[0]).streak,1,'未完成今天时不应立刻打断昨天的连续行动');

const pageFile=path.resolve(__dirname,'../src/ui/pages/habit-page.js');
vm.runInContext(fs.readFileSync(pageFile,'utf8'),context,{filename:pageFile});
window.habitTab='today';
const html=window.renderHabits();
assert.match(html,/今日习惯助手/);
assert.match(html,/完成最小一步/);
assert.match(html,/今天休息/);
assert.match(html,/温和回顾/);

window.restHabitToday('daily');
assert.equal(window.data.habits[0].skips[today],true);
assert.equal(window.data.habits[0].logs[today],undefined);
window.resumeHabit('paused');
assert.equal(window.data.habits[5].status,'active');

console.log('habit-metrics.test.js: ok');
