(function(global){
  function normalizeTitle(title){return String(title||'').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'').slice(0,80);}
  function itemKey(item){
    var text=String((item&&item.link)||'')+'|'+normalizeTitle(item&&item.title),hash=2166136261;
    for(var i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return 'n'+(hash>>>0).toString(36);
  }
  function dedupe(items){
    var map={},out=[];
    (items||[]).forEach(function(item){
      var normalized=normalizeTitle(item.title),key=normalized||itemKey(item),found=map[key];
      if(found){if(found.sources.indexOf(item.src||item.cat)<0)found.sources.push(item.src||item.cat);return;}
      var copy=Object.assign({},item,{key:itemKey(item),sources:[item.src||item.cat].filter(Boolean)});map[key]=copy;out.push(copy);
    });
    return out;
  }
  function search(items,keyword){
    var kw=String(keyword||'').trim().toLowerCase();if(!kw)return items||[];
    return (items||[]).filter(function(item){return String(item.title||'').toLowerCase().indexOf(kw)>=0||String(item.cat||'').toLowerCase().indexOf(kw)>=0;});
  }
  function focus(items,categories,state,limit){
    state=state||{read:{}};limit=limit||12;var unique=dedupe(items),groups={},seenOrder=[];
    unique.forEach(function(item){var cat=item.cat||'其他';if(!groups[cat]){groups[cat]=[];seenOrder.push(cat);}groups[cat].push(item);});
    var order=(categories||[]).filter(function(cat){return !!groups[cat];});
    seenOrder.forEach(function(cat){if(order.indexOf(cat)<0)order.push(cat);});
    Object.keys(groups).forEach(function(cat){groups[cat].sort(function(a,b){var ar=state.read&&state.read[a.key]?1:0,br=state.read&&state.read[b.key]?1:0;return ar-br||(b.date||0)-(a.date||0);});});
    var out=[],round=0,added=true;
    while(out.length<limit&&added){added=false;for(var i=0;i<order.length&&out.length<limit;i++){var item=groups[order[i]][round];if(item){out.push(item);added=true;}}round++;}
    return out;
  }
  function savedItems(state){
    return Object.keys((state&&state.saved)||{}).map(function(key){var item=state.saved[key];return Object.assign({},item,{key:key});}).sort(function(a,b){return (b.savedAt||0)-(a.savedAt||0);});
  }
  function sourceStats(feeds,status){
    var active=(feeds||[]).filter(function(f){return f.enabled!==false;}),ok=active.filter(function(f){return status&&status[f.id]===true;}).length,failed=active.filter(function(f){return status&&status[f.id]===false;}).length;
    return {active:active.length,ok:ok,failed:failed,pending:Math.max(0,active.length-ok-failed)};
  }
  global.WorkbenchNewsSummary={normalizeTitle:normalizeTitle,itemKey:itemKey,dedupe:dedupe,search:search,focus:focus,savedItems:savedItems,sourceStats:sourceStats};
})(window);
