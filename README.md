# 个人工作台（Personal Workbench）

一个**纯前端、单文件**的个人效率工作台，覆盖 **项目管理 / 科研 / 生活 / 健康 / 习惯 / 财务 / 信息热榜** 七大板块。打开即用，**无需后端、无需数据库**。

> 当前版本：**v4.4** — 信息热榜改造为克制、可稍后处理的信息简报。
> 历史版本（v2 / v3 / v4 / v4.1 / v4.2 / v4.3）请看 [`archive` 分支](https://github.com/Qiang-Z/personal-workbench/tree/archive)。

---

## 📌 当前版本（v4.4）

| 路径 | 说明 |
|------|------|
| `portable/个人工作台.html` | **开箱即用的便携版入口**（推荐普通用户） |
| `source/` | 模块化源码（src / tests / scripts / public / assets） |

直接用浏览器打开 `portable/个人工作台.html` 即可。所有数据默认保存在**浏览器本地（localStorage）**，不上传任何服务器。

---

## ✨ v4.4 相对 v4.3 的升级

v4.4 把**信息热榜**从「整页热榜」改造成「克制、可稍后处理的信息简报」：

- **三入口拆分**：今日精选（最多 12 条，按类别轮换）/ 按来源看 / 稍后阅读
- **跨来源去重**：相同标题自动合并，提示来源数量
- **已读弱化 + 星标收藏**：打开内容后自动弱化已读，重要内容星标到本机
- **来源管理**：信息源支持停用和重新启用，停用不删除配置
- **搜索**：同时作用于今日精选和按来源视图
- **新增测试**：`tests/news-summary.test.js` 覆盖跨来源去重、类别轮换、已读排序、收藏、搜索和来源状态统计

完整版本演进说明见 `source/README.md`。

---

## 📁 仓库结构

```
personal-workbench/
├── README.md              # 本文件
├── portable/              # 便携版入口（双击即用）
│   ├── 个人工作台.html
│   └── assets/
│       ├── app.css
│       └── app.js
└── source/                # 模块化源码
    ├── README.md          # 完整版本演进说明
    ├── scripts/build_portable.py  # 一键构建便携版
    ├── public/            # HTML 外壳
    ├── assets/            # 样式
    ├── tests/             # 7 个测试套件
    └── src/               # 源码（app / ui / domain / data / legacy）
```

历史版本（v2 / v3 / v4 / v4.1 / v4.2 / v4.3 / v4.4 完整快照）在 [`archive` 分支](https://github.com/Qiang-Z/personal-workbench/tree/archive)。

---

## 💾 数据存储与同步

- 默认数据保存在本机浏览器的 `localStorage`
- 支持 **GitHub Gist 同步**（在「更多 → 云端同步」中配置），方便多设备备份
- 支持 **本地备份与回滚**

> 提示：清除浏览器数据会清空本地记录，建议定期通过 Gist 或本地备份导出。

---

## 🏗️ 开发者

修改 `source/src/` 后重新打包便携版：

```bash
python source/scripts/build_portable.py
```

会按 `ORDER` 列表把所有 JS 模块拼成单个 `app.js`，连同 `app.css` 和 HTML 外壳输出到 `portable/`。

---

## 📄 许可

个人使用，欢迎自行修改。
