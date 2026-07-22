const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const today = '2026-07-18';
const day = 24 * 60 * 60 * 1000;
const window = {
  data: {
    finances: [
      { id:'income-now', date:'2026-07-05', type:'income', category:'工资', amount:10000 },
      { id:'expense-now', date:'2026-07-10', type:'expense', category:'餐饮', amount:2500 },
      { id:'income-last', date:'2026-06-05', type:'income', category:'工资', amount:9000 },
      { id:'expense-last', date:'2026-06-10', type:'expense', category:'餐饮', amount:1800 },
      { id:'future-manual', date:'2026-07-25', type:'expense', category:'旅行', amount:800 },
      { id:'rent-plan', date:'2026-07-20', type:'expense', category:'房租', amount:3000, gen:true, tplId:'rent', planState:'pending' },
      { id:'confirmed-plan', date:'2026-07-21', type:'expense', category:'订阅', amount:50, gen:true, tplId:'sub', planState:'confirmed' },
      { id:'skipped-plan', date:'2026-07-22', type:'expense', category:'健身', amount:200, gen:true, tplId:'gym', planState:'skipped' },
      { id:'rent', date:'2026-01-20', type:'expense', category:'房租', amount:3000, recur:'month' }
    ],
    funds: [],
    rprojects: [],
    monthlyBudget:6000,
    prefs:{ financeConfig:{ categoryBudgets:{ 餐饮:3000, 交通:500 } } }
  },
  todayStr(){ return today; },
  kwOf(){ return true; },
  daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/day); },
  esc(value){ return String(value == null ? '' : value); },
  render(){},
  save(){},
  uid(){ return 'new-id'; }
};
window.window = window;
const context = vm.createContext({ window, console, Date });
const metricsFile = path.resolve(__dirname,'../src/domain/finance/metrics.js');
vm.runInContext(fs.readFileSync(metricsFile,'utf8'),context,{filename:metricsFile});

const metrics = window.WorkbenchFinanceMetrics;
const current = metrics.monthSummary();
assert.equal(current.income,10000);
assert.equal(current.expense,2500,'未来记录和周期账单不应提前计入本月支出');
assert.equal(current.balance,7500);
assert.equal(metrics.actualRecords().length,5,'只应保留已发生的非生成记录');

const plans = metrics.plannedRecords(30);
assert.equal(plans.length,2,'只返回未来手工记录和待确认周期账单');
assert.equal(plans.some(x=>x.id==='rent-plan'),true);
assert.equal(plans.some(x=>x.id==='confirmed-plan'),false);

const budget = metrics.budgetSummary();
assert.equal(budget.total,6000);
assert.equal(budget.spent,2500);
assert.equal(budget.left,3500);
assert.equal(budget.categories.find(x=>x.name==='餐饮').spent,2500);

const trend = metrics.aggregate('month');
assert.equal(trend.map['2026-07'].exp,2500);
assert.equal(trend.map['2026-06'].inc,9000);
assert.equal(metrics.recurringTemplates().length,1);

const pageFile = path.resolve(__dirname,'../src/ui/pages/finance-page.js');
vm.runInContext(fs.readFileSync(pageFile,'utf8'),context,{filename:pageFile});
window.financeTab = 'overview';
const html = window.renderFinanceModule();
assert.match(html,/财务首页/);
assert.match(html,/收支明细/);
assert.match(html,/预算与账单/);
assert.match(html,/本月财务助手/);
assert.match(html,/待确认账单/);

console.log('finance-metrics.test.js: ok');
