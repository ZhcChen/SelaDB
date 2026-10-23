# SelaDB 自研 GUI 框架方案（`gui-core`）

> 状态：**2026-10-23 评审稿**，待拍板后转 ADR。
>
> 目的：把散在 ADR-0006、`gui-framework-architecture.md`、`gui-framework-comparison.md`
> 里的决策，连同从设计源实测出来的硬约束，收敛成**一份可执行的方案**。

## 0. 阅读指引

### 0.1 这份文档解决什么

之前的架构文档是「按层讲清楚每层做什么」，但有几件事一直没有落到字面上：

1. **CSS 引擎的支持范围到底多大** —— ADR-0006 说「HTML/CSS 风格」，但没说什么算「风格」
2. **样式表怎么进到引擎里** —— 运行时读文件还是构建期编译，从未正面讨论
3. **taffy / cosmic-text 到底覆盖到哪、缺口谁来补** —— 只有抽象描述，没有逐项核对
4. **「做成了」的标准是什么** —— 没有可自动化的验收定义

本文档把这四件事写死。所有结论都来自对 `ui/assets/*.css`（4170 行）与
`taffy 0.15` / `cosmic-text 0.19` 源码的逐项核对，不是估计。

> 数字口径：4170 行是 `ui/assets/` 下三个 CSS 文件合计
> （`styles.css` 2837 / `pages.css` 882 / `tokens.css` 451）。
> 引擎要吃的是 CSS，不是同目录下的 8362 行 JS —— 别把两者加在一起当工作量。

### 0.2 与既有文档的关系

| 文档 | 关系 |
|---|---|
| `docs/adr/0006-self-built-gui-core.md` | **仍然有效**。路线决策（自研、不引 gpui）与依赖选型以它为准 |
| `docs/gui-framework-architecture.md` | 本文**取代**其 §11「待决问题」与 §4/§7 的定性描述；其余分层图仍有效 |
| `docs/gui-framework-comparison.md` | 其 §4「借鉴清单」被本文 §8 吸收；其余对比结论仍有效 |
| `docs/fidelity-measurement.md` | GPUI 时期的实测记录，**结论仍有效**（taffy 与浏览器同源），本文 §6 复用其方法 |
| `docs/ui-design-plan.md` | 设计源侧基线，§10「Rust 实现侧对齐清单」需按本文 §7 补充 |

**不新建第二套真源**：本文若与其他文档冲突，以 ADR-0006 为准，其余以本文为准。

---

## 1. 目标与非目标

### 1.1 目标

| # | 目标 | 为什么是它 |
|---|---|---|
| G1 | **用 CSS 描述界面**，样式与结构分离 | 设计源的 CSS 直接驱动实现，不再人工翻译成 builder 调用（`css-dsl-strategy.md` §4 指出的核心痛点） |
| G2 | **三平台统一 wgpu 渲染** | macOS Metal / Windows D3D12 / Linux Vulkan 一套代码路径 |
| G3 | **100% 中文可用** | 三平台中文 IME + 中文断行 + 中文表格列宽，是本项目的差异化硬指标 |
| G4 | **CLI / MCP / GUI 共用一套 service 层** | AGENTS.md 硬约束 3：业务逻辑只在 `seladb-core/src/service/` |
| G5 | **万行级密集数据网格 + 多级懒加载对象树** | 2026 年 Rust GUI 生态无一开箱可用（ADR-0006 决定性理由） |
| G6 | **无头可测** | GUI 用例一律不建窗口（AGENTS.md 硬约束 8） |
| G7 | **框架零业务依赖，将来可整体拆仓** | ADR-0006 决策 4、5 |

### 1.2 非目标

- **不做完整 CSS 引擎**。不做 `@media` / `@supports` / `@layer` / `@container`、不做 `float`、
  不做 `calc()` 混算、不做 `filter` / `backdrop-filter` / `clip-path`
- **不做行内格式化上下文的完整实现**（见 §5.4，限定范围实现）
- **不追求像素级 100%**。光栅化策略不同（抗锯齿、hinting、亚像素取整、圆角与阴影的
  抗锯齿算法）使像素级一致不可达（`gui-framework-architecture.md` §9.2）
- **不做 3D、滤镜、混合模式**
- **不追求多线程渲染**。单线程渲染 + 数据层并行是够用的形态

### 1.3 「做成了」的定义（可自动化的验收）

这是本文档最重要的一节。**每一条都要能进 CI**：

