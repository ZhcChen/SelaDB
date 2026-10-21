# SelaDB UI 模块设计计划

> 状态：2026-10-21 待评审
> 形态：纯 HTML + CSS + JS 设计源(与 `redcode-im/im-ui-html` 同一模式)

---

## 1. 模块位置

```text
SelaDB/
├── crates/               # Rust 代码(Cargo workspace)
│   ├── gui-core/         # GUI 框架
│   ├── seladb-core/      # 业务核心
│   ├── seladb-cli/
│   ├── seladb-mcp/
│   └── seladb-gui/
├── ui/                   # ← 本设计源(纯静态,不进 Cargo workspace)
│   ├── index.html
│   ├── assets/
│   │   ├── main.js       # 入口(hash router)
│   │   ├── app.js        # 视图
│   │   ├── mock-data.js  # 各引擎假数据
│   │   └── styles.css
│   ├── docs/page-map.md  # 路由地图
│   └── README.md
└── docs/
```

`ui/` 用 Vite 做开发期 HMR,构建配置 `base: './'`,产物是纯静态文件、可直接 `file://` 打开。
将来 `seladb-gui`(GPUI 实现)以 `ui/` 为视觉基线。

开发期依赖与参考项目一致:bun + Vite + Playwright(截图回归用,不进产品)。

---

## 2. 支持的数据库(第一版)

按**数据模型**分两类 —— 这决定了数据视图组件要不要分派。

### 关系型(行式表格视图)

| 引擎 | 对象树层级 | 选它的理由 |
|---|---|---|
| PostgreSQL | 连接 → database → schema → table/view/func/seq | 最主流,功能最全(schema/分区/扩展) |
| MySQL / MariaDB | 连接 → database → table/view/proc | 装机量最大 |
| SQLite | 连接 → database → table | 零配置本地文件,开发者日常高频 |
| SQL Server | 连接 → database → schema → table | 企业刚需,Windows 生态为主 |

### NoSQL(各自的专属视图)

| 引擎 | 数据模型 | 数据视图 |
|---|---|---|
| MongoDB | 文档 | **文档树**(BSON 嵌套展开) + JSON 切换 |
| Redis | KV | **键列表**(key/type/TTL/size) + 按类型渲染的值编辑器 |

### 二期候选

ClickHouse(OLAP 列存,对象模型同 PG,成本低)、Elasticsearch(搜索)、Oracle(企业但驱动重)、云 KV(DynamoDB / Atlas)

---

## 3. 各引擎的对象树不统一 —— 这是第一个要解决的表达问题

| 引擎 | 层级数 | 有无 schema | 特有对象 |
|---|---|---|---|
| PostgreSQL | 3 | 有 | 扩展、分区、序列、类型 |
| MySQL | 2 | 无(库=schema) | 存储过程、函数、事件、触发器 |
| SQLite | 1 | 无 | 索引、视图、触发器 |
| SQL Server | 3 | 有 | 存储过程、聚合函数、同义词 |
| MongoDB | 2 | 无 | 集合、视图、索引 |
| Redis | 1(按类型分组) | 无 | 按类型分组 + TTL |

**设计取舍:统一成「分组 → 集合 → 对象」三层,缺失的层不显示。**

```text
▾ MySQL — 本地
  ▾ shop                    ← 数据库层
    ▸ users        1,284
    ▸ orders       5,321
▾ Redis — 本地
  ▸ All Keys       8,412
  ▸ String         6,201
  ▸ Hash             890
```

即:把「database / schema / 逻辑分组」统一抽象成**第一层分组**,下面挂对象。这样对象树的交互和 UI 代码是统一的,差异只体现在「某引擎显示哪些分组项」。

---

## 4. 信息架构

采用 Navicat / DBeaver / TablePlus 的共识:**对象树做主导航,Tab 做工作区**。

```text
┌─ 标题栏 ─────────────────────────────────────────────────────┐
│ SelaDB │ MySQL — 本地 ▾ │ [MySQL] │  ⌘K 全局搜索   │ ☀ 🌙 ⚙ │
├─ 工具栏 ─────────────────────────────────────────────────────┤
│ [新建连接][断开] │ [刷新][打开查询] │ [提交 ▾][回滚] │ 事务 Auto│
├────────────┬──────────────────────────────────────────────────┤
│ 对象树      │ Tabs: users | users 结构 | 查询 1 | +           │
│ ┌────────┐ │ ┌──────────────────────────────────────────────┐ │
│ │🔍 搜索 │ │ │ 过滤条: [id > 100        ]  清除              │ │
│ └────────┘ │ ├──────┬──────────┬──────────┬──────────────┤ │
│ ▾ MySQL    │ │ #    │ id       │ name     │ created_at   │ │
│  ▾ shop    │ │  1   │ 1001     │ 伟        │ 2025-03-28   │ │
│   ▸ users  │ │  2   │ 1002     │ 娜        │ 2025-05-11   │ │
│   ▸ orders │ │  …   │          │           │              │ │
│ ▾ MongoDB  │ ├──────┴──────────┴──────────┴──────────────┤ │
│  ▸ shop    │ │ 筛选:[__________]        1,284 行   导出 ▾   │ │
│ ▸ Redis    │ └──────────────────────────────────────────────┘ │
├────────────┴──────────────────────────────────────────────────┤
│ ● 已连接 127.0.0.1:3306 │ 1,284 行 │ 12ms │ UTF-8 │ 事务 Auto│
└─────────────────────────────────────────────────────────────┘
```

要点:

- **单栏对象树**,宽度可拖拽(用 `Splitter`)
- 工具栏按「连接级 / 数据级」分区,提交回滚只在事务模式下出现
- 工作区 Tab 可拖拽排序、标脏、关闭前确认
- 状态栏固定显示:连接状态 / 行数 / 耗时 / 字符集 / 事务模式

