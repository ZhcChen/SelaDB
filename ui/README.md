# SelaDB UI 设计源

跨平台数据库管理工具 SelaDB 的 **HTML + CSS + JS** 设计源。

> 定位:这是 Rust 原生 GUI 实现（`crates/seladb-gui`）的**视觉与交互基线**。
> 设计源本身不是产品,是一个可点击、可操作的高保真原型,用来把信息架构、
> 设计 token、组件契约先定死,再进 Rust 实现。

## 目标

- 不依赖真实 API,全部用 mock 数据演示流程。
- 零第三方 UI 依赖:数据网格、对象树、菜单、图标全部自研,视觉完全由
  `assets/tokens.css` 控制。
- **零构建步骤**:纯静态 HTML + CSS + JS,双击即开,不占端口。
- 与后续 Rust 实现共用同一套设计语义(token 命名、数据类型色、引擎树规格),
  避免设计源与实现分叉。

## 怎么打开

**双击 `ui/index.html` 就能看。** 没有构建步骤、没有运行时依赖、不占端口。

设计源刻意不用 ES module:浏览器在 `file://` 协议下会用 CORS 规则拦住模块脚本
去加载外部 `.js`,整页就白了。改用普通 `<script>` 按依赖顺序加载,`file://` 与
`http://` 下行为完全一致。代价是所有脚本共享全局作用域,所以顶层名字必须全局
唯一 —— 这是 `ui/assets/` 里的硬约束。

## 目录

```text
ui/
├── index.html            # 入口(普通 <script>,按依赖顺序加载 assets/)
├── package.json          # 只为冒烟验收准备,查看设计源不需要它
├── assets/
│   ├── tokens.css        # 唯一设计源:颜色/间距/字号/圆角/阴影/动效
│   ├── styles.css        # 组件样式:外壳、树、Tab 栏、数据网格、菜单
│   ├── pages.css         # 页面级排版:入口页、规范页、连接向导、设置页
│   ├── icons.js          # 图标系统(内联 SVG,无图标字体)
│   ├── engine-icons.js   # 六种引擎的专属图标(实心剪影,单色 currentColor)
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

## 改动与验收

改完刷新浏览器即可,没有热更新也没有打包。

```bash
cd ui
bun install       # 只装 playwright 一个开发依赖
bun run test:smoke
```

验收直接跑 `file://` 协议,不需要起服务器 —— 断言的就是「双击能不能用」。
截图落在 `tests/screenshots/`,作为视觉回归基准。

要对着 dev server 跑时用 `SELA_DB_UI_URL=http://127.0.0.1:8030 bun run test:smoke`。

### 对比度检查

冒烟验功能,评审验观感,中间还缺一层:**看不看得清**。

```bash
cd ui && bun run test:contrast
```

`tests/contrast.mjs` 把每个页面的每个文本节点拿出来,一路往上找到它实际待着的
不透明底色,算 WCAG 对比度。正文要 4.5:1,图标与非文本(带 `aria-hidden` 的
装饰字形)要 3:1。

两个容易踩的坑,脚本里都处理了:

- **底色要往上找。** 浮层里的文字直接父级是透明的,只看直接父级会算成白底。
- **每个主题单独渲染。** 不能在渲染完成后去改 `data-theme` —— 应用会按自己的
  偏好重新应用,量出来的是深浅混色(会算出 1.05 这种荒谬值)。

改了颜色就跑一遍。这套规则是硬指标,不是口味问题:前景色不是「深一点淡一点」,
是**在它会被放上去的每一个底色上都过对比度**。

### 视觉评审

冒烟验收验的是「功能对不对」,验不了「好不好看」。`tests/review.mjs` 把黄金截图
交给多模态模型,按固定 rubric 打分,输出可定位的问题清单。

```bash
cd ui && node tests/review.mjs          # 全部截图
cd ui && node tests/review.mjs 02-grid  # 只评某几张
```

报告落在 `tests/review-report.md`。三条维度是「布局与信息密度 / 对比度与类型
可辨识 / 专业观感」,思路借自 [wandb/openui](https://github.com/wandb/openui)
的 `backend/openui/eval/evaluate.py`,但 rubric 改写成了适配桌面数据库工具的版本。

**绝对打分有 ±1 分的抖动**,同一批截图连评四轮总分在 8.07–8.80 之间浮动。
所以另有一套成对比较,问「改动前后哪个更好」,相对判断稳定得多:

```bash
cd ui && node tests/review.mjs --compare
```

基线截图在 `tests/baseline/`,更新方式见 `docs/ui-design-plan.md`。

评审的真正价值不是分数,是它指出的具体问题 —— 每一轮改动都是从报告里挑出来做的。

借的是它的 eval 思路,不是它的产物 —— openui 生成的是 Tailwind + shadcn 代码,
直接拿来会同时违反「零第三方 UI 依赖」「零构建步骤」「tokens.css 唯一真源」。

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
| `DataGrid` | 自研框架里的表格控件 |
| `query-editor.js` | `tree-sitter-sql` + 自研着色层 |
| 布局度量 | 固定高度 token 对应常量 |

设计源到 Rust 的还原度按 `docs/ui-fidelity.md` 的分层度量评估:
布局零偏差是底线,间距与字号其次,颜色与字体最后。