| 层 | 指标 | 目标 | 怎么测 |
|---|---|---|---|
| 几何 | 每个节点的 `LayoutBox` vs Chromium 逐节点比对 | **偏差 0** | 复用 `fidelity-measurement.md` 的浏览器测量法，改为对 `gui-core` 测 |
| 样式 | 每个节点的 computed style 逐属性比对 | **差异 0** | 新增：同一棵 DOM + 同一份 CSS，引擎输出 vs `getComputedStyle` |
| 文本 | 同字体下 advance width | **≤ 0.01px** | 浏览器 `Range.getBoundingClientRect` vs 引擎字形宽度 |
| 像素 | SSIM / 感知哈希 | **≥ 0.97** | 同一场景跨后端出图比对（借 nanoui 三后端一致性测试的做法） |
| 完备性 | **设计源三个 CSS 文件全量喂进引擎，不允许有「未支持属性」** | 0 个 | 编译期校验 + 运行期报告 |
| 交互 | 无头用例覆盖 hover / focus / 选区 / 滚动 / IME 预编辑 | 全绿 | `TestHarness` |
| 许可 | 依赖树中无未列入白名单的许可证 | 0 | `cargo license` + CI 检查 |

**关键设计**：「完备性」这一条把「CSS 支持范围」从形容词变成了**可数的集合**。
凡是 Chromium 有差异的地方，要么补实现，要么回到设计源改掉——不允许「先不精确」。

---

## 2. 硬约束

### 2.1 来自 `AGENTS.md`

| # | 约束 | 对本方案的含义 |
|---|---|---|
| 1 | Cargo 多 crate 工作区，gui-core 不污染 CLI/MCP 构建 | `wgpu` / `winit` 放在 `feature = "gpu"` 后面；核心逻辑不依赖 GPU |
| 2 | 只依赖宽松许可证的 crate | cssparser 是 MPL-2.0，**需在白名单里显式承认**（见 §10） |
| 3 | 业务逻辑只在 `seladb-core/src/service/` | gui-core 只放 primitive，seladb-gui 放业务组件 |
| 6 | gui-core 调用收敛在 seladb-gui 内 | gui-core 公开 API 不泄漏 taffy / cosmic-text / wgpu 类型 |
| 8 | 跑 GUI 用例一律无头 | `TestHarness` 是框架的一等公民，不是测试辅助工具 |

### 2.2 来自 ADR-0006

- 公开 API 不泄漏第三方类型（`LayoutBox` 而不是 `taffy::Rect`）
- 依赖方向永远单向：`dom ← style ← layout ← paint ← widget`
- 未来可整体拆仓 → gui-core **零业务依赖**，不引用 SelaDB 任何东西

### 2.3 硬规则：CSS 引擎归 gui-core，样式表归 seladb-gui

这条是从「零业务依赖」推出来的，必须写死：

```text
gui-core        提供：CSS 文本 → 样式表 → 级联 → 计算样式 → 布局 → 绘制指令
seladb-gui     提供：tokens.css / styles.css / pages.css 的编译产物 + 业务控件
```

gui-core **不认识** `--fg-muted`、`--engine-postgresql` 这类 token，
它只认识 `var(--x)` 这种通用机制。token 的语义在 seladb-gui 一侧。

---

## 3. 总体架构

### 3.1 分层与依赖方向

```text
┌─ widget ────────────────────────────────────────────┐
│  Tree / Table / Editor / Palette / Menu / Dialog    │  ← 全部自写
├─ event ─────────────────────────────────────────────┤
│  命中测试 · capture/target/bubble · 焦点 · IME      │
├─ paint ──────────────────────────────────────────────┤
│  样式 + 几何 → DisplayList（绘制指令）              │
├─ layout ────────────────────────────────────────────┤
│  taffy：Flexbox / Grid / Block ＋  sticky/滚动补法  │
├─ text ───────────────────────────────────────────────┤
│  cosmic-text：整形 · 断行 · bidi · 字形输出          │
├─ style ─────────────────────────────────────────────┤
│  CSS 解析 → 选择器匹配 → 级联 → 变量 → ComputedStyle│
├─ dom ────────────────────────────────────────────────┤
│  节点树（arena）                                     │
└─ platform ───────────────────────────────────────────┘
   winit 窗口 / wgpu 渲染 / accesskit IME+无障碍
```

### 3.2 一帧的流水线

```text
输入：节点树 + 样式表 + 元素状态(:hover/:focus/:checked) + 视口尺寸 + 滚动偏移
  │
  ├─[1] STYLE     算每个节点的最终样式
  │        输出：ComputedStyle × N
  ├─[2] LAYOUT    算几何（taffy）
  │        输出：LayoutBox × N
  ├─[3] STICKY    滚动容器内的粘性偏移修正（§5.3）
  ├─[4] TEXT      文本整形 + 断行 + 行盒 + 对齐（§5.5）
  ├─[5] PAINT     生成绘制指令
  │        输出：DisplayList
  └─[6] COMMIT    提交 GPU
```

### 3.3 为什么 Style / Layout / Paint 必须分开

场景：用户 hover 一行数据，该行背景变色。

| 阶段 | 重跑？ | 代价 |
|---|---|---|
| Style | ✅ 只重算被改的节点 | 便宜 |
| Layout | ❌ 尺寸没变 | **贵**（O(n)，要解 flex/grid 约束） |
| Text | ❌ | 中 |
| Paint | ✅ 只重画这个盒子 | 中 |

合成一步，改个颜色就要全树重排 —— 在万行网格里是灾难。

