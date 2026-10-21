# GUI 框架架构设计

> 状态：2026-10-21 设计稿
> 目标：HTML/CSS 风格的跨平台原生 GUI 框架（Rust）
> 产物：`crates/gui-core/`，零业务依赖，将来可整体拆成独立仓库

---

## 1. 分层

GUI 框架最容易烂掉的地方是**状态逻辑和界面代码缠死**。分层的唯一目的，是让每层只做一件事，层间用明确的数据契约。

```text
┌─ widget ────────────────────────────────────────────┐
│  控件：Button / TextInput / Table / Tree             │
│  只做「把下层原语组合成可复用控件」                    │
├─ event ─────────────────────────────────────────────┤
│  命中测试 + 派发（capture / target / bubble）         │
├─ paint ─────────────────────────────────────────────┤
│  样式 + 几何 → 绘制指令（display list）               │
├─ layout ─────────────────────────────────────────────┤
│  taffy：CSS Flexbox / Grid / Block / Float 规范实现   │
├─ text ───────────────────────────────────────────────┤
│  cosmic-text：整形、换行、行盒、可编辑 Editor          │
├─ style ─────────────────────────────────────────────┤
│  CSS 解析 → 选择器匹配 → 级联 → ComputedStyle       │
├─ dom ────────────────────────────────────────────────┤
│  节点树（arena 存储）                                 │
└─ platform ───────────────────────────────────────────┘
   winit 窗口 / wgpu 渲染
```

**依赖方向永远单向**：`dom ← style ← layout ← paint ← widget`。下层不知道上层存在。

### 1.1 Rust 侧模块边界：一条硬规则

**公开 API 不泄漏第三方类型。**

```
✗ pub fn layout(...) -> taffy::Rect
✗ pub fn shape(...) -> cosmic_text::Buffer
✓ pub fn layout(...) -> LayoutBox { x, y, width, height }
```

三个理由：

1. **将来能拆出去** —— 泄漏了就永远绑死在这些库上，拆仓库时版本冲突会外溢
2. **可替换** —— 将来换布局引擎只改内部，用户无感
3. **可测试** —— 自有类型能直接写断言，不依赖第三方语义

做法：

```rust
mod internal {
    pub fn to_taffy(s: &ComputedStyle) -> taffy::Style { /* … */ }
    pub fn from_taffy(l: taffy::Layout) -> LayoutBox { /* … */ }
}
```

`wgpu` / `winit` 只出现在 `platform/` 与 `paint/raster.rs`。dom / style / layout / text / paint 全都不知道 GPU 存在。

---

## 2. 一帧的五阶段

```text
输入: 节点树 + 样式表 + 元素状态(:hover/:focus) + 视口尺寸
  │
  ├─[1] STYLE    算每个节点的最终样式
  │       输出: ComputedStyle × N
  ├─[2] LAYOUT   算每个节点的几何
  │       输出: LayoutBox × N  (x, y, w, h)
  ├─[3] PAINT    生成绘制指令
  │       输出: DisplayList (Vec<PaintOp>)
  ├─[4] COMPOSITE  分层合成（可选）
  └─[5] COMMIT   提交 GPU
```

### 2.1 为什么 Style / Layout / Paint 必须分开

场景：用户 hover 按钮，背景从 `#888` 改成 `#2563EB`。

| 阶段 | 重跑？ | 代价 |
|---|---|---|
| Style | ✅ 只重算被改的节点 | 便宜 |
| Layout | ❌ 尺寸没变 | **贵**（O(n)，要解 flex/grid 约束） |
| Paint | ✅ 重画这个盒子 | 中 |

合成一步的话，改个颜色就要全树重排 —— 在滚动列表里是灾难。

**绘制指令必须先攒成 display list 再提交**，理由：

- 一次提交，减少 GPU 调用
- 脏区重绘（只重画变化区域）
- 命中测试（直接从 LayoutBox 命中，不用读像素）
- 录制 / 回放

---

## 3. 结构与表现分离

这是「能用 CSS 描述界面」的**前提**。

```rust
// 结构层：只说「什么嵌套什么」
let root  = tree.root("div");
let card  = tree.create_element(root, "div");
card.classes.push("card".into());
let title = tree.create_element(card, "span");
title.classes.push("title".into());

// 表现层：完全在 CSS 里
.card  { display:flex; flex-direction:column; gap:8px; padding:12px;
         background-color:#141414; border-radius:14px; }
.title { color:#ffffff; font-size:14px; }
```

节点树里**没有任何**颜色、间距、字号。带来三个直接好处：主题切换 = 换一张样式表；设计稿 = 一张样式表；组件复用 = 结构与样式各自独立。

---

## 4. 级联

「哪条声明生效」由三件事决定：

