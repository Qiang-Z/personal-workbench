(function(global){
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function lifeTaskSummary(){
    var items=(getData().items||[]).filter(function(i){ return i.cat==='life'; });
    return {
      total: items.length,
      open: items.filter(function(i){ return i.status!=='done'; }).length,
      due: items.filter(function(i){ return i.status!=='done' && !!i.due; }).length
    };
  }
  function bookSummary(){
    var books=(getData().books||[]);
    var out={ total: books.length, reading:0, done:0, wishlist:0 };
    books.forEach(function(b){
      var st=b.status || 'todo';
      if(['reading','in_progress','current'].indexOf(st)>=0) out.reading += 1;
      else if(['done','finished','read'].indexOf(st)>=0) out.done += 1;
      else out.wishlist += 1;
    });
    return out;
  }
  function travelStatus(t){
    var today=typeof global.todayStr === 'function' ? global.todayStr() : new Date().toISOString().slice(0,10);
    if(!t || !t.start || !t.end) return 'pending';
    if(today < t.start) return 'upcoming';
    if(today > t.end) return 'past';
    return 'ongoing';
  }
  function travelSummary(){
    var list=(getData().travels||[]);
    var out={ total:list.length, upcoming:0, ongoing:0, budgetTotal:0, spentTotal:0 };
    list.forEach(function(t){
      var st=travelStatus(t);
      if(st==='upcoming') out.upcoming += 1;
      else if(st==='ongoing') out.ongoing += 1;
      out.budgetTotal += +t.budget || 0;
      out.spentTotal += +t.spent || 0;
    });
    return out;
  }
  function anniversarySummary(){
    var out={ total:(getData().anniversaries||[]).length, upcoming7:0, upcoming30:0, next:null };
    (getData().anniversaries||[]).forEach(function(a){
      if(typeof global.nextAnniv !== 'function') return;
      var na=global.nextAnniv(a.date);
      if(!na) return;
      if(na.days<=7) out.upcoming7 += 1;
      if(na.days<=30) out.upcoming30 += 1;
      if(!out.next || na.days < out.next.days) out.next={ item:a, days:na.days, date:na.date };
    });
    return out;
  }
  global.WorkbenchLifeSummary = {
    lifeTaskSummary: lifeTaskSummary,
    bookSummary: bookSummary,
    travelSummary: travelSummary,
    anniversarySummary: anniversarySummary,
    travelStatus: travelStatus
  };
})(window);