绘制指令必须**先攒成 display list 再提交**，理由：一次提交减少 GPU 调用、
支持脏区重绘、支持从 `LayoutBox` 直接命中（不读像素）、支持录制回放。

---

## 4. 结构层（dom）

**现状**：`crates/gui-core/src/dom.rs` 已实现且可用。

```rust
pub struct Node {
    pub tag: Option<ElementId>,
    pub id: Option<String>,
    pub classes: Vec<String>,
    pub inline_style: Option<String>,
    pub children: Vec<NodeId>,
    pub parent: Option<NodeId>,
}
```

arena 存储（`Vec` + `NodeId(u32)`），提供 `descendants` / `depth` / `ancestors`
三个遍历原语 —— 后代选择器匹配、继承链、层叠上下文都要用。

### 4.1 需要补的

| 缺什么 | 为什么 | 优先级 |
|---|---|---|
| 任意属性（不止 id/class） | 设计源用 `[data-depth="0"]`（5 处）、`[contenteditable="true"]`、`[disabled]` | 高 |
| 伪元素宿主位 | `::before` / `::after`（13 处）需要在节点树上占位才能参与布局 | 高 |
| 状态位（`:hover` / `:focus` / `:checked` / `:disabled`） | 可以放属性表，也可以单独一个 bit 集合 | 高 |
| 文本节点 | `Node` 只有元素；文本内容要能挂在节点上 | 高 |
| 样式脏标记 | 增量级联需要知道哪些节点要重算 | 高 |

### 4.2 一个关键决定：DOM 是「Rust 侧建树」还是「解析 HTML」

**决定：Rust 侧建树，CSS 文本直接喂给引擎。**

理由：

- 设计源的 HTML 只是一份**原型**，`docs/ui-design-plan.md` §10 明确「设计源不负责功能完备性」。
  真实产品的结构由 Rust 代码决定（数据网格有虚拟滚动，不能是静态 HTML）
- 解析 HTML 需要再引一个 HTML 解析器（许可 + 体积），而收益只是「省几行建树代码」
- CSS 是**样式**，它与结构解耦；只要 class 名与 tag 名对得上，CSS 就能直接用

代价：CSS 里的标签选择器（`input`、`body`）要求 Rust 侧用**同样的 tag 名**建树。
→ 因此 §7 的翻译清单里要写明 `tag ↔ Rust 组件` 的对应表。

---

## 5. 样式层（style）—— 本方案的核心

### 5.1 CSS 子集规格（**从设计源实测得出**）

> **计数口径**（读者要能照着复现）：
> 单位是**声明组（规则块）** —— 一条 `选择器 { … }` 算一条，逗号分隔的选择器组算一条。
> 下面两张表都用这个口径；括号里另有说明的才用别的口径。
> 基准：`ui/assets/` 三个 CSS 文件（4170 行），去注释后 **508 条声明组 / 528 条选择器**。

#### 选择器：支持什么

| 形态 | 设计源用量 | 支持 |
|---|---|:--:|
| 类选择器 `.a` | 477 条声明组含类（占 528 条选择器的 92.8%） | ✅ |
| 后代组合器（空格） | 53 条（末段是类 33 + 末段是标签 20） | ✅ |
| 标签选择器 `div` | 41 条选择器（占 528 条的 7.8%） | ✅ |
| 伪元素 `::x` | 24 处（`::before` 7 / `::after` 6 / `::placeholder` 4 / `::-webkit-scrollbar` 7） | ✅ |
| 伪类 `:x` | 见下方清单 | ✅ |
| 属性选择器 `[x]` / `[x="y"]` | 21 处（无值形式 7 + 有值形式 14，共 10 种） | ✅ |
| 相邻兄弟 `+` | 6（全是开关与复选框的 `:checked + .track` / `:focus-visible + .box`） | ✅ |
| 通配 `*` | 3 | ✅ |
| **子代组合器 `>`** | **0** | ❌ 不需要 |
| **通用兄弟 `~`** | **0** | ❌ 不需要 |
| **`:not()`** | **0** | ❌ 不需要 |
| **`:nth-child()` / `:first-child`** | **0** | ❌ 不需要 |
| **ID 选择器 `#a`** | **0** | ⚠️ 可留可去（实现成本极低，建议留着） |
| **`!important`** | **0** | ❌ 不需要 |

#### 伪类：具体清单

`:hover`(34) · `:focus`(9) · `:checked`(4) · `:last-child`(4) · `:active`(2) ·
`:disabled`(2) · `:focus-visible` · `:root`

#### 伪元素：具体清单

`::before`(7) · `::after`(6) · `::placeholder`(4) · `::-webkit-scrollbar`(7，浏览器专有，见 §7)

#### @ 规则

`@keyframes` × 5（`menu-in` / `palette-in` / `palette-fade` / `drawer-in` / `toast-in`）✅
其余全部 **0 使用**：`@media` / `@supports` / `@layer` / `@container` / `@import` / `@font-face`

#### 值的语法复杂度