1. **来源**：作者样式 < **行内 style 属性** < `!important`
2. **特异性**：`#id`(100) > `.class`(10) > `tag`(1)，同类比数量
3. **出现顺序**：同优先级后者胜

再加**继承**（color / font-size / line-height / text-align 从父取）。

### 4.1 逐属性决胜

最容易搞错的一点 —— 决胜是**逐属性**的，不是整条规则的：

```css
.a { color: red }
.b { color: blue; padding: 4px }
```

两个类都命中时：**color 归 a，padding 归 b**。

### 4.2 算法

```text
for 每个节点:
    候选 = []
    for 每条规则 in 样式表:
        if 选择器匹配: 候选.push((特异性, 顺序, 声明))
    候选.sort_by(特异性, 顺序)
    for (_, _, 声明) in 候选:          # 正序遍历，后者覆盖前者
        该属性 = 声明值
    for 声明 in 行内样式:              # 行内覆盖一切
        该属性 = 声明值
    for 可继承属性:
        if 未定: 从父节点继承
```

### 4.3 自己写 vs 用 Servo 的 Stylo

| | 自己写 | `bao-stylo`（Firefox 的级联引擎） |
|---|---|---|
| 代码量 | ~600 行 | 0 |
| 完备性 | 只有我们支持的子集 | Firefox 级别（@media、:has()、级联变量…） |
| 可控性 | 完全可控 | 要适配它的 DOM 抽象 |
| 错误信息 | 能精确指到行列 | 较难定位 |

**决策：Phase 1 自己写**（简单、可控、报错清晰），将来要支持 `@media` / `:has()` 再换 Stylo。

---

## 5. 保留模式 vs 立即模式

**这是做 GUI 框架时最该先想清楚的问题，选错了后面全白做。**

### 保留模式（Retained）
```
UI 树(对象)  ←→  你的数据
```
UI 是内存里的数据结构，状态变了 → 标记脏 → 局部重算。代表：React / SwiftUI / Flutter / Qt。
优点：增量更新、事件处理自然、能 diff。难点：两棵树要同步。

### 立即模式（Immediate）
```
每帧: 调一遍绘制函数,函数读你的数据,生成命令
```
没有 UI 树，状态就是普通变量。代表：Dear ImGui。
优点：代码量极小。难点：每帧全量重建，事件靠 id 栈反查。

### 我们的选择

要「HTML/CSS 熟悉用法」，**结构上必须接近浏览器 = 保留模式**（CSS 选择器要匹配一棵树）。

但完全照搬浏览器的虚拟 DOM + diff 太重。折中：

> **保留结构 + 增量样式/布局 + 每帧 paint**

即：有一棵节点树（选择器要匹配它），但不做虚拟 DOM diff；样式脏了重算样式，布局脏了重算布局，paint 每帧重做（display list 重建很便宜）。

这正是浏览器「增量 style/layout + 每帧 paint」的思路，只是没有 diff。

---

## 6. 事件系统

浏览器 DOM 事件流三阶段，做控件库必须理解：

```text
1. CAPTURE  根 → 目标
2. TARGET   在目标上
3. BUBBLE   目标 → 根
```

为什么需要三段？列表里每行有删除按钮：

- **capture** 阶段列表可拦截（「拖拽中不吃点击」）
- **target** 阶段按钮自己处理
- **bubble** 阶段列表可知道「有子项被点了」

对应类型：

```rust
struct EventHandler { target: NodeId, phase: EventPhase, callback: /* … */ }
// 需要 stop_propagation / prevent_default 的等价物
```

---

## 7. 文本层

最容易被低估的部分。流程：

```text
字符串 + 字体 + 宽度约束
   ↓ 整形 shaping        codepoint → glyph id + 位置（阿拉伯语要重排+合并字形）
   ↓ 断行 line breaking   按 UAX#14 + 容器宽度 → 多行（CJK 可任意断，拉丁文只能断词）
   ↓ 行盒 line box        每行 ascent/descent/line-gap → 行高
   ↓ 基线对齐 baseline    行内元素按基线对齐，不是按顶边
```

难点：整形、断行（CJK 断点 + 标点避头尾）、基线（行内混排不同字号按基线）、**回退**（主字体缺字要换有该字形的字体）。

### 7.1 cosmic-text 提供的

| 能力 | API |
|---|---|
| 整形 | swash（HarfBuzz 的 Rust 移植） |
| 断行 | UAX #14 |
| 行度量 | `ascent` / `descent` / `max_ascent` / `line_height_opt` |
| 亚像素定位 | `x_offset` / `y_offset` / `x` / `y`(i32) |
| 双向文本 | `unicode_bidi::Level` |
| **可编辑文本** | `cosmic_text::edit::Editor`（cursor / selection / auto_indent / draw / render） |
| **跨平台字体回退** | `font/fallback/{macos,unix,windows,other}.rs` |
| 语法高亮 | `edit/syntect.rs` |

