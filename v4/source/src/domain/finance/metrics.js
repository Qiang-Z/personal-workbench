(function(global){
  function data(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function filteredFinances(){
    var d=data();
    return (d.finances||[]).filter(function(f){ return typeof global.kwOf==='function' ? global.kwOf((f.category||'')+' '+(f.note||'')) : true; });
  }
  function financeTotals(){
    var fs=filteredFinances().slice().sort(function(a,b){ return a.date.localeCompare(b.date); });
    var inc=0, exp=0;
    fs.forEach(function(f){ if(f.type==='income') inc += +f.amount||0; else exp += +f.amount||0; });
    var bal=inc-exp;
    var saveRate=inc>0?(bal/inc*100):0;
    return {records:fs, income:inc, expense:exp, balance:bal, saveRate:saveRate};
  }
  function aggregate(view){
    var fs=(data().finances||[]);
    var map={};
    fs.forEach(function(f){
      var k=view==='year'?f.date.slice(0,4):f.date.slice(0,7);
      if(!map[k]) map[k]={inc:0,exp:0};
      if(f.type==='income') map[k].inc += +f.amount||0; else map[k].exp += +f.amount||0;
    });
    var keys=Object.keys(map).sort();
    if(view==='month') keys=keys.slice(-12);
    return {map:map,keys:keys};
  }
  function fundSummary(){
    var fs=(data().funds||[]).filter(function(f){ return typeof global.kwOf==='function' ? global.kwOf((f.name||'')+' '+(f.code||'')+' '+(f.type||'')) : true; });
    var up=0, down=0, holdTot=0;
    fs.forEach(function(f){
      var c=typeof global.dailyChg==='function' ? global.dailyChg(f) : 0;
      if(c>0) up++; else if(c<0) down++;
      var p=typeof global.holdProfit==='function' ? global.holdProfit(f) : null;
      if(p) holdTot += p;
    });
    var mktTot=fs.reduce(function(s,f){ return s + (typeof global.fundValue==='function' ? global.fundValue(f) : 0); },0);
    return {funds:fs, up:up, down:down, holdTot:holdTot, marketValue:mktTot};
  }
  global.WorkbenchFinanceMetrics = {
    financeTotals: financeTotals,
    aggregate: aggregate,
    fundSummary: fundSummary
  };
})(window);