| 语法 | 设计源用量 | 难度 |
|---|---|---|
| `var(--x)` | **1084**（233 个定义） | 变量解析 + 继承 + fallback + 循环检测 |
| `repeat(auto-fill, minmax(148px, 1fr))` | 4 | 高（taffy 已支持，见 §5.3） |
| `1fr 1.4fr 28px` | 1 | 中 |
| `42px max-content` | 1 | 中（taffy 支持 `max-content`） |
| `grid-column: 1 / -1` | 10 处声明（grid-column 6 + grid-row 4） | 中（负索引，taffy 支持） |
| `flex: none` / `flex: 1` | 57 / 43 | 低 |
| `calc()` | **0** | 不需要 |
| `min()` / `max()` | 2 / 5 | 低 |

#### 结论：级联引擎的完备性边界

```text
级联 = 特异性 + 出现顺序 + 继承 + 变量
```

**不需要**：来源优先级（行内 style 属性可保留但设计源 0 使用）、`!important`、
计算值的复杂规则、简写展开的全部边角。

这直接回答了 `gui-framework-architecture.md` §11 第 1 问：
**不接 Stylo**。Stylo 带来的全特性级联、逻辑属性、方向性继承，我们一条都不需要；
而我们需要的「变量继承链 + 伪类状态重算 + 伪元素生成」Stylo 也不直接给。

### 5.2 选择器引擎与级联算法

**匹配**：从右往左（最右复合选择器）匹配，再向左验证祖先链。
设计源最深的后代链是 3 段（`.btn.btn--tool[disabled]` 算 1 段复合 + 1 个后代），
匹配开销可忽略。

**特异性**：`(ID=1, 类/属性/伪类=1, 标签=1)` 三元组比较 —— CSS 标准算法，
不需要 `:is()` / `:where()` 的特殊规则。

**级联**：

```text
for each node:
    matched = 选择器匹配(样式表, node)      // 按特异性与顺序排序
    declared = 展开简写 + 解开 var()        // 见 §5.6
    computed = declared 覆盖 inherited        // 继承属性取父节点
```

**增量**：状态变化（`:hover`）只重算受影响节点；DOM 属性变化（`[data-depth]`）
只重算该子树；样式表变化全量重算。

### 5.3 布局层：taffy 覆盖到哪、缺口谁来补

#### taffy 0.15 已覆盖（逐项核实枚举）

| CSS 能力 | taffy 实现 | 设计源需求 | 缺口 |
|---|---|---|---|
| `position` | Static / Relative / Absolute / **Fixed** / **Sticky** | sticky 5、fixed 4 | ✅ 无 |
| `overflow` | Visible / Clip / Hidden / Scroll（`scrollbar_width` 预留条宽） | auto 14、hidden 28 | ✅ 无 |
| `display` | Block / FlowRoot / Flex / Grid / None | flex 89、grid 29 | ⚠️ 无 inline-*（§5.4） |
| grid 轨道 | `repeat(auto-fill/auto-fit, minmax(...))`、`fr`、`max-content`/`min-content`/`fit-content` | 4 处 auto-fill | ✅ 无 |
| grid 放置 | `GridLine(i16)`，支持负索引 | `1 / -1` | ✅ 无 |
| flex | `flexbox_balance` 已开 | `flex: none`/`1` | ✅ 无 |
| float | 有 `float_layout` feature | **0 使用** | 🚫 关闭该 feature |

#### taffy 自带的 CSS 值解析器（`parse` feature）

实现了 `FromCss` 的**值类型**：

```text
LengthPercentage · LengthPercentageAuto · Dimension · FlexWrap
TrackSizingFunction · MinTrackSizingFunction · MaxTrackSizingFunction
RepetitionCount · GridAutoFlow · GridAutoTracks
AlignItems · AlignContent · AvailableSpace · Contain
```

→ **最难的维度语法不用自己写**：`repeat(auto-fill, minmax(148px, 1fr))`、
`1fr 1.4fr 28px`、`42px max-content` 直接用 taffy 的解析器。

但 **`Style` 整体没有 `FromCss`** → 「属性名 → Style 哪个字段 → 解析值」
这段**声明块逻辑仍要自己写**（约 40 个属性名 → 字段的映射表 + 分派）。

#### 缺口补法（全部自己写，但都有明确算法）

| 缺口 | 补法 | 复杂度 |
|---|---|---|
| **sticky 偏移** | taffy 按 relative 处理并保留占位；渲染前根据滚动偏移算 `clamp(inset_top, 元素在容器内的位置, inset_bottom)`，施加为绘制偏移 | 中 |
| **滚动** | 自实现 `ScrollContainer`：`scroll_offset` + 裁剪矩形 + 自绘滚动条（taffy 的 `Overflow::Scroll` 只预留条宽，不滚） | 中 |
| **fixed** | taffy 有 `Position::Fixed`，但 CSS 的 fixed 相对视口、transform 会改变包含块 —— 取「相对视口」的简单语义 | 低 |
| **inline-flex / inline-grid** | 见 §5.4 | **高** |
| **滚动条外观** | `::-webkit-scrollbar` 是浏览器专有，见 §7 翻译清单 | 低 |

