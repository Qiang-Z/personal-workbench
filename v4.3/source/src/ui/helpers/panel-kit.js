(function(global){
  function esc(s){ return global.esc ? global.esc(s) : String(s == null ? '' : s); }
  function badge(text, bg, fg){ return '<span class="tag" style="background:'+bg+';color:'+fg+'">'+esc(text)+'</span>'; }
  function summaryCard(cls, title, value, desc, accent){
    return '<div class="card '+cls+'">'
      + '<div class="t">'+title+'</div>'
      + '<div class="n"'+(accent?' style="color:'+accent+'"':'')+'>'+value+'</div>'
      + '<div class="d">'+desc+'</div></div>';
  }
  function summaryGrid(cards, extraStyle){
    return '<div class="grid cards"'+(extraStyle?' style="'+extraStyle+'"':'')+'>'+cards.join('')+'</div>';
  }
  function infoPanel(title, body, opts){
    opts = opts || {};
    return '<div class="panel"'+(opts.style?' style="'+opts.style+'"':'')+'><div class="sec-head"><h2>'+title+'</h2>'+(opts.actions||'')+'</div>'+(body||'')+'</div>';
  }
  function empty(text, style){
    return '<div class="empty"'+(style?' style="'+style+'"':'')+'>'+esc(text)+'</div>';
  }
  function listOrEmpty(itemsHtml, emptyText){
    return itemsHtml && String(itemsHtml).trim() ? itemsHtml : empty(emptyText || '暂无内容');
  }
  function chips(items, opts){
    opts = opts || {};
    return '<div class="chips"'+(opts.style?' style="'+opts.style+'"':'')+'>'+(items||[]).map(function(it){
      return '<span class="ctab '+(it.active?'on':'')+'"'+(it.onClick?' onclick="'+it.onClick+'"':'')+'>'+(it.label||'')+'</span>';
    }).join('')+'</div>';
  }
  function toolbar(items, opts){
    opts = opts || {};
    return '<div class="chips"'+(opts.style?' style="'+opts.style+'"':'')+'>'+(items||[]).map(function(it){
      var cls = it.primary ? 'btn primary' : 'btn';
      return '<button class="'+cls+'"'+(it.onClick?' onclick="'+it.onClick+'"':'')+'>'+(it.label||'')+'</button>';
    }).join('')+'</div>';
  }
  function metaRow(parts, style){
    return '<div class="meta"'+(style?' style="'+style+'"':'')+'>'+(parts||[]).join('')+'</div>';
  }
  function list(itemsHtml, opts){
    opts = opts || {};
    return '<div class="list"'+(opts.style?' style="'+opts.style+'"':'')+'>'+itemsHtml+'</div>';
  }
  function collapsible(key, title, body, opts){
    opts = opts || {};
    var collapsed = opts.collapsed ? ' collapsed' : '';
    var style = opts.style ? ' style="'+opts.style+'"' : '';
    var h = '<div class="panel collapsible'+collapsed+'"'+style+' data-collapse="'+key+'">';
    h += '<div class="panel-h" onclick="toggleCollapse(\''+key+'\')"><h2>'+title+'</h2><span style="display:flex;align-items:center;gap:8px">'+(opts.headerActions||'')+'<span class="caret">▾</span></span></div>';
    h += '<div class="panel-b">'+(body||'')+'</div></div>';
    return h;
  }
  global.WorkbenchPanelKit = {
    esc: esc,
    badge: badge,
    summaryCard: summaryCard,
    summaryGrid: summaryGrid,
    infoPanel: infoPanel,
    empty: empty,
    listOrEmpty: listOrEmpty,
    chips: chips,
    toolbar: toolbar,
    metaRow: metaRow,
    list: list,
    collapsible: collapsible
  };
})(window);