**关键：`cosmic_text::edit::Editor` 就是 Zed 多行编辑器的内核**，且 `cursor_position()` 能算出光标在行内的 x/y —— **这正是中文输入法需要的插入点位置**。

所以「可输入文本框」不需要从零做，「IME 是最难的部分」这个判断要修正一半。

---

## 8. inline 行内布局：缺口在哪，怎么处理

CSS 的 inline 行内布局其实是三件事，只有一件是真缺口：

| 事项 | 覆盖情况 | 对产品的影响 |
|---|---|---|
| **A. 一段文字排成多行**（断行、每行基线、行高） | ✅ cosmic-text 完全覆盖 | 无影响，99% 的场景 |
| **B. 行内元素与文字混排，按基线对齐**（头像+昵称、图标+文字） | ⚠️ 要自己做 | 可控，见下 |
| **C. inline-block + float + 行盒拆分** | ⚠️ taffy 的 `float_layout` 部分支持 | 低，app UI 几乎不用 float |

### 8.1 B 的简化解法

cosmic-text 给了每行的 ascent/descent 与基线位置，所以只需要实现一条简化规则：

> 行内块级元素（头像、图标、徽标）默认**底边对齐到基线**或**居中对齐到行盒**

这覆盖 UI 里 95% 的混排场景。真正难的「严格基线对齐」（不同字号文字混排）在 UI 设计里几乎不用。

### 8.2 更省事：在设计规范层面禁用

规范里写死一条：

> 同一行内的非文本元素使用 `align-items: center` 或 `bottom`，不使用基线对齐。

那么 B 就不存在 —— **因为 flex 容器本身就是块级的，根本不会产生 inline formatting context**。

**所以这个缺口是「设计规范自由度」换来的，不是「技术能力不足」。** 浏览器要支持它，是因为通用浏览器不能假设用户的 CSS 怎么写；我们可以。

| 规范策略 | inline 维度接近度 |
|---|---|
| 允许 inline 混排 | 50–70%（那是浏览器的复杂度） |
| 禁用基线对齐，只允许 flex/grid + 原子化内联 | **99–100%** |

---

## 9. 还原度怎么量

不是肉眼看截图，而是分层量，每层有硬指标：

| 层 | 指标 | 目标 |
|---|---|---|
| **几何层** | Figma REST API 导出每个节点 x/y/w/h vs `LayoutBox` 逐节点比对 | **100% 一致**，不一致即 bug |
| **样式层** | 每个节点的 computed style 逐属性比对 | **100%** |
| **文本层** | 同一字体文件下，浏览器 `span.getBoundingClientRect().width` vs 我们的 advance width | **0.01px 级** |
| **像素层** | SSIM / 感知哈希 | 0.97–0.99 |

前三层的不一致可以**自动报警**；第四层的差异才需要人眼。

### 9.1 为什么能接近 100%

因为三个组件和浏览器**用同一套算法**，不是「像」：

- **Stylo** 就是 Firefox 的级联引擎 → 算样式算得一样
- **Taffy** 就是 CSS 规范的 Flexbox/Grid 实现（有 web-platform-tests 覆盖率）→ 布局算得一样
- **cosmic-text** 用 **swash（HarfBuzz 移植）** + **UAX#14**，浏览器也用 HarfBuzz + UAX#14 → **advance width 完全一样**

### 9.2 为什么像素级做不到

差异全在光栅化与实现细节：抗锯齿策略（grayscale vs subpixel LCD）、hinting、亚像素位置取整、圆角与阴影的抗锯齿算法、渐变插值与色彩空间、浏览器对 flexbox `min-content`/`auto` 的边角解释。

**结论：还原度由「CSS 引擎的完备性」决定，不由「谁来画」决定。** 我们的框架若只支持 CSS 子集，那**子集内的还原度就是 100%**；要让子集外也 100%，需要接完整 CSS 引擎（`bao-stylo` 的价值所在）。

---

## 10. 怎样保证将来能独立成项目

1. 独立 crate + 独立 `Cargo.toml` —— 现在 `path` 依赖，拆出去改版本依赖
2. 零业务依赖 —— 不引用 SelaDB 任何东西
3. 公开 API 自有类型 —— 见 1.1
4. 不放在 `crates/seladb-*` 里（那是产品代码），框架单独放
5. CI 独立跑
6. **GPU 后端是 `feature = "gpu"`**，核心逻辑不依赖它

---

## 11. 待决问题

1. **CSS 支持范围**：先做够用的子集（flex + grid + 盒模型 + 文本），还是一开始就上 `@media` / `:hover` / 级联变量？前者自己写 2–3 周，后者要接 Stylo
2. **inline 策略**：是否在设计规范中禁用基线对齐（推荐）
3. **CLI 工具链归属**：clap 等是框架的一部分还是各项目自带
