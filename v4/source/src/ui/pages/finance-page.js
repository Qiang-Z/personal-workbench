(function(global){
  function chgColor(x){ return x>=0 ? 'var(--up)' : 'var(--down)'; }
  global.finAggChart = function(view){
    var agg=global.WorkbenchFinanceMetrics.aggregate(view);
    var map=agg.map, keys=agg.keys;
    if(!keys.length) return '';
    var W=580,H=170,padL=34,padR=12,padT=28,padB=26;
    var maxAll=Math.max.apply(null, keys.map(function(k){ return Math.max(map[k].inc,map[k].exp); }).concat([1]));
    var bw=(W-padL-padR)/keys.length;
    var y=function(v){ return padT+(H-padT-padB)*(1-v/maxAll); };
    var grid=''; var lines=3;
    for(var g=0; g<=lines; g++){
      var gv=maxAll*g/lines, gy=y(gv);
      grid += '<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4"/><text x="'+(padL-6)+'" y="'+(gy+4)+'" text-anchor="end" font-size="9" fill="var(--muted)">'+gv.toFixed(0)+'</text>';
    }
    var bars='';
    keys.forEach(function(k,i){
      var x0=padL+bw*i+bw*0.16, bw2=bw*0.62;
      var hi=Math.max(0,H-padB-y(map[k].inc)), he=Math.max(0,H-padB-y(map[k].exp));
      bars += '<rect x="'+x0.toFixed(1)+'" y="'+y(map[k].inc).toFixed(1)+'" width="'+bw2.toFixed(1)+'" height="'+hi.toFixed(1)+'" rx="3" fill="#10b981" opacity="0.85"/>';
      bars += '<rect x="'+(x0+bw2+3).toFixed(1)+'" y="'+y(map[k].exp).toFixed(1)+'" width="'+bw2.toFixed(1)+'" height="'+he.toFixed(1)+'" rx="3" fill="#ef4444" opacity="0.85"/>';
      var lbl=view==='year'?k:k.slice(2);
      bars += '<text x="'+(padL+bw*i+bw/2).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle" font-size="10" fill="var(--muted)">'+lbl+'</text>';
    });
    return '<div style="margin-top:14px;overflow:hidden;border-radius:12px;background:var(--panel-2);padding:10px 6px 4px"><svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block" role="img" aria-label="收支趋势"><rect x="14" y="8" width="10" height="10" rx="2" fill="#10b981"/><text x="28" y="17" font-size="10" fill="var(--muted)">收入</text><rect x="74" y="8" width="10" height="10" rx="2" fill="#ef4444"/><text x="88" y="17" font-size="10" fill="var(--muted)">支出</text>'+grid+bars+'</svg></div>';
  };
  global.finAggTable = function(view){
    var agg=global.WorkbenchFinanceMetrics.aggregate(view);
    var map=agg.map, keys=agg.keys;
    if(!keys.length) return '';
    return keys.slice().reverse().map(function(k){ var m=map[k], bal=m.inc-m.exp; return '<div class="item"><div class="body"><div class="title">'+k+'</div><div class="meta"><span class="tag" style="background:#10b98122;color:#10b981">收 '+m.inc.toFixed(0)+'</span><span class="tag" style="background:#ef444422;color:#ef4444">支 '+m.exp.toFixed(0)+'</span><span class="tag" style="background:'+(bal>=0?'#10b98122':'#ef444422')+';color:'+(bal>=0?'#10b981':'#ef4444')+'">结余 '+(bal>=0?'+':'')+bal.toFixed(0)+'</span></div></div></div>'; }).join('');
  };
  global.renderFinances = function(){
    var info=global.WorkbenchFinanceMetrics.financeTotals();
    var fs=info.records, inc=info.income, exp=info.expense, bal=info.balance, saveRate=info.saveRate;
    var html='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>💵 收支记录</h2><div class="chips"><span class="ctab '+(global.finView==='month'?'on':'')+'" onclick="setFinView(\'month\')">按月</span><span class="ctab '+(global.finView==='year'?'on':'')+'" onclick="setFinView(\'year\')">按年</span></div><button class="btn" onclick="exportCSV()">⬇ CSV</button><button class="btn" onclick="setBudget()">⚙ 预算</button><button class="btn primary" onclick="openFinanceForm()">＋ 记一笔</button></div>';
    html+='<div class="grid cards" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">';
    html+='<div class="card finance"><div class="t">总收入</div><div class="n" style="color:#10b981">'+inc.toFixed(2)+'</div><div class="d">收入合计(元)</div></div>';
    html+='<div class="card finance"><div class="t">总支出</div><div class="n" style="color:#ef4444">'+exp.toFixed(2)+'</div><div class="d">支出合计(元)</div></div>';
    html+='<div class="card finance"><div class="t">结余</div><div class="n" style="color:'+(bal>=0?'#10b981':'#ef4444')+'">'+(bal>=0?'+':'-')+Math.abs(bal).toFixed(2)+'</div><div class="d">收入 − 支出(元)</div></div>';
    html+='<div class="card finance"><div class="t">储蓄率</div><div class="n" style="color:'+(saveRate>=20?'#10b981':saveRate>=0?'#f59e0b':'#ef4444')+'">'+saveRate.toFixed(1)+'%</div><div class="d">结余 / 收入 · 建议 ≥20%</div></div>';
    html+='</div>';
    if(((global.data&&global.data.finances)||[]).some(function(f){ return f.gen; })) html+='<div class="d" style="margin-top:8px">💡 含 <b>🔁 自动</b> 生成的计划收支（由「每月/每年」重复条目滚动展开，最多 18 个月 / 5 年）。</div>';
    html+='<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>📊 收支趋势（'+(global.finView==='month'?'按月':'按年')+'）</h2></div>';
    html+=global.finAggChart(global.finView);
    html+='<div class="list">'+global.finAggTable(global.finView)+'</div></div>';
    var catMap={};
    fs.forEach(function(f){ var c=f.category||'其他'; if(!catMap[c]) catMap[c]={inc:0,exp:0}; if(f.type==='income') catMap[c].inc+=+f.amount||0; else catMap[c].exp+=+f.amount||0; });
    var cats=Object.keys(catMap);
    if(cats.length){
      var expTotal=cats.reduce(function(s,c){ return s+catMap[c].exp; },0)||1;
      var palette=['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6','#64748b','#f97316'];
      var sortedCats=cats.slice().sort(function(a,b){ return catMap[b].exp-catMap[a].exp; });
      var acc=0, R=26, C=2*Math.PI*R;
      var segs=sortedCats.map(function(c,idx){ var v=catMap[c].exp; if(v<=0) return ''; var len=v/expTotal*C; var seg='<circle r="'+R+'" cx="40" cy="40" fill="none" stroke="'+palette[idx%palette.length]+'" stroke-width="14" stroke-dasharray="'+len+' '+(C-len)+'" stroke-dashoffset="'+(-acc)+'" transform="rotate(-90 40 40)"/>'; acc+=len; return seg; }).join('');
      html+='<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>🏷️ 分类汇总</h2></div><div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">';
      if(expTotal>0) html+='<svg width="80" height="80" viewBox="0 0 80 80" aria-label="支出分类占比">'+segs+'</svg>';
      html+='<div class="list" style="flex:1;min-width:260px">'+sortedCats.map(function(c,idx){ var e=catMap[c].exp, pct=e/expTotal*100; return '<div class="item"><div class="body"><div class="title"><span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:'+palette[idx%palette.length]+';margin-right:8px"></span>'+global.esc(c)+'</div><div class="meta"><span class="tag">支出 '+e.toFixed(2)+'</span><span class="tag">占比 '+pct.toFixed(1)+'%</span>' + (catMap[c].inc?'<span class="tag">收入 '+catMap[c].inc.toFixed(2)+'</span>':'') + '</div></div></div>'; }).join('')+'</div></div></div>';
    }
    html+='<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>📒 明细</h2></div>';
    html+=fs.length?'<div class="list">'+fs.slice().reverse().map(function(f){ return '<div class="item"><div class="body"><div class="title">'+(f.type==='income'?'💵':'💸')+' '+(global.esc(f.category||'未分类'))+' <span class="tag" style="background:#ec489922;color:var(--finance)">'+global.esc(f.date)+'</span> <span class="tag" style="background:'+(f.type==='income'?'#10b98122;color:#10b981':'#ef444422;color:#ef4444')+'">'+(f.type==='income'?'+':'-')+Math.abs(+f.amount||0).toFixed(2)+'</span> '+(f.gen?'<span class="tag" style="background:#6366f122;color:#6366f1">🔁 自动</span>':'')+'</div>'+(f.note?'<div class="meta">'+global.esc(f.note)+'</div>':'')+'</div><div class="acts"><button class="icon-btn" onclick="openFinanceForm(\''+f.id+'\')">✏️</button><button class="icon-btn" onclick="delFinance(\''+f.id+'\')">🗑️</button></div></div>'; }).join('')+'</div>':'<div class="empty">还没有记录，点「＋ 记一笔」开始吧。</div>';
    html+='</div>';
    return html;
  };
  global.renderFunds = function(){
    var s=global.WorkbenchFinanceMetrics.fundSummary();
    var fs=s.funds, up=s.up, down=s.down, holdTot=s.holdTot, mktTot=s.marketValue;
    var html=global.renderFinances()+'<div class="grid cards">';
    html+='<div class="card finance"><div class="t">跟踪基金</div><div class="n">'+fs.length+'</div><div class="d">今日涨 '+up+' · 跌 '+down+'</div></div>';
    html+='<div class="card finance"><div class="t">基金市值(持有)</div><div class="n" style="color:var(--finance)">'+mktTot.toFixed(2)+'</div><div class="d">份额×最新净值(元)</div></div>';
    html+='<div class="card finance"><div class="t">持仓总收益</div><div class="n" style="color:'+(holdTot>=0?'var(--up)':'var(--down)')+'">'+(holdTot>=0?'+':'-')+Math.abs(holdTot).toFixed(2)+'</div><div class="d">成本持仓盈亏(元)</div></div>';
    html+='</div><div style="font-size:12px;color:var(--muted);margin:10px 2px 0">颜色：<span style="color:var(--up);font-weight:700">红=涨</span> · <span style="color:var(--down);font-weight:700">绿=跌</span>（A股习惯）</div>';
    html+='<div class="panel" style="margin-top:14px"><div class="sec-head"><h2>💰 基金持仓 / 自选</h2><button class="btn primary" onclick="openFundForm()">＋ 添加基金</button></div>';
    if(!fs.length) html+='<div class="empty">还没有基金。添加你关注的基金（名称/代码/类型），定期「记录净值」即可看当日涨幅与走势。</div>';
    else {
      fs.forEach(function(f){
        var dc=global.dailyChg(f), rc=global.rangeChg(f), hp=global.holdProfit(f), hr=global.holdRet(f), latest=global.fundLatest(f), mv=global.fundValue(f);
        html+='<div class="item"><div class="body"><div class="title">'+global.esc(f.name)+' <span class="tag" style="background:#ec489922;color:var(--finance)">'+global.esc(f.code||'—')+'</span> '+global.esc(f.type||'')+'</div><div class="meta"><span class="tag">最新净值 '+(latest?latest.toFixed(4):'—')+'</span><span class="tag" style="background:'+chgColor(dc)+'22;color:'+chgColor(dc)+'">当日 '+global.fmtPct(dc)+'</span><span class="tag" style="background:'+chgColor(rc)+'22;color:'+chgColor(rc)+'">区间 '+global.fmtPct(rc)+'</span>'+(f.shares?'<span class="tag" style="background:#10b98122;color:#10b981">市值 '+mv.toFixed(2)+'</span>':'')+(hp!==null?'<span class="tag" style="background:'+chgColor(hp)+'22;color:'+chgColor(hp)+'">持仓 '+(hp>=0?'+':'')+hp.toFixed(2)+' ('+global.fmtPct(hr)+')</span>':'')+'</div>'+(typeof global.sparkline==='function'?global.sparkline(f.records):'')+'</div><div class="acts"><button class="icon-btn" title="记录净值" onclick="openNavForm(\''+f.id+'\')">📈</button><button class="icon-btn" onclick="openFundForm(\''+f.id+'\')">✏️</button><button class="icon-btn" onclick="delFund(\''+f.id+'\')">🗑️</button></div></div>';
        if(f.records&&f.records.length){
          var rs=global.fundRecs(f).slice().reverse();
          html+='<div class="list" style="margin:10px 0 16px">'+rs.slice(0,8).map(function(r){ return '<div class="item"><div class="body"><div class="title">📈 '+global.esc(f.name)+' · '+global.esc(r.date)+' <span class="tag" style="background:#ec489922;color:var(--finance)">净值 '+(+r.nav).toFixed(4)+'</span></div></div></div>'; }).join('')+'</div>';
        }
      });
    }
    html+='</div>';
    return html;
  };
})(window);
(function(global){
  if(global.WorkbenchModuleRegistry && typeof global.WorkbenchModuleRegistry.register==='function'){
    global.WorkbenchModuleRegistry.register('finance', function(){ return (typeof global.renderFunds==='function') ? global.renderFunds() : ''; });
  }
})(window);
