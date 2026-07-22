const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const today = '2026-07-18';
function add(ds, offset){
  const d = new Date(ds + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function mondayOf(ds){
  const d = new Date(ds + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay()+6)%7));
  return add(d.toISOString().slice(0,10),0);
}
const mon = mondayOf(today);
const plans = [];
plans[0] = { type:'跑步', minutes:40 };
plans[2] = { type:'力量', minutes:30, skipped:true };
plans[5] = { type:'游泳', minutes:45 };

const window = {
  data: {
    prefs:{ healthGoals:{ weeklyMinutes:180, weeklySessions:4 } },
    weekPlans:{ [mon]:plans },
    items:[
      { id:'s1', cat:'sport', status:'done', due:mon, sportType:'跑步', minutes:40 },
      { id:'s2', cat:'sport', status:'done', due:today, sportType:'游泳', minutes:30, effort:'moderate' },
      { id:'s3', cat:'sport', status:'todo', due:today, sportType:'跑步', minutes:99 }
    ],
    weights:[
      { id:'w1', date:'2026-06-25', weight:70 },
      { id:'w2', date:'2026-07-15', weight:69 },
      { id:'w3', date:today, weight:68.5, bodyFat:18.2 }
    ],
    habits:[],
    targetWeight:67
  },
  todayStr(){ return today; },
  mondayOf,
  slotDate:add,
  weekPlanSlots(key){
    const source = this.data.weekPlans[key] || [];
    return Array.from({length:7},(_,i)=>source[i]||null);
  }
};
window.window = window;
const context = vm.createContext({ window, console, Date });
const file = path.resolve(__dirname,'../src/domain/health/metrics.js');
vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});

const metrics = window.WorkbenchHealthMetrics;
const sport = metrics.sportSummary();
assert.equal(sport.weekDoneMinutes,70);
assert.equal(sport.weekDoneSessions,2);
assert.equal(sport.weekPlannedMinutes,85,'跳过的计划不应计入当前计划时长');
assert.equal(sport.weekPlannedSessions,2);
assert.equal(sport.goals.weeklyMinutes,180);
assert.equal(sport.remainingMinutes,110);
assert.equal(sport.todayPlan.plan.type,'游泳');
assert.equal(sport.todayDone,true);

const weight = metrics.weightSummary();
assert.equal(weight.latestWeight,68.5);
assert.equal(weight.avg7,68.8);
assert.equal(weight.change30,-1.5);
assert.equal(weight.latestBodyFat,18.2);
assert.equal(weight.target,67);

const pageFile = path.resolve(__dirname,'../src/ui/pages/sport-page.js');
vm.runInContext(fs.readFileSync(pageFile,'utf8'),context,{filename:pageFile});
window.sportTab = 'overview';
const html = window.renderSportModule();
assert.match(html,/健康首页/);
assert.match(html,/本周进度/);
assert.match(html,/已完成/);
assert.match(html,/近 7 天均值/);

console.log('health-metrics.test.js: ok');