### 5.4 inline 布局：唯一的真缺口

**事实**：taffy 的 `Display` 没有 `inline-flex` / `inline-grid` ——
它**完全没有行内格式化上下文**。cosmic-text 也没有基线对齐与 strut。

**设计源用量**：`inline-flex` 9 处、`inline-grid` 1 处。

**三条路**：

| 方案 | 内容 | 代价 | 判断 |
|---|---|---|---|
| (a) 降级成 flex | 逐个检查这 10 处是否单行内使用，是则直接用 flex + `white-space: nowrap` | 若有用例依赖基线对齐则破功 | **先做这个** |
| (b) 受限 inline | 单行、不做基线对齐、`inline-flex` 当 flex、只支持混排不同 font-size/font-family 的片段 | 中 | (a) 不够时再上 |
| (c) 改设计源 | 把 10 处 inline-* 改成 flex | 改设计源 = 改基线 | 只在 (a)(b) 都不行时 |

> **文档修正**：`gui-framework-architecture.md` §8.2 建议「在设计规范层面禁用 inline」，
> 但设计源现在有 10 处 inline-*。正确表述是「**限定范围地实现**」，不是禁用。

### 5.5 文本层：cosmic-text 覆盖到哪、缺口谁来补

#### cosmic-text 0.19 已给

| 能力 | 位置 |
|---|---|
| 整形（swash / HarfBuzz） | `shape.rs` |
| UAX#14 断行 | 依赖 `unicode-linebreak` |
| 双向文本 | 依赖 `unicode-bidi` |
| 行内对齐 | `Align { Left, Right, Center, Justified, End }`（逐行） |
| 字形输出 | `LayoutGlyph { font_id, glyph_id, x, y, w, font_size, line_height_opt, level }` |
| 行盒度量 | `LayoutLine { max_ascent, max_descent }` |
| 字间距 / 字特性 / 文本装饰 | `Attrs { letter_spacing_opt, font_features, text_decoration }` |

#### 缺口（我们要补）

| 缺口 | 说明 | 复杂度 |
|---|---|---|
| **CSS font-family 链** | cosmic-text 的 `Fallback` 是**按 script 的平台回退**，语义不同。CSS 是「首选 → 备选 → 通用」的链式匹配。设计源 42 处 font-family 全走 `var(--font-ui)`，即字体栈在 token 里 → 必须自己实现链式匹配 + 系统字体枚举 | 中 |
| **中文字体栈** | macOS PingFang SC / Windows 微软雅黑 / Linux Noto Sans CJK 的探测与回退 | 中 |
| **`text-overflow: ellipsis` 裁剪** | 12 处。注意：设计源上一轮刚修的「flex 容器里 ellipsis 不触发」那个 bug，Rust 侧会再遇到一次 | 低 |
| **`white-space: pre`** | 4 处。`pre` 保留空白与换行，cosmic-text 侧要显式支持 | 低 |
| **两端对齐在中文里的表现** | `Justified` 在中文会拉伸字间距，浏览器插的是空格位置 | 低（可先不做 justify） |
| **字体栈的加载时机** | 系统字体 vs 内嵌字体文件的加载与缓存 | 中 |

### 5.6 变量与主题（1084 处 `var()`）

**机制**：

```text
1. 解析声明时保留 var() 引用，不立即求值
2. 级联时：先按「声明来源」选出胜出者，再解开 var()
3. 解开 = 在「当前节点 + 祖先链」上找自定义属性的值
   未定义 → 用 fallback；仍无 → 该声明失效
4. 循环引用 → 检测并报错（不能静默）
```

**主题切换**：设计源用 `body[data-theme="dark"]` 覆盖 `:root` 上的变量。
→ 需要属性选择器 + **重跑级联**。

**性能**：变量是继承的，改一个 token 要重算整棵子树。缓解手段：
变量层单独编译成「变量表」，组件样式里只留变量引用，级联分两趟
（先解变量、再解声明），改主题时只重跑第一趟。

### 5.7 样式表的输入形态（**待拍板，D1**）

三种形态，代价完全不同：

| 形态 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| A 运行时读文件 | 引擎运行时读 `ui/assets/*.css` | 改样式即时生效 | 桌面软件要带资源、管路径；样式不进二进制；解析开销留在运行时 |
| **B 构建期编译** | CSS 在编译期变成样式表二进制，`include_bytes!` 进产物 | 零运行时文件依赖；**编译期校验**（不认识的属性 → 编译失败） | 改样式要重编译 |
| C 混合 | token 层编译成 Rust 常量，组件样式运行时读 | 主题切换快 | 两套来源，容易分叉 |

**建议：B**。理由：

1. 桌面软件不该在运行时去用户目录找样式文件
2. **编译期校验**把「设计源与实现分叉」这条 AGENTS.md 警告从「运行时惊喜」变成「编译错误」
3. 「tokens.css 是唯一真源」不等于「运行时读」—— 单一真源指的是**唯一编辑入口**
4. 配合 §1.3 的完备性验收（设计源 CSS 全量喂进引擎），B 让这条验收可以进 CI

