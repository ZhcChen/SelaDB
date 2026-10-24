# SelaDB GUI 架构：HTML / CSS / JS 作为源语言

> 状态：**2026-10-24 设计稿**，配套 [ADR-0006 自研 gui-core](adr/0006-self-built-gui-core.md) 与
> [gui-core-plan.md](gui-core-plan.md)（gui-core 内部方案）。
> 本文回答的是**更上一层的问题**：GUI 不用 Rust 原语写，而用 HTML/CSS/JS 写，
> 然后编译成 Rust。

---

## 0. 一句话与两个硬约束

**SelaDB 的界面用 HTML / CSS / JS 写，编译成 Rust。发布产物是纯 Rust 原生应用；
开发期有一个 Rust 写的解释器做即时预览。**

两个硬约束决定了整个架构：

| 约束 | 来源 | 后果 |
|---|---|---|
| **发布产物里没有 JS 引擎** | 「最终编译都是翻译成 Rust」 | 逻辑层必须能 AOT 到 Rust |
| **开发期要即时反馈** | 「主要还是开发运行时」 | 必须有解释器，且要跟 AOT 产出一致 |

**为什么是 HTML/CSS/JS 而不是自研 DSL** —— AI 时代的第一论据：全世界 AI 训练数据
里前端代码都是 HTML/CSS/JS。让 AI 写 SelaDB 界面，界面语言就是 HTML/CSS 时它零学习
成本；换成自研 Rust DSL，它得学一套世界上没有先例的 API。**这在 AI 编程时代是硬
劣势，不是风格偏好。**

第二论据：DOM 语义、flexbox、grid、级联、事件、焦点序、无障碍 —— 全是全世界被
验证过几万遍的东西。**照抄语义比自己发明便宜一个数量级。**

---

## 1. 全景

```text
┌─ 源码层 ────────────────────────────────────────────┐
│  声明  HTML   结构 + class                            │
│  样式  CSS    tokens.css / styles.css / pages.css     │
│  逻辑  JS     交互、状态机、视图编排                    │
└──────────────────────┬───────────────────────────────┘
                       │  编译期
┌──────────────────────▼───────────────────────────────┐
│  gui-parse      HTML / CSS / JS  →  IR                │
│  gui-ir         IR：节点模板 / 样式表 / 宿主绑定（零依赖） │
└──────────────────────┬───────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼─────────┐        ┌──────────▼──────────┐
│ gui-interp       │        │ gui-codegen         │
│ 解释执行（开发期） │        │ AOT：IR → Rust 源码   │
│ 改完就跑，不等编译  │        │ → cargo 增量编译      │
└───────┬─────────┘        └──────────┬──────────┘
        │                             │
        └──────────────┬──────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│  gui-core   运行时（两边共用）                         │
│  节点模型 · 布局(taffy) · 绘制(wgpu) · 事件            │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│  seladb-gui   应用                                    │
│  模板 · 业务绑定 · 控件库 · 资源                        │
└──────────────────────────────────────────────────────┘
```

**依赖方向永远单向**：`gui-ir` ← 一切。`gui-ir` 零依赖，纯数据结构。

---

## 2. 源码层：三层各自的职责

### 2.1 HTML —— 结构声明

**只描述结构与语义，不描述行为。**

```html
<div class="shell">
  <nav class="tree" role="navigation">
    <input class="tree__search" placeholder="筛选对象">
    <ul class="tree__list"><!-- 数据由虚拟列表提供 --></ul>
  </nav>
  <main class="workspace">
    <div class="grid" data-virtual-table="users"></div>
  </main>
</div>
```

**设计源只有 13 个静态标签**（9 个是文档壳），界面是 JS 造的 —— 这不影响设计，
因为设计源是浏览器里的「假后端 + 逻辑层」，Rust 实现侧是「真后端 + 声明层」。
但它说明：**HTML 解析器要支持的是我们自己写的模板，子集由我们自己定，可以很小。**

### 2.2 CSS —— 样式

`tokens.css` 是唯一设计源（颜色 / 间距 / 字号 / 圆角 / 阴影 / 动效）。
**编译期解析成样式表**，运行时不做 CSS 解析。

