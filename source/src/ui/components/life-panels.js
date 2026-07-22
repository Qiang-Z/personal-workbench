(function(global){
  function badge(text, bg, fg){ return global.WorkbenchPanelKit ? global.WorkbenchPanelKit.badge(text, bg, fg) : ('<span class="tag" style="background:'+bg+';color:'+fg+'">'+text+'</span>'); }
  var legacyBooks = typeof global.renderBooks==='function' ? global.renderBooks : null;
  var legacyTravels = typeof global.renderTravels==='function' ? global.renderTravels : null;
  var legacyAnniversaries = typeof global.renderAnniversaries==='function' ? global.renderAnniversaries : null;
  global.renderBooksPanel = function(){
    if(!legacyBooks) return '';
    var bk=global.WorkbenchLifeSummary.bookSummary();
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>📚 阅读状态总览</h2></div><div class="meta">'
      + badge('总数 '+bk.total,'#f59e0b22','var(--life)')
      + badge('在读 '+bk.reading,'#10b98122','#10b981')
      + badge('已读 '+bk.done,'#6366f122','#6366f1')
      + badge('待读 '+bk.wishlist,'#94a3b822','#475569')
      + '</div></div>';
    return head + legacyBooks();
  };
  global.renderTravelsPanel = function(){
    if(!legacyTravels) return '';
    var tv=global.WorkbenchLifeSummary.travelSummary();
    var bal=tv.budgetTotal-tv.spentTotal;
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>🧳 出行概览</h2></div><div class="meta">'
      + badge('总行程 '+tv.total,'#f59e0b22','var(--life)')
      + badge('未出发 '+tv.upcoming,'#6366f122','#6366f1')
      + badge('进行中 '+tv.ongoing,'#10b98122','#10b981')
      + badge('预算结余 '+bal.toFixed(0),(bal>=0?'#10b98122':'#ef444422'),(bal>=0?'#10b981':'#ef4444'))
      + '</div></div>';
    return head + legacyTravels();
  };
  global.renderAnniversariesPanel = function(){
    if(!legacyAnniversaries) return '';
    var an=global.WorkbenchLifeSummary.anniversarySummary();
    var near=an.next&&an.next.item ? '最近 '+(global.esc?global.esc(an.next.item.name):an.next.item.name)+' · '+an.next.days+' 天后' : '最近一项待补充';
    var head='<div class="panel" style="margin-bottom:14px"><div class="sec-head"><h2>🎉 纪念日概览</h2></div><div class="meta">'
      + badge('总数 '+an.total,'#f59e0b22','var(--life)')
      + badge('7天内 '+an.upcoming7,'#ef444422','#ef4444')
      + badge('30天内 '+an.upcoming30,'#6366f122','#6366f1')
      + '<span class="tag">'+near+'</span>'
      + '</div></div>';
    return head + legacyAnniversaries();
  };
})(window);
