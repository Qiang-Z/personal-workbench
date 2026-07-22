(function(global){
  function getData(){ return (global.WorkbenchData&&global.WorkbenchData.getData)?global.WorkbenchData.getData():(global.data||{}); }
  function today(){ return typeof global.todayStr==='function'?global.todayStr():new Date().toISOString().slice(0,10); }
  function addDays(ds,offset){
    var d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+offset);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function dayDiff(a,b){
    if(typeof global.daysBetween==='function')return global.daysBetween(a,b);
    return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);
  }
  function lifeTasks(){return (getData().items||[]).filter(function(i){return i.cat==='life';});}
  function taskGroups(){
    var td=today(),weekEnd=addDays(td,7),open=lifeTasks().filter(function(i){return i.status!=='done';});
    function sortDue(a,b){return String(a.due||'9999-99-99').localeCompare(String(b.due||'9999-99-99'));}
    return {
      today:open.filter(function(i){return i.due&&i.due<=td;}).sort(sortDue),
      upcoming:open.filter(function(i){return i.due>td&&i.due<=weekEnd;}).sort(sortDue),
      unscheduled:open.filter(function(i){return !i.due;}).sort(function(a,b){return String(a.title).localeCompare(String(b.title));}),
      later:open.filter(function(i){return i.due>weekEnd;}).sort(sortDue),
      completed:lifeTasks().filter(function(i){return i.status==='done';}).sort(sortDue).reverse(),
      open:open.length
    };
  }
  function lifeTaskSummary(){
    var groups=taskGroups();
    return {total:lifeTasks().length,open:groups.open,due:groups.today.length+groups.upcoming.length,today:groups.today.length,upcoming7:groups.upcoming.length,unscheduled:groups.unscheduled.length};
  }
  function normalizeBookStatus(st){
    if(['reading','in_progress','current'].indexOf(st)>=0)return 'reading';
    if(['done','finished','read'].indexOf(st)>=0)return 'done';
    return 'want';
  }
  function bookSummary(){
    var books=getData().books||[],out={total:books.length,reading:0,done:0,wishlist:0,current:[],next:null};
    books.forEach(function(b){var st=normalizeBookStatus(b.status);if(st==='reading'){out.reading++;out.current.push(b);}else if(st==='done')out.done++;else out.wishlist++;});
    out.current.sort(function(a,b){return String(a.nextDue||a.startDate||'9999').localeCompare(String(b.nextDue||b.startDate||'9999'));});
    out.next=out.current[0]||null;return out;
  }
  function travelStatus(t){
    var td=today();if(!t||!t.start||!t.end)return 'planning';if(td<t.start)return 'upcoming';if(td>t.end)return 'past';return 'ongoing';
  }
  function checklistItems(t){
    return (t&&Array.isArray(t.checklist)?t.checklist:[]).map(function(item){return typeof item==='string'?{text:item,done:false}:{text:item.text||'',done:!!item.done};}).filter(function(item){return item.text;});
  }
  function travelChecklistProgress(t){
    var items=checklistItems(t),done=items.filter(function(i){return i.done;}).length;
    return {items:items,done:done,total:items.length,pct:items.length?Math.round(done/items.length*100):0};
  }
  function isActualFinance(f){return f&&!f.gen&&f.status!=='planned'&&f.status!=='skipped'&&f.date&&f.date<=today();}
  function travelSpent(t){
    var linked=(getData().finances||[]).filter(function(f){return f.travelId===t.id&&f.type==='expense'&&isActualFinance(f);});
    if(linked.length)return linked.reduce(function(s,f){return s+(+f.amount||0);},0);
    return +t.spent||0;
  }
  function travelSummary(){
    var list=getData().travels||[],out={total:list.length,upcoming:0,ongoing:0,planning:0,past:0,budgetTotal:0,spentTotal:0,next:null};
    list.forEach(function(t){var st=travelStatus(t);out[st]=(out[st]||0)+1;out.budgetTotal+=+t.budget||0;out.spentTotal+=travelSpent(t);});
    var active=list.filter(function(t){var st=travelStatus(t);return st!=='past';}).slice().sort(function(a,b){return String(a.start||'9999-99-99').localeCompare(String(b.start||'9999-99-99'));});
    out.next=active[0]||null;return out;
  }
  function nextImportantDate(a){
    if(!a||!/^\d{2}-\d{2}$/.test(a.date||''))return null;
    var td=today(),year=+td.slice(0,4),candidate=year+'-'+a.date;
    if(candidate<td)candidate=(year+1)+'-'+a.date;
    return {date:candidate,days:dayDiff(td,candidate)};
  }
  function importantDates(){
    return (getData().anniversaries||[]).map(function(a){return {item:a,next:nextImportantDate(a)};}).filter(function(x){return !!x.next;}).sort(function(a,b){return a.next.days-b.next.days;});
  }
  function anniversarySummary(){
    var list=importantDates(),out={total:(getData().anniversaries||[]).length,upcoming7:0,upcoming30:0,next:list[0]||null,items:list};
    list.forEach(function(x){if(x.next.days<=7)out.upcoming7++;if(x.next.days<=30)out.upcoming30++;});return out;
  }
  function homeModel(){
    var tasks=taskGroups(),books=bookSummary(),travels=travelSummary(),dates=anniversarySummary();
    return {tasks:tasks,books:books,travels:travels,dates:dates,focusCount:tasks.today.length+tasks.upcoming.length+(travels.next?1:0)+(dates.next&&dates.next.next.days<=30?1:0)};
  }
  global.WorkbenchLifeSummary={
    today:today,addDays:addDays,dayDiff:dayDiff,lifeTasks:lifeTasks,taskGroups:taskGroups,lifeTaskSummary:lifeTaskSummary,
    normalizeBookStatus:normalizeBookStatus,bookSummary:bookSummary,travelStatus:travelStatus,checklistItems:checklistItems,
    travelChecklistProgress:travelChecklistProgress,travelSpent:travelSpent,travelSummary:travelSummary,
    nextImportantDate:nextImportantDate,importantDates:importantDates,anniversarySummary:anniversarySummary,homeModel:homeModel
  };
})(window);