实测子集（2026-10-24，`gui-core-plan.md` §5.1）：508 条声明组 / 528 条选择器。
**子代 `>`、通用兄弟 `~`、`:not()`、`:nth-child()`、ID 选择器、`!important`、
`calc()`、`@media` / `@supports` / `@layer` / `@container` / `@import` / `@font-face`
全是 0。** 所以「照抄 CSS」不是「实现 Blink」，是「实现一个 CSS 子集引擎」。

### 2.3 JS —— 逻辑层本体

**这是本架构最容易被误解的一点，也是我最早理解错的地方。**

设计源那 8362 行 JS **不是 mock，是逻辑层的浏览器版**。它在浏览器里跑的时候
需要一个假后端，于是有 `mock-data.js` / `mock-sql.js`；SelaDB 里跑的时候，
假后端换成 Rust 对象，**JS 一行不改**。

这带来一个很强的性质：

> **设计源从此不只是「视觉基线」，而是逻辑层的可运行参考实现。**
> 浏览器里双击即开（跑 mock 后端），Rust 引擎里跑真后端，同一份 JS。

---

## 3. IR：三个部分

IR 是**唯一真源**。两个执行路径、三个后端（样式匹配 / 布局 / 绘制）都从 IR 出发，
不各自解析一遍。

### 3.1 节点模板（`gui_ir::node`）

**是「HTML 的结构」，不是运行时的活树。** 没有计算样式、没有几何、没有事件监听。

| | `NodeKind::Element` | `NodeKind::VirtualList` |
|---|---|---|
| 进节点树 | ✓ | **✗**（只存一个描述） |
| 参与布局 | ✓ | ✓（占位 + 滚动条） |
| 绘制 | 递归画子节点 | **引擎直接画行**，不经过节点树 |

第二类是「虚拟化表」—— 见 §7。

### 3.2 样式表（`gui_ir::style`）

```text
规则表    选择器 → 声明列表（按源码顺序 —— 同特异性后来者胜依赖顺序）
变量表    自定义属性的定义（tokens.css 的 233 个 token）
主题层    data-theme / data-density 的覆盖层（设计源是 5 段）
```

**「不支持」要报错，不能忽略。** 解析遇到不认识的东西 → 记进 `unsupported` →
**编译失败**。这是 §1.3「完备性验收：未支持属性 = 0」的落地点。

### 3.3 宿主绑定（`gui_ir::host`）

见 §6。

---

## 4. 两个执行路径

### 4.1 gui-interp —— 解释执行（开发期）

解析 → IR → **直接执行**。改了 JS 刷新就跑，不等 cargo。

### 4.2 gui-codegen —— AOT（发布期）

IR → **Rust 源码** → cargo 编译 → 原生应用。

**「翻译」不是「转译」**：转译是逐行换皮（JS 的 `x++` → Rust 的 `x++`，不存在）；
翻译是**语义等价**（`x++` → `x += 1`）。产物是**读得懂、能断点、能进 profiler
的 Rust 代码**。

### 4.3 一致性契约 —— 本项目最关键的测试设施

> **同一批 HTML/CSS/JS 输入，解释执行的结果与 AOT 产物的结果必须逐像素相同。**

这是两条路径能共存的前提。它需要：

- 同一套 IR
- 同一套宿主 API 面（§6 的 10 个名字）
- 同一套样式匹配 / 布局 / 绘制实现（都在 gui-core）
- 一套**对拍测试**：同一输入跑两条路径，比对 DisplayList 与截图

**代价要说清楚**：JS 语义要在两处实现（解释器的引擎 + AOT 编译器）。这是本架构
最容易被低估的成本。缓解办法是**子集足够小**（下面 §4.4 的实测），且两条路径
共享绝大部分。

### 4.4 JS 子集实测（2026-10-24，`scripts/probe-js-subset.mjs`）

设计源 15 个文件、8362 行 JS：

| 特性 | 次数 | | 特性 | 次数 |
|---|---|---|---|---|
| 正则字面量 | 99 | | 箭头函数 | 242 |
| 模板字符串 | 148 | | **私有字段 `#`** | 234 |
| `this.` | 753 | | `this.x =` | 177 |
| `++` / `--` | 2041 | | 类声明 | 12 |
| **闭包捕获可变外层变量** | **69** | ⚠ | **标签模板** | **40** |
| 闭包内 `this` | 31 | | 类继承 | 4 |
| `await` | 5 | | `async` 函数 | 4 |
| `Promise` | 1 | | 解构声明 | 29 |
| `for-of` | 66 | | Map / Set | 21 |

