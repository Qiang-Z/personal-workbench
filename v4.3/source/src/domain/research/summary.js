(function(global){
  var WRITING=['idea','draft','writing','internal','preparing'];
  var SUBMITTED=['submitted','review','rereview','transferred'];
  var REVISION=['major','minor','revision'];
  var DONE=['accepted','published'];
  var ARCHIVED=['rejected','archived','withdrawn'];
  function getData(){ return (global.WorkbenchData && global.WorkbenchData.getData) ? global.WorkbenchData.getData() : (global.data || {}); }
  function today(){ return typeof global.todayStr === 'function' ? global.todayStr() : new Date().toISOString().slice(0,10); }
  function daysTo(due){ return typeof global.daysBetween === 'function' ? global.daysBetween(today(),due) : 9999; }
  function statusOfPaper(p){
    if(typeof global.curStep === 'function'){
      var step=global.curStep(p);
      if(step&&step.status)return step.status;
    }
    return p&&p.status?p.status:'idea';
  }
  function kindOfPaper(p){ return (p&&p.kind&&global.PAPER_KIND&&global.PAPER_KIND[p.kind])?p.kind:'sub'; }
  function isActivePaper(p){ return DONE.concat(ARCHIVED).indexOf(statusOfPaper(p))<0; }
  function paperCounts(){
    var papers=(getData().papers||[]);
    var out={total:papers.length,plan:0,sub:0,collab:0,active:0,writing:0,submitted:0,revision:0,done:0,archived:0,waiting:0,missingNext:0,accepted:0,rejected:0,revise:0};
    papers.forEach(function(p){
      var kind=kindOfPaper(p);out[kind]=(out[kind]||0)+1;
      var st=statusOfPaper(p);
      if(WRITING.indexOf(st)>=0)out.writing+=1;
      else if(SUBMITTED.indexOf(st)>=0)out.submitted+=1;
      else if(REVISION.indexOf(st)>=0){out.revision+=1;out.revise+=1;}
      else if(DONE.indexOf(st)>=0){out.done+=1;out.accepted+=1;}
      else {out.archived+=1;if(ARCHIVED.indexOf(st)>=0)out.rejected+=1;}
      if(isActivePaper(p)){
        out.active+=1;
        if(p.waitingFor)out.waiting+=1;
        if(!p.nextAction&&!p.waitingFor)out.missingNext+=1;
      }
    });
    return out;
  }
  function paperAlerts(){
    return (getData().papers||[]).filter(isActivePaper).map(function(p){
      var candidates=[];
      if(p.nextDue)candidates.push({due:p.nextDue,label:p.nextAction||'下一步行动'});
      if(p.rebuttalDue)candidates.push({due:p.rebuttalDue,label:'审稿回复'});
      if(p.followUpAt)candidates.push({due:p.followUpAt,label:'跟进 '+(p.waitingFor||'等待事项')});
      candidates.sort(function(a,b){return String(a.due).localeCompare(String(b.due));});
      if(!candidates.length)return null;
      var first=candidates[0];var days=daysTo(first.due);
      return {paper:p,due:first.due,label:first.label,days:days,overdue:days<0,urgent:days>=0&&days<=7};
    }).filter(Boolean).sort(function(a,b){return String(a.due).localeCompare(String(b.due));});
  }
  function nextActions(){
    return (getData().papers||[]).filter(isActivePaper).filter(function(p){return p.nextAction||p.waitingFor;}).map(function(p){
      var waiting=!!p.waitingFor;
      return {paper:p,waiting:waiting,text:waiting?('跟进：'+p.waitingFor):p.nextAction,due:waiting?p.followUpAt:p.nextDue,days:(waiting?p.followUpAt:p.nextDue)?daysTo(waiting?p.followUpAt:p.nextDue):null};
    }).sort(function(a,b){
      if(a.days===null&&b.days===null)return 0;if(a.days===null)return 1;if(b.days===null)return -1;return a.days-b.days;
    });
  }
  function deadlineItems(){
    var data=getData();var out=[];
    paperAlerts().forEach(function(x){out.push({type:'paper',id:x.paper.id,title:x.paper.title,label:x.label,due:x.due,days:x.days});});
    (data.patents||[]).forEach(function(p){if(p.feeDue){out.push({type:'patent',id:p.id,title:p.title,label:'专利缴费 / 答复',due:p.feeDue,days:daysTo(p.feeDue)});}});
    (data.rprojects||[]).forEach(function(p){if(p.end&&(p.status||'active')!=='closed'){out.push({type:'project',id:p.id,title:p.title,label:'项目结束 / 结题',due:p.end,days:daysTo(p.end)});}});
    (data.items||[]).filter(function(i){return i.cat==='research'&&i.status!=='done'&&i.due&&i.sourceType!=='paper-action';}).forEach(function(i){out.push({type:'task',id:i.id,title:i.title,label:'科研事项',due:i.due,days:daysTo(i.due)});});
    return out.sort(function(a,b){return a.days-b.days;});
  }
  function patentCounts(){
    var patents=(getData().patents||[]);var out={total:patents.length,active:0,granted:0,dueSoon:0};
    patents.forEach(function(p){
      var st=(typeof global.curPatStep==='function'&&global.curPatStep(p)&&global.curPatStep(p).status)||p.status||'draft';
      if(st==='granted')out.granted+=1;else out.active+=1;
      if(p.feeDue){var d=daysTo(p.feeDue);if(d>=0&&d<=30)out.dueSoon+=1;}
    });
    return out;
  }
  function projectCounts(){
    var list=(getData().rprojects||[]);var out={total:list.length,active:0,endingSoon:0,funded:0};
    list.forEach(function(p){
      if((p.status||'active')!=='done'&&(p.status||'active')!=='closed')out.active+=1;
      if(+p.fund>0)out.funded+=1;
      if(p.end){var d=daysTo(p.end);if(d>=0&&d<=45)out.endingSoon+=1;}
    });
    return out;
  }
  global.WorkbenchResearchSummary={
    paperCounts:paperCounts,paperAlerts:paperAlerts,nextActions:nextActions,deadlineItems:deadlineItems,
    patentCounts:patentCounts,projectCounts:projectCounts,statusOfPaper:statusOfPaper,kindOfPaper:kindOfPaper,isActivePaper:isActivePaper
  };
})(window);
