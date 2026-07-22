const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const elements = {
  moduleNav: { innerHTML: '' },
  saveState: { textContent: '' }
};
const pages = {};
let saves = 0;
let renders = 0;

const document = {
  getElementById(id){ return elements[id] || null; },
  querySelectorAll(){ return []; }
};
const window = {
  document,
  data: {
    items: [{ id:'r1', cat:'research', title:'保留的科研任务' }],
    papers: [{ id:'p1' }],
    prefs: {},
    __savedAt: Date.now()
  },
  currentCat: 'work',
  save(){ saves += 1; },
  render(){ renders += 1; },
  setView(id){ this.currentCat = id; },
  toast(){},
  WorkbenchPageRegistry: { register(id, fn){ pages[id] = fn; } }
};
window.window = window;
const context = vm.createContext({ window, document, console, Date });

function run(relative){
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  vm.runInContext(source, context, { filename: relative });
}

run('src/app/module-preferences.js');
run('src/ui/pages/more-page.js');

assert.equal(window.WorkbenchModules.isEnabled('research'), false, '可选模块默认不启用');
window.setView('research');
assert.equal(window.currentCat, 'more', '未启用模块应引导到更多');

window.toggleWorkbenchModule('research');
assert.equal(window.WorkbenchModules.isEnabled('research'), true);
assert.equal(window.data.items.length, 1, '启用或关闭模块不能删除业务数据');
assert.equal(window.WorkbenchModules.countFor('research'), 2);

window.toggleWorkbenchModulePin('research');
assert.equal(window.WorkbenchModules.isPinned('research'), true);
assert.match(elements.moduleNav.innerHTML, /科研/);

['life','sport','habit'].forEach(id => window.toggleWorkbenchModule(id));
window.toggleWorkbenchModulePin('life');
window.toggleWorkbenchModulePin('sport');
window.toggleWorkbenchModulePin('habit');
assert.deepEqual(Array.from(window.WorkbenchModules.config().pinned), ['research','life','sport'], '顶部可选模块应限制为三个');

assert.equal(typeof pages.more, 'function', '更多页应注册到页面路由');
const html = pages.more();
assert.match(html, /按需开启/);
assert.match(html, /关闭模块只会隐藏入口/);
assert.ok(saves > 0 && renders > 0, '配置变更应保存并刷新');

console.log('module-preferences.test.js: ok');