**四个「无底洞」全是 0**：

| | 次数 | 意义 |
|---|---|---|
| 生成器 / yield | **0** | 不用处理协程状态机 |
| Proxy / Reflect | **0** | 不用做元编程 |
| Symbol | **0** | 不用做属性键类型系统 |
| eval / new Function | **0** | 不用做动态编译 |

**另外三个决定性的简化**：

- **ES module 语法 0 处、IIFE 0 处** → 173 个顶层名字、**跨文件重名 0 个**
  → **per-file 翻译成立，不需要链接器**
- **await 5 / async 4 / Promise 1** → 几乎不用异步，**不必把 async/await
  翻成 Rust 的 async runtime**
- **正则 99 条**：lookaround / 反向引用 / 命名组 / 原子组 / Unicode 属性
  **全是 0** → 全部落在 Rust `regex` crate 支持范围内，可直接映射

**真正需要先设计的只有 3 处**：

1. **闭包捕获可变外层变量（69 处）** → Rust 要 `&mut` 生命周期标注。**最可能出真编译错误**
2. **标签模板（40 处）** → 要转成 Rust 宏
3. **类字段的 `&mut self` 借用规则（177 处 `this.x =`）**

其余是机械改写。局部 `let` 只占 18%（47 顶层 vs 57 全部）→ 闭包捕获可变状态的面很窄。

---

## 5. gui-core —— 运行时（两边共用）

已有骨架（`crates/gui-core/src/lib.rs` 声明了分层）：

```text
  widget/   控件层     Button / TextInput / Table / Tree …
  event/    事件层     命中测试、capture / target / bubble 三阶段
  paint/    绘制层     样式树 + 布局结果 → 绘制指令（display list）
  layout/   布局层     taffy：CSS Flexbox / Grid / Block 规范实现
  text/     文本层     cosmic-text：整形、换行、行盒
  style/    样式层     CSS 解析 → 选择器匹配 → 级联 → ComputedStyle
  dom/      结构层     节点树（arena 存储）
```

一帧的流水线：

```text
  DOM 树 + 样式表 + 元素状态
         │  style：级联、特异性、继承、伪类
         ▼
  ComputedStyle（每节点的绝对值样式）
         │  layout：taffy
         ▼
  几何盒（每个节点的 border box）
         │  paint：生成绘制指令
         ▼
  DisplayList → GPU 后端提交
```

**绘制算法参考浏览器**：taffy 本来就是 Blink 布局算法的 Rust 移植，这条天然对齐。
绘制层（display list → layer → raster）照 Blink 的分层来。

**独立性约束**：`gui-core` 不依赖任何业务代码，公开 API 不泄漏第三方类型
（taffy / cosmic-text / cssparser 只出现在 `internal` 与实现细节里）。这样将来
整体拆成独立仓库时依赖关系不外泄。

---

## 6. 「对象」—— 唯一的宿主收口

### 6.1 它不是凭空设计的

设计源在浏览器里跑的时候，逻辑层调用的是 `mock-data.js` + `mock-sql.js` 里的
全局。**实测（`scripts/probe-bridge.mjs`）：mock 层定义 31 个顶层名字，
逻辑层实际只用到 10 个。**

| 组 | 名字 | Rust 侧对应 | 状态 |
|---|---|---|---|
| 数据 | `CONNECTIONS` | `list_databases` / 连接配置 | ✅ |
| 数据 | `TABLE_DATA` | 查询结果 | ✅ |
| 数据 | `TABLE_STRUCTURE` | `describe_table` | ✅ |
| 数据 | `DOCUMENTS` | MongoDB 文档 | ❌ 未做 |
| 数据 | `KEYS` | Redis 键 | ❌ 未做 |
| 数据 | `ENGINES` | `Engine` 枚举 | ✅ |
| 数据 | `UI_COPY` | 文案表 | ❌ 未做 |
| 函数 | `executeQuery(sql, {tables})` | `service::run_query` | ✅ |
| 函数 | `splitStatements(sql)` | 多语句切分 | ❌ **缺** |
| 函数 | `generateDdl(dataKey)` | DDL 预览 | ❌ **缺** |