---

## 5. 路由地图

### 设计源自身(不进产品)

| Route | 作用 |
|---|---|
| `#/entry` | 总入口:分流到规范页与产品预览 |
| `#/spec` | 规范页:token、组件清单、引擎支持矩阵 |
| `#/design` | **产品设计预览(主工作台)** |

### 产品层

| Route | 说明 |
|---|---|
| `#/connect` | 新建连接向导(选类型 → 填参数 → 测试 → 保存) |
| `#/connect/:id` | 连接参数编辑 |
| `#/workbench/:conn` | 主工作台(对象树 + Tab 区) |
| `#/workbench/:conn/data/:schema/:table` | 表数据 |
| `#/workbench/:conn/structure/:schema/:table` | 表结构(列/索引/约束/外键) |
| `#/workbench/:conn/ddl/:schema/:table` | DDL 预览 |
| `#/workbench/:conn/query` | 查询编辑器 |
| `#/workbench/:conn/search` | 全局对象搜索 |
| `#/settings` | 应用设置(主题、字体、密度、快捷键) |

---

## 6. 组件清单(按优先级)

### P0 —— 没有就不可用

| 组件 | 关键能力 |
|---|---|
| `DataGrid` | 虚拟滚动、列宽拖拽、排序、筛选、行选择、**单元格内编辑**、NULL 样式、类型着色、复制、右键菜单、列显示/隐藏 |
| `TreeView` | 懒加载展开、搜索过滤、右键菜单、徽标计数 |
| `TabBar` | 多标签、脏标记、关闭确认、拖拽排序 |
| `Toolbar` / `MenuBar` | 分区布局、下拉菜单、快捷键提示 |
| `StatusBar` | 连接状态、行数、耗时、事务模式 |
| `Splitter` | 可拖拽分栏 |
| `Dialog` / `Modal` / `Drawer` | 确认框、表单弹层、侧边抽屉 |

### P1

| 组件 | 关键能力 |
|---|---|
| `QueryEditor` | SQL 语法高亮、错误定位、⌘↵ 执行、多语句 |
| `CommandPalette` | ⌘K 全局命令与对象跳转 |
| 表单控件组 | Input / Select / Switch / Checkbox / NumberInput / PasswordInput / PathPicker |
| `Toast` | 操作反馈 |
| `DiffViewer` | 结构变更对比 |
| `Icon` 系统 | 统一图标(引擎徽标、对象类型、状态) |

### P2 —— NoSQL 差异化

| 组件 | 用途 |
|---|---|
| `DocumentTree` | MongoDB BSON 嵌套展开 |
| `JsonViewer` | 折叠 + 语法着色 |
| `KeyValueList` | Redis 键列表 + TTL 倒计时 |
| `ValueEditor` | Redis 按类型渲染的值编辑器 |

### 数据视图要抽象成接口

NoSQL 和关系型的数据视图结构完全不同,所以不能都塞进 `DataGrid`:

```js
interface DataView {
  mount(container, ctx)
  refresh()
  setSort(spec)
  destroy()
}
```

由 `TableDataView` / `DocumentDataView` / `KeyValueList` 分别实现。`DataGrid` 只是 `TableDataView` 的内部实现。

---

## 7. 设计系统

`ui/assets/tokens.css` 是唯一设计源,双主题 + 双密度:

```css
:root[data-theme="light"] { --bg-canvas:#f5f6f8; --bg-surface:#fff; --accent:#2563eb; … }
:root[data-theme="dark"]  { --bg-canvas:#0e1116; --bg-surface:#151920; --accent:#5b8cff; … }
:root[data-density="compact"] { --row-h:24px; --font-size:12px; }
:root[data-density="comfortable"] { --row-h:30px; --font-size:13px; }
```

### 类型色板(数据网格专用)

| 类型 | 样式 |
|---|---|
| 整数 / 浮点 | 蓝色 |
| 字符串 | 常规前景色 |
| 布尔 | 强调色 |
| 时间 | 紫色 + 等宽 |
| **NULL** | 灰色斜体 |
| BLOB / JSON | 等宽 + 截断提示 |
| 主键 | 加粗 |

**密度可调是数据库工具的刚需** —— 同样 1000 行,紧凑模式能多看一半。

---

## 8. 阶段划分

| 版本 | 内容 | 验证什么 |
|---|---|---|
| **V0.1** | 外壳 + 对象树 + 假数据表格(静态) | 布局、token、信息架构 |
| **V0.2** | 表格交互:虚拟滚动、排序、选择、单元格编辑、提交/回滚 | 数据层交互模型 |
| **V0.3** | 查询编辑器 + 结果网格 + 错误定位 | SQL 工作流 |
| **V0.4** | 连接向导、设置、命令面板 | 外围流程 |
| **V0.5** | NoSQL 差异化视图(Mongo 文档树 / Redis 键值) | `DataView` 接口是否站得住 |

---

## 9. 待拍板

1. **第一版引擎清单**:我建议 PostgreSQL / MySQL / SQLite / SQL Server / MongoDB / Redis 六个,是否加减?
2. **数据网格自研还是用库?** 纯原生手写虚拟滚动约 150 行、零构建;AG Grid / TanStack Table 功能全但引入构建步骤与包体
3. **主题默认**:浅色优先(DBeaver / Navicat 传统)还是深色优先(TablePlus / Beekeeper 现代派)?
4. **是否支持多连接同时打开?** DBeaver 与 Navicat 都支持多标签页连接,这会显著影响外壳设计
5. **对象树第一层统一为「分组」** 的方案是否接受?代价是 PostgreSQL 的 database 与 schema 会压成一层
"""