**接口定义**（配合 §2.3 的硬规则）：

```rust
// gui-core 提供
pub struct StyleSheet { /* 编译产物 */ }
impl StyleSheet {
    pub fn parse_css(text: &str) -> Result<StyleSheet, ParseError>;  // 运行时路径也支持
}
// seladb-gui 提供
// build.rs: tokens.css + styles.css + pages.css → seladb-style.bin
```

---

## 6. 绘制层（paint）

### 6.1 DisplayList 的指令集

```rust
pub enum PaintOp {
    PushClip(Rect),           // 滚动容器 / 弹层裁剪
    PopClip,
    FillRect { rect: Rect, color: Color, radius: CornerRadius },
    FillRectGradient { rect, radius, stops, direction },
    StrokeRect { rect, color, width, radius },
    Shadow { rect, radius, color, blur, offset },
    DrawGlyphRun { atlas_id, glyphs: &[GlyphInstance], color },
    DrawPath { path_id, transform, color },   // SVG 图标
    PushLayer / PopLayer,                    // 弹层分层
}
```

### 6.2 设计源用到的绘制能力与实现

| 能力 | 用量 | 实现 |
|---|---|---|
| 圆角矩形 | `border-radius` 51 处 | SDF 圆角矩形 shader（一个 draw call 覆盖 4 个角） |
| 阴影 | `box-shadow` 24 处 | SDF 外扩 + 高斯近似，GPU 端一次采样 |
| 渐变 | `linear-gradient` 2 处 | 线性插值，坐标在 shader 里算 |
| 图标 | 内联 SVG | 构建期转路径常量（§7） |
| 文本 | 全部 | 字形图集 + 采样 |
| 滤镜 / 混合模式 | **0** | 不实现 |

### 6.3 字形图集（借 nanoui 的做法）

cosmic-text 给出字形与 x 偏移（含亚像素），我们自建 R8 图集：

```text
分箱：按 ⌊x × 4⌋ 分 4 箱（nanoui 的做法），采样时按 fractional x 插值
      → 避免「亚像素位置只对一半」导致的字重不均
图集：动态增长，R8（覆盖率），配合 SDF 或直接 alpha
```

### 6.4 弹层分层

借 nanoui：layer 20 / 30 分批绘制，每批重设 scissor rect。
设计源有 `position: fixed` 4 处（命令面板、菜单、Toast、抽屉）→ 都是弹层。

---

## 7. 从设计源到 Rust 的翻译清单

这是 `docs/ui-design-plan.md` §10「Rust 实现侧对齐清单」需要补充的部分。
**不是「照抄 CSS」，而是「CSS 语义 → 原生实现的映射」**：

| 设计源写法 | 用量 | Rust 侧怎么做 |
|---|---|---|
| `::-webkit-scrollbar` | 7 处 | **浏览器专有伪元素，原生不存在** → 换成自绘原生滚动条（样式另定） |
| `@keyframes`（5 个）+ `transition`（16 处）+ `animation`（7 处） | 28 处 | 需要补间层：目标值 + 过渡参数作状态，渲染循环读插值（nanoui 的可中断动效模型） |
| `display: inline-flex` / `inline-grid` | 10 处 | §5.4 的降级策略 |
| `var(--x)` 1084 处 | — | token 编译成 Rust 常量表（`seladb-gui` 侧），引擎只认通用 `var()` |
| `body[data-theme="dark"]` | 5 个声明组（tokens.css 里分 5 段覆盖：背景 / 类型色板 / 语法色板 / 引擎色 / 阴影） | 属性选择器 + 重跑级联 |
| 标签选择器（`input` / `body` / `button`…） | 41 处 | Rust 侧建树时用**同名 tag**，否则选择器不匹配 |
| `font-family: var(--font-ui)` | 42 处 | 字体栈在 token → 引擎实现 CSS 字体链 + 系统字体枚举 |
| `text-overflow: ellipsis` | 12 处 | 引擎自实现裁剪 + 省略号绘制 |
| `overflow: auto` | 14 处 | 自实现 `ScrollContainer` + 滚动条 |

---

## 8. 事件层、平台层、控件层、测试台

### 8.1 事件层

- **命中测试**：从 `LayoutBox` 直接命中，不读像素。按 z-index 从上到下
- **派发**：capture → target → bubble 三阶段
- **焦点**：Tab 序（DOM 序）、焦点环样式、`:focus-visible` 判定
- **IME**：预编辑串、候选窗位置、composition 事件

### 8.2 平台层

| 能力 | 选型 | 备注 |
|---|---|---|
| 窗口与事件循环 | `winit 0.30` | |
| 渲染 | `wgpu 30`（Metal / DX12 / Vulkan） | 走 naga，**不需要 Metal Toolchain**（AGENTS.md 硬约束 7） |
| IME + 无障碍 | `accesskit 0.25.1`（MIT OR Apache-2.0） | 统一三平台通道。**风险**：Linux/Wayland 的 IME 覆盖度需实测 |
| 字体枚举 | `fontdb`（cosmic-text 传递依赖） | 中文字体栈探测 |