其余 21 个是 mock 的内部辅助（SQL 分词、DDL 拼装、类型推断），逻辑层一次都不碰，
**Rust 侧也不用做**。

**所以「换后端就是换实现，调用点一行不改」** —— 这是这套架构最省事的地方。

### 6.2 名字必须逐字一致

JS 侧是**全局**（设计源不能用 ES module，`file://` 下 CORS 会拦），所以宿主必须
以 `SELADB` 这个名字注入全局作用域，能力名与 mock 层**逐字一致**：

```js
// 浏览器里（设计源）
SELADB.TABLE_DATA          // ← mock-data.js 提供的全局

// SelaDB 里
SELADB.TABLE_DATA          // ← Rust 对象提供，同样的名字
```

### 6.3 三类能力，一个收口

```text
SELADB
  ├─ 后端能力      上面那 10 个
  ├─ DOM 面        createElement / appendChild / classList / getBoundingClientRect …
  │                （约 37 种，探针实测）
  └─ 系统级调用    文件 / 进程 / 网络（Rust 提供）
```

### 6.4 FFI / JNI 的收口

需求：Rust 侧可以把「调用其他语言（FFI / JNI）」的能力挂到这个对象上，而
**核心仍然由 Rust 提供**。

落法（`gui_ir::host::ForeignRegistry`）：

- 对象持有一张**不透明句柄表**（`HashMap<u32, ForeignHandle>`）
- JS 侧：`SELADB.foreign.invoke(handle, "method", args)`
- **实际的外语调用由 Rust 执行**，JS 永远不直接碰 FFI / JNI

好处：核心保持 Rust 原生；跨语言调用是**单一可审计的收口**，可限制、可回溯。
句柄的创建与释放规则也由 Rust 一处管。

---

## 7. 虚拟化：节点不是数据的唯一通路

**这是数据网格不炸内存的唯一办法，浏览器也是这么做的（它也不把行放进 DOM）。**

设计源自己的数据网格**早就是虚拟化的**：`rowPool` 复用 DOM 行，只渲染
「视口内 + 上下各 10 行余量」，用 `scrollTop` / `clientHeight` /
`getBoundingClientRect` 自绘。**它早就承认了「DOM 行不是数据通路」。**

引擎侧对应：

| | 结构节点 | 虚拟化表节点 |
|---|---|---|
| 进节点树 | ✓ | **✗**（只存一个描述） |
| 参与布局 | ✓ | ✓（占位 + 滚动条） |
| 绘制 | 递归绘制子节点 | **引擎直接画行** |

**关键点：虚拟化在引擎层，不在组件层。** 逻辑层只声明「这是一张 N 行的表 + 列定义 +
排序状态」，行池、定位、绘制全在引擎。组件不是「自己实现虚拟化」。

---

## 8. crate 划分与依赖方向

| crate | 职责 | 依赖 |
|---|---|---|
| `gui-ir` | IR 数据结构 | **零依赖** |
| `gui-parse` | HTML / CSS / JS → IR | gui-ir、cssparser |
| `gui-core` | 运行时：节点模型 / 布局 / 绘制 / 事件 | taffy、cosmic-text、（可选）wgpu |
| `gui-interp` | 解释执行（开发期） | gui-ir、gui-parse、gui-core |
| `gui-codegen` | AOT 代码生成（发布期） | gui-ir |
| `seladb-gui` | 应用：模板 / 业务绑定 / 控件库 | gui-core（+ 开发期 gui-interp） |

```text
gui-ir ← gui-parse ← gui-interp ← seladb-gui(开发期)
  ↑         │            │
  │         │            └──→ gui-core
  │         │
  └── gui-codegen ← seladb-gui(发布期)
        ↑
     gui-core（运行时，两边共用）
```

**为什么 `gui-interp` 与 `gui-codegen` 分开**：如果合在一起，`gui-core` 就会依赖
解析器，破坏「gui-core 可独立成项目」的目标。开发期的解释器是**工具链**的一部分，
不是运行时框架的一部分。

---

## 9. 一致性验证设施

本项目最关键的测试设施。三个层次：

1. **IR 往返**：`HTML → IR → HTML` 应当等价（注释保留就是为了这个）
2. **双实现对拍**：同一输入，解释执行 vs AOT 产物 → **逐像素相同**
3. **完备性**：设计源 CSS / HTML 全量喂进引擎，**未支持项 = 0**

