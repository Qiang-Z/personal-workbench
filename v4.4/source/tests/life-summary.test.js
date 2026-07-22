const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const today = '2026-07-19';
const day = 24 * 60 * 60 * 1000;
const window = {
  data:{
    items:[
      {id:'t0',cat:'life',title:'已到期',status:'todo',due:'2026-07-18'},
      {id:'t1',cat:'life',title:'今天',status:'todo',due:today},
      {id:'t2',cat:'life',title:'三天后',status:'todo',due:'2026-07-22'},
      {id:'t3',cat:'life',title:'没日期',status:'todo',due:''},
      {id:'t4',cat:'life',title:'以后',status:'todo',due:'2026-08-10'},
      {id:'t5',cat:'life',title:'已完成',status:'done',due:today},
      {id:'w1',cat:'work',title:'工作任务',status:'todo',due:today}
    ],
    books:[{id:'b1',title:'在读书',status:'reading',progress:30,nextAction:'读完第三章',nextDue:'2026-07-21'}],
    travels:[{id:'tr1',title:'杭州',start:'2026-07-25',end:'2026-07-27',budget:'2000',spent:'999',checklist:['身份证',{text:'车票',done:true}],nextAction:'预订酒店'}],
    anniversaries:[{id:'a1',name:'重要日子',type:'important',date:'07-25',remindDays:7}],
    finances:[
      {id:'f1',date:'2026-07-18',type:'expense',amount:300,travelId:'tr1'},
      {id:'f2',date:'2026-07-25',type:'expense',amount:500,travelId:'tr1'},
      {id:'f3',date:'2026-07-18',type:'expense',amount:100,travelId:'tr1',gen:true}
    ]
  },
  todayStr(){return today;},
  daysBetween(a,b){return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/day);},
  esc(v){return String(v==null?'':v);},
  itemHTML(i){return '<div class="item">'+i.title+'</div>';},
  save(){},render(){},uid(){return 'new-task';},
  setLifeTab(tab){this.lifeTab=tab;}
};
window.window=window;
const context=vm.createContext({window,console,Date,alert(){}});
const metricsFile=path.resolve(__dirname,'../src/domain/life/summary.js');
vm.runInContext(fs.readFileSync(metricsFile,'utf8'),context,{filename:metricsFile});

const metrics=window.WorkbenchLifeSummary;
const groups=metrics.taskGroups();
assert.equal(groups.today.length,2,'今天分组应包括已到期事项');
assert.equal(groups.upcoming.length,1);
assert.equal(groups.unscheduled.length,1);
assert.equal(groups.later.length,1);
assert.equal(groups.completed.length,1);

const travel=window.data.travels[0];
assert.equal(metrics.travelStatus(travel),'upcoming');
assert.equal(metrics.travelChecklistProgress(travel).done,1);
assert.equal(metrics.travelChecklistProgress(travel).total,2);
assert.equal(metrics.travelSpent(travel),300,'关联财务后应只汇总已发生的真实支出');

const books=metrics.bookSummary();
assert.equal(books.reading,1);
assert.equal(books.next.id,'b1');
const dates=metrics.anniversarySummary();
assert.equal(dates.next.item.id,'a1');
assert.equal(dates.next.next.days,6);

const pageFile=path.resolve(__dirname,'../src/ui/pages/life-page.js');
vm.runInContext(fs.readFileSync(pageFile,'utf8'),context,{filename:pageFile});
window.lifeTab='overview';
const html=window.renderLifeModule();
assert.match(html,/生活首页/);
assert.match(html,/把接下来的生活安排好/);
assert.match(html,/出行准备/);
assert.match(html,/当前阅读/);

window.toggleTravelCheck('tr1',0);
assert.equal(window.data.travels[0].checklist[0].done,true,'旧字符串清单应能无损升级为可勾选对象');
window.createAnniversaryPrep('a1');
const prep=window.data.items.find(x=>x.id==='new-task');
assert.equal(prep.cat,'life');
assert.equal(prep.due,today,'准备日期已经过时，应安排到今天');

console.log('life-summary.test.js: ok');