### 8.3 控件层（全部自写）

| 控件 | 参考蓝本 | 难度 |
|---|---|---|
| `DataGrid`（虚拟滚动、变高行、异构列、单元格编辑、列宽拖拽、排序筛选） | gpui `examples/data_table.rs`（473 行，Apache-2.0） | **最高**。变高行 + 异构列的虚拟化比等高列表难一个数量级 |
| `TreeView`（懒加载、任意深度、徽标计数） | 无现成（两个参考实现都没有） | 高 |
| `QueryEditor` | tree-sitter + tree-sitter-sql | 中（IME + 语法高亮 + 选区） |
| `CommandPalette` | — | 中 |
| `Menu` / `Dialog` / `Drawer` / `Toast` | nanoui 的弹层分层与定位回退 | 中 |

### 8.4 TestHarness（框架的一等公民）

借 nanoui 的 `tester.zig`。**不建窗口、不抢焦点、不驱动真实屏幕**。

```rust
pub struct TestHarness { /* 虚拟时钟 + 合成事件队列 */ }
impl TestHarness {
    pub fn send(&mut self, ev: InputEvent);          // 合成事件
    pub fn advance(&mut self, dt: Duration);          // 推进虚拟时钟
    pub fn layout(&self, node: NodeId) -> LayoutBox; // 读回几何
    pub fn paint_ops(&self) -> &[PaintOp];           // 读回绘制指令（不产生像素）
}
```

**断言按可感知语义写**，不按内部结构写：

```rust
grid.cell_text(3, "id");
tree.expanded("public.users");
```

---

## 9. 里程碑

每个里程碑都有**可自动化的完成判据**，不是「写完了」。

| # | 内容 | 完成判据 |
|---|---|---|
| **M0** | crate 能编 | 根 `Cargo.toml` workspace 建好；八个模块骨架齐全；`cargo check` 过；`cargo test` 空跑过 |
| **M1** | 样式 + 布局贯通 | 能把一段 CSS + 一棵 DOM 变成 `LayoutBox` 数组；几何与 Chromium 逐节点比对偏差 0 |
| **M2** | 文本上屏 | 字形图集 + 文本绘制指令；advance width 与浏览器偏差 ≤ 0.01px |
| **M3** | 交互 | hover / focus / 滚动 / 选区 / 键盘导航；无头用例全绿 |
| **M4** | 三个核心控件 | DataGrid / TreeView / QueryEditor 在无头环境下可测 |
| **M5** | 弹层与动效 | 命令面板 / 菜单 / 抽屉 / Toast；补间层可中断 |
| **M6** | IME 与无障碍 | 中文 IME 三平台可用；accesskit 树正确 |
| **M7** | 三平台 | macOS / Windows / Linux 出图一致（SSIM ≥ 0.97） |

---

## 10. 依赖与许可

| crate | 版本 | 许可 | 用途 | 状态 |
|---|---|---|---|---|
| `taffy` | 0.15（不锁） | **MIT** | Flexbox / Grid / Block 布局 | ✅ |
| `cosmic-text` | 0.19（不锁） | MIT OR Apache-2.0 | 整形 / 断行 / bidi | ✅ |
| `cssparser` | 0.38 | **MPL-2.0** | CSS 分词 | ⚠️ **需白名单** |
| `wgpu` | 30 | MIT OR Apache-2.0 | 渲染 | ✅（`feature = "gpu"`） |
| `winit` | 0.30 | Apache-2.0 | 窗口 | ✅（`feature = "gpu"`） |
| `accesskit` | 0.25.1 | MIT OR Apache-2.0 | IME + 无障碍 | ✅ |
| `tree-sitter` + `tree-sitter-sql` | — | MIT | SQL 高亮 | ✅ |
| `raw-window-handle` | 0.6 | MIT OR Apache-2.0 | 平台句柄 | ✅（`feature = "gpu"`） |

### 10.1 cssparser 的 MPL-2.0（**待拍板，R7**）

**事实**：cssparser 0.38 是 **MPL-2.0**，不是 MIT/Apache。
**并且**：taffy 的 `parse` feature 就是 `dep:cssparser` —— **它已经是依赖树的一部分**。
即便我们不直接写 `cssparser = "0.38"`（`crates/gui-core/Cargo.toml` 现在写了），
只要启用 taffy 的 `parse`，它就在。

**判断**：MPL-2.0 是**文件级**弱 copyleft。作为库依赖使用（不改它的源文件、
不把它的代码打进我们的产物）没有传染义务，与 MIT/Apache 项目共存没有法律障碍。

**但**：这是仓库级硬约束（AGENTS.md 硬约束 2），必须显式承认，不能默默用。
建议在 `AGENTS.md` 硬约束 2 里加一句：

> `cssparser`（MPL-2.0，文件级弱 copyleft）列入白名单 —— 只作为库依赖调用、
> 不修改其源码、不分发其文件，无传染义务；它是 taffy `parse` feature 的既有依赖。

