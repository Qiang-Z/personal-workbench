# 个人工作台 · v4

v4 从“多功能管理后台”收敛为“简洁、本地优先的个人助手”：默认导航只保留今天、工作、日历、回顾和更多，科研、生活、健康、习惯、财务和热榜改为按需启用。

## v4 新增

- `src/app/module-preferences.js`：统一管理可选模块的启用、置顶和顺序，关闭模块不删除数据
- `src/ui/pages/more-page.js`：“更多”页升级为模块中心，同时收纳导入导出、备份、同步和操作手册
- 顶部导航最多固定 3 个可选模块，避免重新回到入口过载
- 今天页和日历只展示已启用模块的摘要和筛选项
- 新建事项保存打开表单时的分类，修复从今天/日历编辑时的分类偏移
- 修复编辑任务时“里程碑”选中状态反转问题
- 普通新建事项默认不强制填入今天，仅从日历进入时预填日期
- 移除低频且占用页面空间的批量模式，保留单条完成、编辑和删除的直接操作
- 科研模块改为“进展助手”：默认展示近期风险、论文下一步和成果管线
- 论文“进展阶段”与“作者角色”分离，兼容旧版拟投/在投/合作数据
- 论文支持下一步行动、截止日、等待对象和跟进日，阶段变更会自动写入历史
- 论文下一步自动生成关联科研事项，带日期时同步进入“今天”和日历
- 健康模块新增“健康首页”，优先展示今日计划、本周进度、最近运动和身体趋势
- 每周运动时长、次数和目标体重可按个人状态调整，不再使用固定考核目标
- 运动计划支持完成并记录、改到明天、今天休息和恢复，保留原有周计划数据
- 运动记录表单收敛为类型、时长、日期和运动感受，名称可自动生成
- 体重摘要改为近 7 天均值与近 30 天变化，减少对单日波动和首次记录的过度关注
- 今天页和周回顾会使用个人运动目标，并在有今日计划时提供直接入口
- `tests/module-preferences.test.js`：覆盖模块启用、导航拦截、置顶上限和数据保留
- `tests/research-summary.test.js`：覆盖论文阶段统计、等待跟进优先级和跨类型截止日汇总
- `tests/health-metrics.test.js`：覆盖个性化目标、周进度、跳过计划和身体趋势计算

## 产品原则

- 打开后先回答“今天做什么”
- 默认界面保持简单，专业能力通过模块按需开启
- 启用和隐藏只改变入口，不破坏用户数据
- 高风险的数据工具集中放在明确的数据中心

## 上一阶段：Phase 9

Phase 9 在继续保持“点击一个 HTML 即可直接用”的前提下，开始引入 selector / derived-state 层，并把 work 页更多区块改成 helper 驱动，减少直接读全局变量与重复拼接 HTML。

## 本阶段新增

### Selectors / Derived State
- `src/app/selectors.js`：统一提供 `uiState()`、`filteredItems()`、`workModuleModel()` 等派生数据入口
- `src/ui/pages/work-page.js`：改为优先通过 selector 获取 work 视图数据，而不是直接散落读取全局状态

### UI Helper 增强
- `src/ui/helpers/panel-kit.js`：新增 `toolbar` / `metaRow` / `list`，继续扩展 `section` 级别拼装能力
- work 页中的 tabs / collapsible / 空状态 / 列表块进一步改为 helper 驱动

### Bootstrap
- `src/app/bootstrap-phase9.js`：Phase 9 版本标记与启动补丁

## 保持的设计原则
- `portable/个人工作台.html` 仍是普通用户入口
- `source/` 仍是开源和持续重构用源码
- legacy 层仍保留，用于渐进式迁移，不做一次性推翻
- 优先“包裹式接管”而不是一次性重写，确保功能不断裂
- 先建立 page / module / selector 三层入口，再逐步把页面改造成 view-model 驱动

## 当前已模块化接管的主干
- Overview
- Work（已开始 selector 化）
- Finance
- Research
- Life
- Sport
- Habit（增强包装）

## 重新生成便携版

```bash
python scripts/build_portable.py
```
