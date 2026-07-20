(function(global){
  function data(){ return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{}); }
  function metrics(){ return global.WorkbenchFinanceMetrics; }
  function esc(s){ return global.esc?global.esc(s):String(s==null?'':s); }
  function money(v){ return (+v||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function signMoney(v){ return (v>=0?'+':'-')+money(Math.abs(v)); }
  function chgColor(x){ return x>=0?'var(--up)':'var(--down)'; }
  function effortText(current,last){
    if(!last) return '上月暂无可比较数据';
    var diff=current-last,pct=Math.abs(diff/last*100);
    return (diff>=0?'较上月增加 ':'较上月减少 ')+pct.toFixed(0)+'%';
  }
  function renderTabs(){
    var items=[
      {id:'overview',label:'☀️ 财务首页'},
      {id:'records',label:'📒 收支明细'},
      {id:'budget',label:'🎯 预算与账单'},
      {id:'funds',label:'📈 基金'}
    ];
    var html='<div class="chips finance-tabs">';
    items.forEach(function(it){html+='<span class="ctab '+(global.financeTab===it.id?'on':'')+'" onclick="setFinanceTab(\''+it.id+'\')">'+it.label+'</span>';});
    return html+'</div>';
  }
  function progress(label,spent,budget){
    var pct=budget?Math.round(spent/budget*100):0,left=budget-spent;
    return '<div class="finance-budget-row"><div><b>'+esc(label)+'</b><span>'+money(spent)+' / '+money(budget)+'</span></div>'
      +'<div class="finance-progress"><i class="'+(pct>100?'over':'')+'" style="width:'+Math.min(100,Math.max(0,pct))+'%"></i></div>'
      +'<small>'+(left>=0?'剩余 '+money(left):'超出 '+money(Math.abs(left)))+' 元</small></div>';
  }
  function renderBudgetPanel(compact){
    var b=metrics().budgetSummary();
    if(!b.total){
      return '<section class="panel finance-budget-empty"><div><span>本月预算</span><h2>还没有设置预算</h2><p>设置一个适合自己的额度，用来了解节奏，不做强制考核。</p></div><button class="btn primary" onclick="openFinanceBudgetForm()">设置预算</button></section>';
    }
    var html='<section class="panel"><div class="finance-panel-head"><div><span>本月预算</span><h2>剩余 '+money(b.left)+' 元</h2></div><button class="btn small" onclick="openFinanceBudgetForm()">调整</button></div>'
      +progress('总预算',b.spent,b.total);
    if(!compact&&b.categories.length){
      html+='<div class="finance-category-budgets">';
      b.categories.forEach(function(c){html+=progress(c.name,c.spent,c.budget);});
      html+='</div>';
    }
    return html+'</section>';
  }
  function recordRow(f){
    var project=(data().rprojects||[]).find(function(p){return p.id===f.rprojectId;});
    return '<div class="item finance-record"><div class="finance-record-icon '+f.type+'">'+(f.type==='income'?'收':'支')+'</div><div class="body">'
      +'<div class="title">'+esc(f.category||'未分类')+' <b class="finance-amount '+f.type+'">'+(f.type==='income'?'+':'-')+money(f.amount)+'</b></div>'
      +'<div class="meta"><span>'+esc(f.date)+'</span>'+(project?'<span>关联 '+esc(project.title)+'</span>':'')+(f.note?'<span>'+esc(f.note)+'</span>':'')+'</div></div>'
      +'<div class="acts"><button class="icon-btn" onclick="openFinanceForm(\''+f.id+'\')" title="编辑">✏️</button><button class="icon-btn" onclick="delFinance(\''+f.id+'\')" title="删除">🗑️</button></div></div>';
  }
  function billState(date){
    var t=metrics().today();if(date<t)return {label:'待确认',cls:'overdue'};if(date===t)return {label:'今天',cls:'today'};
    var days=typeof global.daysBetween==='function'?global.daysBetween(t,date):0;
    return {label:days+' 天后',cls:days<=7?'soon':''};
  }
  function renderUpcoming(limit){
    var list=metrics().plannedRecords(30);if(limit)list=list.slice(0,limit);
    if(!list.length)return '<div class="empty">未来 30 天没有待确认的固定收支。</div>';
    return '<div class="finance-bills">'+list.map(function(f){
      var state=billState(f.date);
      return '<div class="finance-bill '+state.cls+'"><div class="finance-bill-date"><b>'+esc(f.date.slice(5))+'</b><small>'+state.label+'</small></div>'
        +'<div class="finance-bill-body"><b>'+esc(f.category||'固定收支')+'</b><small>'+(f.type==='income'?'预计收入':'预计支出')+' · '+money(f.amount)+' 元</small></div>'
        +'<div class="finance-bill-actions"><button class="btn small primary" onclick="confirmFinancePlan(\''+f.id+'\')">确认入账</button>'
        +'<button class="btn small" onclick="openFinancePlanSource(\''+f.id+'\')">调整</button><button class="btn small quiet" onclick="skipFinancePlan(\''+f.id+'\')">本次忽略</button></div></div>';
    }).join('')+'</div>';
  }
  function renderCategorySummary(){
    var cats=metrics().categorySummary().filter(function(c){return c.expense>0;}).slice(0,5);
    if(!cats.length)return '<div class="empty">本月还没有支出分类。</div>';
    var total=cats.reduce(function(s,c){return s+c.expense;},0)||1;
    return '<div class="finance-category-list">'+cats.map(function(c,i){
      return '<div class="finance-category-row"><span class="finance-cat-dot c'+i+'"></span><b>'+esc(c.name)+'</b><div class="finance-mini-track"><i style="width:'+Math.round(c.expense/total*100)+'%"></i></div><span>'+money(c.expense)+'</span></div>';
    }).join('')+'</div>';
  }
  global.finAggChart=function(view){
    var agg=metrics().aggregate(view),map=agg.map,keys=agg.keys;if(!keys.length)return '<div class="empty">积累两个月记录后，这里会显示趋势。</div>';
    var W=580,H=170,padL=34,padR=12,padT=28,padB=26,maxAll=Math.max.apply(null,keys.map(function(k){return Math.max(map[k].inc,map[k].exp);}).concat([1]));
    var bw=(W-padL-padR)/keys.length,y=function(v){return padT+(H-padT-padB)*(1-v/maxAll);},grid='',bars='',lines=3;
    for(var g=0;g<=lines;g++){var gv=maxAll*g/lines,gy=y(gv);grid+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"/><text x="'+(padL-6)+'" y="'+(gy+4)+'" text-anchor="end" font-size="9" fill="var(--muted)">'+gv.toFixed(0)+'</text>';}
    keys.forEach(function(k,i){var x0=padL+bw*i+bw*.16,w=bw*.3,hi=Math.max(0,H-padB-y(map[k].inc)),he=Math.max(0,H-padB-y(map[k].exp));bars+='<rect x="'+x0.toFixed(1)+'" y="'+y(map[k].inc).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+hi.toFixed(1)+'" rx="3" fill="#10b981"/><rect x="'+(x0+w+3).toFixed(1)+'" y="'+y(map[k].exp).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+he.toFixed(1)+'" rx="3" fill="#ef4444"/><text x="'+(padL+bw*i+bw/2).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" font-size="10" fill="var(--muted)">'+(view==='year'?k:k.slice(2))+'</text>';});
    return '<div class="finance-chart"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="实际收支趋势"><rect x="14" y="8" width="9" height="9" rx="2" fill="#10b981"/><text x="27" y="16" font-size="10" fill="var(--muted)">收入</text><rect x="72" y="8" width="9" height="9" rx="2" fill="#ef4444"/><text x="85" y="16" font-size="10" fill="var(--muted)">支出</text>'+grid+bars+'</svg></div>';
  };
  global.finAggTable=function(view){
    var agg=metrics().aggregate(view);return agg.keys.slice().reverse().map(function(k){var m=agg.map[k],bal=m.inc-m.exp;return '<div class="item"><div class="body"><div class="title">'+k+'</div><div class="meta"><span>收 '+money(m.inc)+'</span><span>支 '+money(m.exp)+'</span><span>结余 '+signMoney(bal)+'</span></div></div></div>';}).join('');
  };
  function renderOverview(){
    var current=metrics().monthSummary(),last=metrics().monthSummary(metrics().shiftMonth(current.month,-1));
    var recent=current.records.slice().reverse().slice(0,5);
    return '<section class="finance-hero"><div><span>本月财务助手</span><h1>先看本月，再安排接下来的钱</h1><p>实际收支与未来计划分开统计，避免固定账单提前影响结余。</p></div><div><button class="btn" onclick="openFinanceForm(null,null,\'income\')">＋ 记收入</button><button class="btn primary" onclick="openFinanceForm(null,null,\'expense\')">＋ 记支出</button></div></section>'
      +'<div class="finance-summary-grid"><div class="finance-summary-card"><span>本月收入</span><b class="income">'+money(current.income)+'</b><small>'+effortText(current.income,last.income)+'</small></div>'
      +'<div class="finance-summary-card"><span>本月支出</span><b class="expense">'+money(current.expense)+'</b><small>'+effortText(current.expense,last.expense)+'</small></div>'
      +'<div class="finance-summary-card"><span>本月结余</span><b>'+signMoney(current.balance)+'</b><small>只统计已发生记录</small></div>'
      +'<div class="finance-summary-card"><span>待确认账单</span><b>'+metrics().plannedRecords(30).length+'</b><small>未来 30 天与已到期计划</small></div></div>'
      +'<div class="finance-home-grid"><div class="finance-home-main">'+renderBudgetPanel(true)
      +'<section class="panel"><div class="finance-panel-head"><div><span>实际收支</span><h2>近 12 个月趋势</h2></div><button class="text-action" onclick="setFinanceTab(\'records\')">查看明细 →</button></div>'+global.finAggChart('month')+'</section></div>'
      +'<div class="finance-home-side"><section class="panel"><div class="finance-panel-head"><div><span>本月支出</span><h2>主要分类</h2></div></div>'+renderCategorySummary()+'</section>'
      +'<section class="panel"><div class="finance-panel-head"><div><span>未来 30 天</span><h2>固定账单</h2></div><button class="text-action" onclick="setFinanceTab(\'budget\')">全部 →</button></div>'+renderUpcoming(4)+'</section></div></div>'
      +'<section class="panel finance-recent"><div class="finance-panel-head"><div><span>最近</span><h2>本月实际记录</h2></div><button class="btn small" onclick="setFinanceTab(\'records\')">全部明细</button></div>'+(recent.length?'<div class="list">'+recent.map(recordRow).join('')+'</div>':'<div class="empty">本月还没有实际收支记录。</div>')+'</section>';
  }
  function renderRecords(){
    var fs=metrics().periodRecords(global.financePeriod,global.financeType).slice().reverse();
    var summary={income:0,expense:0};fs.forEach(function(f){if(f.type==='income')summary.income+=+f.amount||0;else summary.expense+=+f.amount||0;});
    return '<section class="panel"><div class="finance-panel-head finance-record-head"><div><span>只展示已发生记录</span><h2>收支明细</h2></div><div><button class="btn" onclick="exportCSV()">导出 CSV</button><button class="btn primary" onclick="openFinanceForm(null,null,\'expense\')">＋ 记一笔</button></div></div>'
      +'<div class="finance-filter-row"><div class="chips"><span class="ctab '+(global.financePeriod==='month'?'on':'')+'" onclick="setFinancePeriod(\'month\')">本月</span><span class="ctab '+(global.financePeriod==='last'?'on':'')+'" onclick="setFinancePeriod(\'last\')">上月</span><span class="ctab '+(global.financePeriod==='all'?'on':'')+'" onclick="setFinancePeriod(\'all\')">全部</span></div>'
      +'<div class="chips"><span class="ctab '+(global.financeType==='all'?'on':'')+'" onclick="setFinanceType(\'all\')">全部</span><span class="ctab '+(global.financeType==='expense'?'on':'')+'" onclick="setFinanceType(\'expense\')">支出</span><span class="ctab '+(global.financeType==='income'?'on':'')+'" onclick="setFinanceType(\'income\')">收入</span></div></div>'
      +'<div class="finance-filter-summary"><span>收入 '+money(summary.income)+'</span><span>支出 '+money(summary.expense)+'</span><b>结余 '+signMoney(summary.income-summary.expense)+'</b></div>'
      +(fs.length?'<div class="list">'+fs.map(recordRow).join('')+'</div>':'<div class="empty">当前筛选条件下没有记录。</div>')+'</section>';
  }
  function renderBudgetPage(){
    var templates=metrics().recurringTemplates(),b=metrics().budgetSummary();
    var catHtml=b.categories.length?'<div class="finance-category-budgets">'+b.categories.map(function(c){return progress(c.name,c.spent,c.budget);}).join('')+'</div>':'<div class="empty">还没有分类预算。可以在“调整预算”中按“分类:金额”添加。</div>';
    var templateHtml=templates.length?'<div class="list">'+templates.map(function(f){return '<div class="item"><div class="body"><div class="title">'+esc(f.category||'固定收支')+' <span class="tag">'+(f.recur==='month'?'每月':'每年')+'</span></div><div class="meta"><span>'+esc(f.date)+'</span><span>'+(f.type==='income'?'收入 ':'支出 ')+money(f.amount)+'</span></div></div><div class="acts"><button class="icon-btn" onclick="openFinanceForm(\''+f.id+'\')">✏️</button><button class="icon-btn" onclick="delFinance(\''+f.id+'\')">🗑️</button></div></div>';}).join('')+'</div>':'<div class="empty">还没有固定收支。记账时选择“每月”或“每年”即可创建。</div>';
    return '<div class="finance-budget-grid"><div>'+renderBudgetPanel(false)
      +'<section class="panel"><div class="finance-panel-head"><div><span>按分类控制节奏</span><h2>分类预算</h2></div><button class="btn small" onclick="openFinanceBudgetForm()">调整预算</button></div>'+catHtml+'</section></div>'
      +'<div><section class="panel"><div class="finance-panel-head"><div><span>已到期与未来 30 天</span><h2>待确认账单</h2></div></div>'+renderUpcoming()+'</section>'
      +'<section class="panel"><div class="finance-panel-head"><div><span>自动生成待确认账单</span><h2>固定收支规则</h2></div><button class="btn small primary" onclick="openFinanceForm(null,null,\'expense\')">＋ 新建规则</button></div>'+templateHtml+'</section></div></div>';
  }
  function fundFreshness(f){
    var rs=(f.records||[]).slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date));});
    if(!rs.length)return '尚未记录净值';
    var last=rs[rs.length-1].date,days=typeof global.daysBetween==='function'?global.daysBetween(last,metrics().today()):0;
    return '更新于 '+last+(days>30?' · 建议更新':'');
  }
  function renderFundsPage(){
    var s=metrics().fundSummary(),fs=global.financeFundKind==='holding'?s.holding:(global.financeFundKind==='watch'?s.watch:s.funds);
    var list=fs.length?fs.map(function(f){
      var dc=global.dailyChg(f),hp=global.holdProfit(f),hr=global.holdRet(f),latest=global.fundLatest(f),mv=global.fundValue(f),rs=global.fundRecs(f).slice().reverse();
      return '<div class="finance-fund"><div class="finance-fund-main"><div><h3>'+esc(f.name)+' <span class="tag">'+esc(f.code||'—')+'</span></h3><small>'+esc(f.type||'')+' · '+fundFreshness(f)+'</small></div>'
        +'<div class="finance-fund-values"><span>最新净值 <b>'+(latest?latest.toFixed(4):'—')+'</b></span><span style="color:'+chgColor(dc)+'">当日 '+global.fmtPct(dc)+'</span>'+(+f.shares>0?'<span>市值 '+money(mv)+'</span>':'')+(hp!=null?'<span style="color:'+chgColor(hp)+'">持仓 '+signMoney(hp)+' ('+global.fmtPct(hr)+')</span>':'')+'</div></div>'
        +(typeof global.sparkline==='function'?global.sparkline(f.records):'')
        +'<div class="finance-fund-actions"><button class="btn small primary" onclick="openNavForm(\''+f.id+'\')">记录净值</button><button class="btn small" onclick="openFundForm(\''+f.id+'\')">编辑</button><button class="btn small quiet" onclick="delFund(\''+f.id+'\')">删除</button></div>'
        +(rs.length?'<details class="finance-fund-history"><summary>查看最近净值记录（'+rs.length+'）</summary><div>'+rs.slice(0,8).map(function(r){return '<span>'+esc(r.date)+' · '+(+r.nav).toFixed(4)+'</span>';}).join('')+'</div></details>':'')+'</div>';
    }).join(''):'<div class="empty">这里还没有基金。</div>';
    return '<div class="finance-summary-grid fund-summary"><div class="finance-summary-card"><span>持仓基金</span><b>'+s.holding.length+'</b><small>有份额记录</small></div><div class="finance-summary-card"><span>自选基金</span><b>'+s.watch.length+'</b><small>仅关注</small></div><div class="finance-summary-card"><span>持仓市值</span><b>'+money(s.marketValue)+'</b><small>手动净值计算</small></div><div class="finance-summary-card"><span>持仓收益</span><b style="color:'+chgColor(s.holdTot)+'">'+signMoney(s.holdTot)+'</b><small>不构成投资建议</small></div></div>'
      +'<section class="panel"><div class="finance-panel-head"><div><span>数据保存在本机</span><h2>基金持仓与自选</h2></div><button class="btn primary" onclick="openFundForm()">＋ 添加基金</button></div>'
      +'<div class="chips finance-fund-filter"><span class="ctab '+(global.financeFundKind==='all'?'on':'')+'" onclick="setFinanceFundKind(\'all\')">全部</span><span class="ctab '+(global.financeFundKind==='holding'?'on':'')+'" onclick="setFinanceFundKind(\'holding\')">我的持仓</span><span class="ctab '+(global.financeFundKind==='watch'?'on':'')+'" onclick="setFinanceFundKind(\'watch\')">仅关注</span></div>'
      +'<div class="finance-fund-list">'+list+'</div></section>';
  }
  global.setFinanceTab=function(tab){global.financeTab=tab;global.render();};
  global.setFinancePeriod=function(period){global.financePeriod=period;global.render();};
  global.setFinanceType=function(type){global.financeType=type;global.render();};
  global.setFinanceFundKind=function(kind){global.financeFundKind=kind;global.render();};
  global.openFinanceBudgetForm=function(){
    var cfg=metrics().budgetConfig(),lines=Object.keys(cfg.categories).map(function(k){return k+':'+cfg.categories[k];});
    document.getElementById('fb_total').value=cfg.total||'';
    document.getElementById('fb_categories').value=lines.join('\n');
    document.getElementById('financeBudgetMask').classList.add('show');
    document.getElementById('fb_total').focus();
  };
  global.closeFinanceBudget=function(){document.getElementById('financeBudgetMask').classList.remove('show');};
  global.submitFinanceBudget=function(){
    var d=data(),total=parseFloat(document.getElementById('fb_total').value),categories={},lines=document.getElementById('fb_categories').value.split(/\n+/);
    lines.forEach(function(line){var p=line.split(/[:：]/),name=(p[0]||'').trim(),amount=parseFloat(p.slice(1).join(':'));if(name&&!isNaN(amount)&&amount>0)categories[name]=amount;});
    d.monthlyBudget=isNaN(total)||total<=0?null:total;if(!d.prefs)d.prefs={};if(!d.prefs.financeConfig)d.prefs.financeConfig={};d.prefs.financeConfig.categoryBudgets=categories;
    global.save();global.closeFinanceBudget();global.render();
  };
  global.confirmFinancePlan=function(id){
    var d=data(),f=(d.finances||[]).find(function(x){return x.id===id;});if(!f)return;
    if(f.gen){f.planState='confirmed';d.finances.push({id:global.uid(),date:metrics().today(),scheduledDate:f.date,type:f.type,category:f.category,amount:f.amount,note:f.note||'',recur:'',rprojectId:f.rprojectId||'',generatedFrom:f.tplId||f.id,status:'actual'});}
    else{f.scheduledDate=f.date;f.date=metrics().today();f.status='actual';}
    global.save();global.render();
  };
  global.skipFinancePlan=function(id){var f=(data().finances||[]).find(function(x){return x.id===id;});if(!f)return;if(f.gen)f.planState='skipped';else f.status='skipped';global.save();global.render();};
  global.openFinancePlanSource=function(id){var f=(data().finances||[]).find(function(x){return x.id===id;});global.openFinanceForm(f&&f.gen?(f.tplId||id):id);};
  global.renderFinanceModule=function(){
    if(!global.financeTab)global.financeTab='overview';if(!global.financePeriod)global.financePeriod='month';if(!global.financeType)global.financeType='all';if(!global.financeFundKind)global.financeFundKind='all';
    var body=global.financeTab==='records'?renderRecords():(global.financeTab==='budget'?renderBudgetPage():(global.financeTab==='funds'?renderFundsPage():renderOverview()));
    return renderTabs()+body;
  };
  global.renderFinances=renderRecords;
  global.renderFunds=global.renderFinanceModule;
  if(global.WorkbenchModuleRegistry&&typeof global.WorkbenchModuleRegistry.register==='function')global.WorkbenchModuleRegistry.register('finance',global.renderFinanceModule);
})(window);
