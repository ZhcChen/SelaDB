# SelaDB UI 设计源

跨平台数据库管理工具 SelaDB 的 **HTML + CSS + JS** 设计源。

> 定位:这是 Rust 原生 GUI 实现（`crates/seladb-gui`）的**视觉与交互基线**。
> 设计源本身不是产品,是一个可点击、可操作的高保真原型,用来把信息架构、
> 设计 token、组件契约先定死,再进 Rust 实现。

## 目标

- 不依赖真实 API,全部用 mock 数据演示流程。
- 零第三方 UI 依赖:数据网格、对象树、菜单、图标全部自研,视觉完全由
  `assets/tokens.css` 控制。
- 纯静态产物,Vite 只承担开发期 HMR 与生产构建。
- 与后续 Rust 实现共用同一套设计语义(token 命名、数据类型色、引擎树规格),
  避免设计源与实现分叉。

## 目录

```text
ui/
├── index.html            # 入口
├── package.json
├── vite.config.js
├── assets/
│   ├── tokens.css        # 唯一设计源:颜色/间距/字号/圆角/阴影/动效
│   ├── styles.css        # 组件样式:外壳、树、Tab 栏、数据网格、菜单
│   ├── pages.css         # 页面级排版:入口页、规范页、连接向导、设置页
│   ├── icons.js          # 图标系统(内联 SVG,无图标字体)
│   ├── menu.js           # 轻量菜单
│   ├── tree.js           # 对象树(任意深度,配置驱动)
│   ├── datagrid.js       # 数据网格(纯原生自研)
│   ├── document-tree.js  # MongoDB 文档折叠树
│   ├── structure-view.js # 表结构视图(列/索引/约束/外键 + DDL)
│   ├── query-editor.js   # SQL 查询编辑器(语法高亮)
│   ├── command-palette.js# 命令面板(⌘K)
│   ├── value-editor.js   # Redis 键值编辑器(按类型渲染)
│   ├── ui-kit.js         # UI 原语:弹层、抽屉、Toast、表单控件
│   ├── mock-sql.js       # 假 SQL 执行器(会真的报错并给位置)
│   ├── mock-data.js      # 六引擎假数据 + 表结构 + DDL 生成
│   ├── app.js            # 外壳装配、路由、数据视图抽象
│   └── main.js           # 启动入口
└── docs/
    └── page-map.md       # 路由地图
```

## 运行

```bash
cd ui
bun install          # vite + playwright 两个开发依赖
bun run dev          # http://127.0.0.1:8030
bun run build        # 产物在 dist/,含一个单文件预览版
bun run test:smoke   # 冒烟验收,需要 dev server 已经起来
```

### 怎么打开

**直接双击 `ui/index.html` 会是空白页** —— 设计源用的是 ES 模块,浏览器在
`file://` 协议下会用 CORS 规则拦住它加载外部 `.js`。源文件里已经放了提示,
会告诉你下面两条路怎么走。

| 方式 | 命令 | 产物 |
|---|---|---|
| 开发预览 | `bun run dev` → http://127.0.0.1:8030 | 改代码即刷新,支持 HMR |
| 单文件预览 | `bun run build` → 双击 `ui/dist/SelaDB-UI-Preview.html` | 单个 232 KB 的 HTML,拷给谁都能直接打开,不需要服务器 |

`bun run build` 会在 Vite 产物之后再跑一次内联(`scripts/inline.mjs`),把 CSS 与
JS 全部塞进 HTML 里 —— 这是为了绕开上面说的 CORS 限制。

## 设计决策

2026-10-22 评审拍板,五条:

| # | 议题 | 结论 |
|---|---|---|
| 1 | 第一版引擎清单 | 6 个全上:PostgreSQL / MySQL / SQLite / SQL Server / MongoDB / Redis |
| 2 | 数据网格实现 | 纯原生自研,零第三方表格依赖 |
| 3 | 默认主题 | 跟随系统,设置里可显式覆盖 |
| 4 | 多连接模型 | 全局工作区 + Tab 带连接标识 |
| 5 | 对象树层级 | 保留引擎原生层级,差异由引擎树规格驱动 |

第 5 条尤其重要:**不做跨引擎压平**。PG 的 database 是可 CREATE/DROP 的
独立实体,压成一层等于让 PG 支持不完整;而「各引擎深度不一」对任意深度的
树组件本就不是问题。差异写在数据里,不在组件代码里。

## 组件分级

- **P0**:DataGrid、TreeView、TabBar、Toolbar/StatusBar、Splitter、Dialog/Modal/Drawer
- **P1**:QueryEditor、CommandPalette、表单控件组、Toast、Icon 系统
- **P2**:DocumentTree(MongoDB)、KeyValueList/ValueEditor(Redis)

唯一没做的是 `DiffViewer`(结构变更对比)—— 它依赖真实的 schema 版本历史,
设计源里造不出有说服力的样例,理由见 `docs/ui-design-plan.md` §10。

## 职责边界

这个设计源是**基线,不是需求文档**。它负责把「看起来什么样」和「状态怎么流转」
定死;功能完备性、真实数据、边界情况、性能归 Rust 实现侧。

改 Rust 实现时要不要回头改设计源:

- 改的是**视觉** → 改设计源,截图基线跟着更新
- 改的是**行为细节或边界情况** → 只改 Rust 实现
- 改的是**交互模型本身** → 两边都改

判断不清时先假设是第二种。

## 三条“真能用”的交互

设计源的价值不在静态摆拍,在这三条:

1. **数据网格**是手写的虚拟滚动网格 —— DOM 里只保留视口附近的行,1,284 行的表
   和 14 行一样流畅。排序是三态循环,过滤支持 `id > 100` / `name = '伟'` /
   `email like '%example.com'` 这样的表达式,解析失败会给红色错误提示。
2. **查询编辑器**的语法高亮是真的词法分析。`mock-sql.js` 会真的切语句、真的
   去找 `FROM` 后面的表名、真的比对已知表 —— 所以写错表名时,报的是
   `relation "xxx" does not exist`,并且出错的那段会被标红波浪线。
   Rust 侧要用 `tree-sitter-sql`,但**视觉契约以这里为准**。
3. **命令面板**把命令和对象放在一起模糊检索。对象树可能有几百个节点,
   让用户先展开三层再找一张表不现实,直接搜表名更快。
4. **表结构与 DDL**是真生成的:列定义从数据派生,DDL 按引擎方言生成
   (PostgreSQL 用 schema 限定名 + 独立的外键 ALTER,MySQL 用反引号 + ENGINE 尾巴),
   所以 Rust 侧照着实现出来的就是同一个样子。

## 数据视图抽象

NoSQL 与关系型的数据形态不同,不能都塞进 DataGrid:

```js
class DataView {
  mount(container)
  destroy()
}
```

由 `TableDataView`(行式表格)、`DocumentDataView`(文档树)、
`KeyValueListView`(键列表)分别实现。

## 与 Rust 实现的关系

| 设计源 | Rust 侧 |
|---|---|
| `tokens.css` | `crates/seladb-gui` 的主题模块;取值一一对应 |
| 数据类型色板 | 驱动的类型分类 → 渲染时选色 |
| 引擎树规格 | `seladb-core` 驱动能力声明 |
| `DataGrid` | GPUI/自研框架里的表格控件 |
| `query-editor.js` | `tree-sitter-sql` + 自研着色层 |
| 布局度量 | 固定高度 token 对应常量 |

设计源到 Rust 的还原度按 `docs/ui-fidelity.md` 的分层度量评估:
布局零偏差是底线,间距与字号其次,颜色与字体最后。