---

## 11. 风险登记

| # | 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|---|
| R1 | **CSS 子集边界蔓延** —— 设计源加了新特性，引擎跟不上 | 高 | 高 | §1.3 的完备性验收进 CI；不支持的属性在编译期报错，不静默忽略 |
| R2 | **inline 布局** —— 10 处用例最终证明需要基线对齐 | 中 | 中 | §5.4 先降级再实现；实在不行改设计源（这是被允许的，成本可控） |
| R3 | **中文排版** —— 字体栈、CJK 断行、两端对齐 | 中 | 高 | G3 是本项目的差异化，G3 失败 = 项目失败。排期上把中文 IME 排在核心控件之前 |
| R4 | **IME 三平台一致性** —— accesskit 在 Linux/Wayland 的覆盖度 | 中 | 高 | 先 macOS 打穿，再 Wayland，再 Windows；每个平台留一条手工验收路径 |
| R5 | **万行网格的虚拟化** —— 变高行 + 异构列 | 高 | 高 | 借 gpui `data_table.rs` 的可见范围追踪；先用固定行高做通，再上变高行 |
| R6 | **性能** —— 一帧预算 | 中 | 中 | 分层重算（§3.3）+ 脏区重绘；`TestHarness` 里做帧耗时断言 |
| R7 | **产能** —— 自研 GUI 框架是 8–18 个月量级 | 高 | 高 | 里程碑切小；每里程碑都有可运行产物；控件层与框架层分离，框架可独立交付 |
| R8 | **许可** —— cssparser MPL-2.0 | 已解决 | 低 | §10.1，拍板即可 |

---

## 12. 待拍板

| # | 议题 | 建议 | 影响面 |
|---|---|---|---|
| D1 | 样式表输入形态（运行时读 / 构建期编译 / 混合） | **构建期编译** | gui-core 公开 API 形状；定不下来后面每个决定都可能白做 |
| D2 | CSS 子集边界 | 按 §5.1 的表写死 | 引擎工作量 |
| D3 | inline 布局范围 | 先降级（§5.4 方案 a） | 引擎工作量 + 设计源改动量 |
| D4 | 完备性验收标准 | 按 §1.3 | CI 的形态 |
| D5 | 图标路线 | 构建期 SVG → 路径常量 | 依赖面 + 运行时开销 |
| D6 | cssparser 白名单 | 承认（§10.1） | AGENTS.md 硬约束 2 |

**建议落档**：D1–D3 + D6 合并为 `ADR-0007`「CSS 子集范围、样式表输入形态与许可边界」；
D4–D5 并入 `ADR-0008`「验收标准与资产管线」。

---

## 附录 A：现有代码状态

`crates/gui-core/` 目前**编译不过**（`lib.rs` 声明 8 个模块，磁盘上只有 2 个）：

```text
src/lib.rs          声明 app/dom/event/layout/paint/style/text/internal —— 缺 6 个
src/dom.rs          ✅ 可用（157 行）
src/style/value.rs  ⚠️ 部分（255 行）
```

`style/value.rs` 与 §5.1 的子集对照，缺口如下：

| 现有 | 缺 |
|---|---|
| `Display { Flex, Block, None }` | **`Grid`**（设计源 29 处） |
| `Position { Relative, Absolute }` | **`Fixed`、`Sticky`**（设计源 9 处） |
| `Overflow { Visible, Hidden, Scroll }` | `Clip` |
| `TextAlign { Left, Center, Right }` | `Justify`、`Start`/`End` |
| `Property` 38 条 | `grid-template-*`、`grid-column/row`、`font-family`、`letter-spacing`、`white-space`、`box-shadow`、`background-image`、`transition`、`animation`、分边的 `border-*-width/color`、`overflow-x/y` |
| — | **变量（自定义属性）类型** |
| — | **选择器类型** |

也就是说 `style/value.rs` 大约覆盖了所需属性的 **1/4**，且缺整块「变量 + 选择器 + 级联」。

---

## 附录 B：依赖事实速查（2026-10-23 核实）

```text
taffy 0.15.0        MIT · DioxusLabs · 驱动 Servo / Bevy / Slint / Zed(Lapce)
                    src 29653 行（0.9.0 是 18695 行，+59%）
                    Position: Static|Relative|Absolute|Fixed|Sticky
                    Display:  Block|FlowRoot|Flex|Grid|None      ← 无 inline-*
                    Overflow: Visible|Clip|Hidden|Scroll + scrollbar_width
                    parse feature = dep:cssparser，只解析「值」，不解析声明块

cosmic-text 0.19.0  MIT OR Apache-2.0
                    Align { Left, Right, Center, Justified, End }
                    LayoutGlyph { font_id, glyph_id, x, y, w, font_size, line_height_opt, level }
                    LayoutLine { max_ascent, max_descent }
                    unicode-linebreak(UAX#14) · unicode-bidi
                    无 CSS font-family 链语义 · 无 text-overflow 裁剪
```


