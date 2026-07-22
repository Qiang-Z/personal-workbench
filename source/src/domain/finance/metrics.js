(function(global){
  function data(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function today(){ return typeof global.todayStr==='function' ? global.todayStr() : new Date().toISOString().slice(0,10); }
  function addDays(ds, amount){
    var d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+amount);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function monthKey(ds){ return String(ds||today()).slice(0,7); }
  function shiftMonth(key, amount){
    var parts=key.split('-'), d=new Date(+parts[0],+parts[1]-1+amount,1);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function matchesSearch(f){
    return typeof global.kwOf==='function' ? global.kwOf((f.category||'')+' '+(f.note||'')) : true;
  }
  function isActual(f){
    return !!f && !f.gen && f.status!=='planned' && f.status!=='skipped' && !!f.date && f.date<=today();
  }
  function isPending(f){
    if(!f||!f.date) return false;
    if(f.gen) return (f.planState||'pending')==='pending';
    return f.date>today() && f.status!=='skipped';
  }
  function actualRecords(opts){
    opts=opts||{};
    return (data().finances||[]).filter(function(f){ return isActual(f)&&(!opts.search||matchesSearch(f)); })
      .slice().sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); });
  }
  function plannedRecords(days){
    var end=addDays(today(),days==null?30:days);
    return (data().finances||[]).filter(function(f){ return isPending(f)&&f.date<=end; })
      .slice().sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); });
  }
  function totals(records){
    var inc=0,exp=0;
    (records||[]).forEach(function(f){ if(f.type==='income')inc+=+f.amount||0;else exp+=+f.amount||0; });
    var balance=inc-exp;
    return {records:records||[],income:inc,expense:exp,balance:balance,saveRate:inc>0?balance/inc*100:0};
  }
  function financeTotals(){ return totals(actualRecords({search:true})); }
  function monthSummary(key){
    key=key||monthKey();
    var summary=totals(actualRecords().filter(function(f){ return monthKey(f.date)===key; }));
    summary.month=key;
    return summary;
  }
  function periodRecords(period,type){
    var current=monthKey(), key=period==='last'?shiftMonth(current,-1):current;
    return actualRecords({search:true}).filter(function(f){
      var inPeriod=period==='all'||monthKey(f.date)===key;
      return inPeriod&&(type==='all'||!type||f.type===type);
    });
  }
  function aggregate(view){
    var map={};
    actualRecords().forEach(function(f){
      var k=view==='year'?f.date.slice(0,4):f.date.slice(0,7);
      if(!map[k])map[k]={inc:0,exp:0};
      if(f.type==='income')map[k].inc+=+f.amount||0;else map[k].exp+=+f.amount||0;
    });
    var keys=Object.keys(map).sort();
    if(view==='month')keys=keys.slice(-12);
    return {map:map,keys:keys};
  }
  function categorySummary(key){
    var map={};
    monthSummary(key).records.forEach(function(f){
      var c=f.category||'其他';if(!map[c])map[c]={income:0,expense:0};
      if(f.type==='income')map[c].income+=+f.amount||0;else map[c].expense+=+f.amount||0;
    });
    return Object.keys(map).map(function(name){ return {name:name,income:map[name].income,expense:map[name].expense}; })
      .sort(function(a,b){ return b.expense-a.expense; });
  }
  function budgetConfig(){
    var d=data();if(!d.prefs||typeof d.prefs!=='object')d.prefs={};
    if(!d.prefs.financeConfig||typeof d.prefs.financeConfig!=='object')d.prefs.financeConfig={categoryBudgets:{}};
    if(!d.prefs.financeConfig.categoryBudgets||typeof d.prefs.financeConfig.categoryBudgets!=='object')d.prefs.financeConfig.categoryBudgets={};
    return {total:+d.monthlyBudget||0,categories:d.prefs.financeConfig.categoryBudgets};
  }
  function budgetSummary(key){
    var cfg=budgetConfig(), month=monthSummary(key), categoryActual={};
    categorySummary(key).forEach(function(c){categoryActual[c.name]=c.expense;});
    var categories=Object.keys(cfg.categories).filter(function(k){return +cfg.categories[k]>0;}).map(function(name){
      var budget=+cfg.categories[name]||0,spent=+categoryActual[name]||0;
      return {name:name,budget:budget,spent:spent,left:budget-spent,pct:budget?Math.round(spent/budget*100):0};
    }).sort(function(a,b){return b.pct-a.pct;});
    return {total:cfg.total,spent:month.expense,left:cfg.total-month.expense,pct:cfg.total?Math.round(month.expense/cfg.total*100):0,categories:categories};
  }
  function recurringTemplates(){
    return (data().finances||[]).filter(function(f){return !f.gen&&(f.recur==='month'||f.recur==='year');})
      .slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date));});
  }
  function fundSummary(){
    var fs=(data().funds||[]).filter(function(f){ return typeof global.kwOf==='function' ? global.kwOf((f.name||'')+' '+(f.code||'')+' '+(f.type||'')) : true; });
    var up=0,down=0,holdTot=0;
    fs.forEach(function(f){
      var c=typeof global.dailyChg==='function'?global.dailyChg(f):0;if(c>0)up++;else if(c<0)down++;
      var p=typeof global.holdProfit==='function'?global.holdProfit(f):null;if(p!=null)holdTot+=p;
    });
    var marketValue=fs.reduce(function(s,f){return s+(typeof global.fundValue==='function'?global.fundValue(f):0);},0);
    return {funds:fs,up:up,down:down,holdTot:holdTot,marketValue:marketValue,holding:fs.filter(function(f){return +f.shares>0;}),watch:fs.filter(function(f){return !(+f.shares>0);})};
  }
  global.WorkbenchFinanceMetrics={
    today:today,monthKey:monthKey,shiftMonth:shiftMonth,isActual:isActual,isPending:isPending,
    actualRecords:actualRecords,plannedRecords:plannedRecords,financeTotals:financeTotals,monthSummary:monthSummary,
    periodRecords:periodRecords,aggregate:aggregate,categorySummary:categorySummary,budgetConfig:budgetConfig,
    budgetSummary:budgetSummary,recurringTemplates:recurringTemplates,fundSummary:fundSummary
  };
})(window);
