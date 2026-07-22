const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const window={};window.window=window;
const context=vm.createContext({window,console});
const file=path.resolve(__dirname,'../src/domain/news/summary.js');
vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const news=window.WorkbenchNewsSummary;

const items=[
  {title:'新的 AI 工具，正式发布！',link:'https://a.example/1',src:'来源甲',cat:'科技',date:600},
  {title:'新的AI工具正式发布',link:'https://b.example/1',src:'来源乙',cat:'科技',date:590},
  {title:'论文写作方法',link:'https://a.example/2',src:'来源甲',cat:'知识',date:580},
  {title:'城市周末指南',link:'https://c.example/3',src:'来源丙',cat:'生活',date:570},
  {title:'第二条科技动态',link:'https://a.example/4',src:'来源甲',cat:'科技',date:560},
];

const unique=news.dedupe(items);
assert.equal(unique.length,4,'相同标题应跨来源合并');
assert.deepEqual(Array.from(unique[0].sources),['来源甲','来源乙']);

const readKey=news.itemKey(items[0]);
const focus=news.focus(items,['科技','知识','生活'],{read:{[readKey]:true}},3);
assert.equal(focus.length,3);
assert.deepEqual(Array.from(focus.map(x=>x.cat)),['科技','知识','生活'],'精选应在类别间轮换');
assert.equal(focus[0].title,'第二条科技动态','同类别内未读内容应排在已读之前');

const state={saved:{}};
state.saved[unique[1].key]=Object.assign({},unique[1],{savedAt:10});
state.saved[unique[2].key]=Object.assign({},unique[2],{savedAt:20});
assert.equal(news.savedItems(state)[0].title,'城市周末指南');
assert.equal(news.search(unique,'生活')[0].title,'城市周末指南');

const stats=news.sourceStats([
  {id:'a'},{id:'b'},{id:'c',enabled:false},{id:'d'}
],{a:true,b:false});
assert.deepEqual(JSON.parse(JSON.stringify(stats)),{active:3,ok:1,failed:1,pending:1});

console.log('news-summary.test.js: ok');