第 2 条需要 gui-core 提供一个「能跑任意 IR 并出图」的入口 —— 这也是
`gui-core` 必须能脱离 gui-parse 独立存在的原因。

---

## 10. 里程碑

| # | 交付物 | 完成判据 |
|---|---|---|
| M0 | `gui-core` 能编译 | 8 个模块补齐，`cargo check` 过 |
| M1 | `gui-ir` + `gui-parse`（HTML/CSS） | 解析设计源 CSS 零 unsupported |
| M2 | `gui-core` 布局 + 绘制 | 一个静态页面上屏，几何与 Chromium 偏差 0 |
| M3 | `gui-interp` | 能解释执行 JS 逻辑层，交互可用 |
| M4 | `gui-codegen`（JS → Rust） | 翻一个真类（TreeView）并验证行为一致 |
| M5 | 宿主对象 `SELADB` | 10 个能力全部接上 Rust |
| M6 | 虚拟化表 | 10 万行不爆内存，滚动流畅 |
| M7 | 一致性对拍 | 解释 vs AOT 逐像素相同 |
| M8 | 完整应用 | 设计源 V0.6 的全部界面在 Rust 侧跑起来 |

**M4 是风险点**：它是第一个真类，闭包可变捕获（69 处）的问题会在这里第一次暴露。

---

## 11. 风险登记

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | **JS 语义双实现不一致**（解释器 vs AOT） | 高 | M7 对拍是硬门禁；子集小 |
| R2 | 闭包可变捕获在 Rust 里表达不了 | 高 | M4 先验证；必要时限制子集（禁止闭包捕获可变变量） |
| R3 | 自研 JS 解析器工作量大 | 中 | 用 `swc` 系（Apache-2.0，待核实），不自研解析器 |
| R4 | 总产能（自研 GUI 框架已估 8–18 个月，加上工具链与开发套件） | 高 | 里程碑切小；每步都有可运行产物 |
| R5 | cssparser 的 MPL-2.0 不在白名单 | 中 | **待拍板**（taffy 的 `parse` feature 已经依赖它） |
| R6 | 「不嵌 JS 引擎」的开发期运行时成本被低估 | 中 | 开发期可用现成引擎（QuickJS/boa），只要求 AOT 与它行为一致 |

---

## 12. 待拍板

| # | 问题 | 我的建议 |
|---|---|---|
| D1 | 样式表输入形态 | **编译期编译**（已定，见 §2.2） |
| D2 | CSS 子集边界 | 按 `gui-core-plan.md` §5.1 写死；加 HTML 子集 |
| D3 | **JS → Rust 编译器自研还是用现成** | 自研 codegen（AST→Rust），但 **JS 解析器用 swc**（不自研） |
| D4 | **开发期运行时用现成 JS 引擎还是自研解释器** | 用现成（boa/QuickJS），不自研 JS 引擎；一致性靠对拍 |
| D5 | **HTML 结构是翻译成 Rust 代码，还是编译成二进制数据** | 倾向**二进制数据**（结构改动不必全量重编）；逻辑才 AOT |
| D6 | cssparser 的 MPL-2.0 白名单 | 承认（taffy 已依赖） |
| D7 | 标签模板（40 处）怎么翻 | 待 M4 验证时定 |
| D8 | 宿主对象在 JS 侧的名字 | `SELADB`（与 mock 层能力名逐字一致） |

---

## 附录 A：实测数据来源

| 数据 | 脚本 | 日期 |
|---|---|---|
| CSS 子集（508 声明组 / 528 选择器） | `gui-core-plan.md` §5.1（已核实） | 2026-10-24 |
| HTML 子集（13 静态标签 / 364 个 JS 造的元素 / 37 种 DOM API） | `scripts/probe-html-subset.mjs` | 2026-10-24 |
| 宿主接口面（10 个名字） | `scripts/probe-bridge.mjs` | 2026-10-24 |
| JS 特性面（31 / 50 种在用） | `scripts/probe-js-subset.mjs` | 2026-10-24 |
| Rust 咬人点（`++` 2041 / `this.` 753 / 闭包可变 69） | `scripts/probe-js-rust.mjs` | 2026-10-24 |
| 正则面（99 条，不可翻译特性 0） | `scripts/probe-regex.mjs` | 2026-10-24 |
