# 路由地图

单页 hash router。设计源自身的路由与产品层路由分开列。

## 设计源自身(不进产品)

| Route | 作用 |
|---|---|
| `#/design` | **主工作台** —— 产品设计预览,默认落地路由 |
| `#/entry` | 总入口:分流到规范页与产品预览 |
| `#/spec` | 规范页:token、色板、组件清单、引擎支持矩阵 |
| `#/connect` | 新建连接向导(选引擎 → 填参数 → 测试与保存) |
| `#/settings` | 偏好设置:主题(跟随系统/浅色/深色)、密度(舒适/紧凑) |

## 产品层

Tab 不绑定连接,自身携带连接标识,路由仅用于深链定位:

| Route | 说明 |
|---|---|
| `#/design` | 工作台外壳,Tab 状态在内存中 |
| `#/design/data/:conn/:schema/:table` | 表数据 |
| `#/design/structure/:conn/:schema/:table` | 表结构(列/索引/约束/外键) |
| `#/design/ddl/:conn/:schema/:table` | DDL 预览 |
| `#/design/query` | 查询编辑器 |
| `#/design/search` | 全局对象搜索 |

## 键盘

| 快捷键 | 作用 |
|---|---|
| `⌘K` / `Ctrl+K` | 全局搜索 / 命令面板 |
| `↑` `↓` | 表格内移动焦点行 |
| `Shift+↑` / `Shift+↓` | 连续选择 |
| `⌘A` / `Ctrl+A` | 表格内全选 |
| `Enter` | 进入单元格编辑 |
| `Esc` | 退出编辑 / 关闭菜单与弹层 |
| `Tab` / `Shift+Tab` | 编辑态在单元格间移动 |

## 主题与密度

- 主题挂在 `<body data-theme="light|dark">`,默认跟随系统
  (`matchMedia('(prefers-color-scheme: dark)')`),用户可在设置里显式覆盖。
- 密度挂在 `<body data-density="comfortable|compact">`,影响行高、树行高、
  单元格内边距与基础字号。
- 两个属性都持久化在 `localStorage`。
