# UI 还原度：HTML/CSS 设计稿 → 原生实现

> 状态：2026-10-21
> 目的：明确「用原生 GPU 渲染还原 Web 设计稿」的可行边界与达成条件
> 关联：[`gui-framework-survey.md`](gui-framework-survey.md)、[`gui-architecture.md`](gui-architecture.md)

---

## 1. 先修正「100%」这个目标

「100% 复刻」如果定义成**逐像素一致**，那么它在任何跨渲染器场景都不成立 —— 即使两个浏览器（Chromium vs WebKit）渲染同一页面也会有差异，因为：

- 字体光栅化与 hinting 不同
- 字距、连字、字体回退链的行为不同
- subpixel 抗锯齿策略不同
- 阴影的模糊算法与扩散模型不同
- 渐变的插值与色彩空间管理不同
- 圆角的抗锯齿处理不同

**能追求的目标是「视觉等价」：人眼分辨不出差异。** 这个是可以做到的，而且可以量化。

---

## 2. 原生渲染框架的 CSS 映射能力

下面以两个方案的实际源码为对照，给出「哪些 CSS 特性能被 1:1 映射」的边界：

- **GPUI v0.2.2**（当前选定）—— Taffy 提供 Flexbox + Grid + Block + Float 全套，原生 `BoxShadow` 与 `linear_gradient()`
- **Gio v0.10.3**（备选）—— 布局只有 Flex，`op/paint` 与 `op/clip` 里连阴影原语都没有

### 2.1 GPUI v0.2.2 的能力（从源码核实）

### 2.2 能 1:1 映射的

| CSS 能力 | GPUI 实现 | 位置 |
|---|---|---|
| Flexbox 布局 | Taffy `flexbox` feature | 依赖 `taffy 0.13` |
| **CSS Grid 布局** | Taffy `grid` feature | 同上 |
| Block / Float 流式布局 | Taffy `block_layout` / `float_layout` | 同上 |
| content-size 尺寸计算 | Taffy `content_size` | 同上 |
| 盒模型 padding / margin / border | 完整 | `style.rs` |
| **box-shadow** | 原生 `BoxShadow` + `.shadow(vec![BoxShadow{..}])` | `style.rs:308` |
| **线性渐变** | `.bg(linear_gradient(..))` | `examples/gradient.rs` |
| 透明度 | 样式系统 | — |
| 圆角 | 样式系统 | — |
| SVG / 矢量路径 | 渲染层 | — |
| 文本整形与换行 | 自己的文本栈 | `text_system.rs` |
| 系统字体发现 | `font-kit`（Zed 的 fork，跨平台） | 默认 feature |

**布局这一项是 GPUI 的决定性优势**：Taffy 用的就是浏览器的 CSS 布局算法集，Flexbox / Grid / Block / Float 全部覆盖，语义与浏览器一致。数据表格的经典布局（表头固定 + 主体滚动 + 横向滚动 + 列宽可调）正是 CSS Grid 的典型用法，GPUI 能直接映射，Gio 不能。

**Gio 的对照**：其 `layout/` 下只有 `flex.go` / `stack.go` / `list.go`，**没有 Grid**；`op/paint` 与 `op/clip` 里也**没有任何阴影原语**（material 里唯一的 "shadow" 是 switch 滑块用半透明圆盘近似）。Gio 的文本换行走 go-text/typesetting（HarfBuzz + CSS UAX #14 + bidi），与浏览器同源 —— 这一项它做得好。

### 2.3 缺口的

| CSS 能力 | GPUI 现状 | 补齐成本 |
|---|---|---|
| **CSS Grid 布局** | ✅ Taffy `grid` feature 已支持 | — |
| **box-shadow** | ✅ 原生 `BoxShadow` | — |
| **backdrop-filter / blur()** | ⚠️ 只有**窗口级** vibrancy（macOS `NSVisualEffectView`），无元素级 `backdrop-filter` | 高 |
| **mix-blend-mode** | ❌ 无 | 高 —— 需离屏合成 |
| **CSS filter** | ❌ 无滤镜模型 | 高 |
| **CSS mask / 复杂 clip-path** | ⚠️ 只有基础裁剪，无 CSS 遮罩模型 | 中 |
| **::before / ::after** | ❌ 无伪元素 | 低 —— 用子元素替代 |
| **自定义滚动条** | ❌ 无 `::-webkit-scrollbar` 等价物 | 低 —— 自绘 |
| **transition / @keyframes** | ⚠️ 有动画系统，但非 CSS 缓动曲线模型 | 中 |
| **像素级字体渲染** | ❌ | 不可解决 |

---

## 3. 核心结论：还原度由你的设计规范决定，不由框架决定

这是整个问题的关键。

**框架只提供「可映射的子集」，最终还原度取决于你是否把设计约束在这个子集内。**

### 做法一：约束设计规范（推荐）

在设计阶段就禁用不可映射的特性：

| 规则 | 替代方案 |
|---|---|
| 禁用毛玻璃 / 混合模式 | 用不透明度叠加的纯色；窗口级 vibrancy 另算 |
| 禁用 CSS 滤镜 | 用预渲染的位图或纯色替代 |
| 渐变只用线性 | 径向渐变不用 |
| 动画只用预设档位 | 不用 CSS 缓动曲线 |
| 圆角只用固定档位 | 如 4 / 8 / 12 |
| 阴影只用固定档位 | token 定义 offset / blur / spread 三参数 |

> **CSS Grid 不在禁用清单内** —— Taffy 原生支持，这正是选 GPUI 而非 Gio 的关键原因之一。

这套规则做进 Figma 的组件库和 design token 后，**设计稿天然就落在 GPUI 可映射的子集里**。此时还原度可以做到 **98–99%** —— 剩下的 1–2% 是字体光栅化的亚像素差异，人眼不可辨。

### 做法二：设计源用 token，不用 HTML

```
design/
├── tokens.json          # 颜色 / 间距 / 字号 / 圆角 / 阴影 / 动效参数
├── prototype/           # HTML/CSS 原型，只用于出稿与交互验证
│   └── index.html
└── screenshots/         # 设计稿导出的 PNG，用作黄金图基准
```

- `tokens.json` 是**唯一设计源**，前端原型与 Rust 实现读同一份
- HTML 的作用是出稿和验证交互，不是最终实现
- 翻译过程是机械映射，不靠人肉对像素

### 做法三：还原度用黄金图度量

gpui 有 `platform/visual_test.rs` 截图对比与 `toggle_headless` 无头模式。

流程：

1. 从设计稿导出 PNG（`design/screenshots/`）
2. 实现截图 → PNG
3. 两者做像素 diff（SSIM 或感知哈希）
4. 设阈值（如 SSIM ≥ 0.98）进 CI

**这把「还原度」从主观感受变成 CI 里可测量的数字。** 任何视觉回归都会被拦下。

---

## 4. 对数据库管理工具的具体影响

SelaDB 的界面主体是数据表格，而**数据表格的经典布局正是 CSS Grid**（表头固定 + 主体纵向滚动 + 横向滚动 + 列宽可调）。

**GPUI 的 Taffy 原生支持 Grid，设计稿可以照常用 CSS Grid 表达，不必降级成 Flex。** 这是选 GPUI 的直接收益 —— 换成 Gio 就只能要么禁用 Grid、要么自建布局器。

GPUI 官方 `examples/data_table.rs` 给出的实现路线是：表头与 `uniform_list` 平级（表头天然固定），列宽由 `FIELDS` 数组统一定义，可见范围通过 `uniform_list` 的 `range` 回调追踪。

需要自建的增量主要是：列宽拖拽调整（官方示例是固定列宽）、横向滚动与纵向滚动的偏移同步、单元格类型着色（NULL / BLOB / 时间格式）。

---

## 5. 代价清单（诚实版）

即使采用上述做法，以下成本依然存在：

| 成本 | 说明 |
|---|---|
| 人工翻译层 | CSS → GPUI 的映射是人工的，没有自动化工具 |
| 像素差异 | 字体光栅化永远不一致，黄金图阈值要留余量 |
| 交互状态 | CSS 的 `:hover` / `:focus` / `:active` 要逐个映射成 gpui 的 `interactivity` 回调 |
| 字体回退 | 需确认目标平台的系统中文字体覆盖情况与设计稿一致 |
| 列宽拖拽 | 官方示例是固定列宽，拖拽调整需自建 |
| 双轴滚动同步 | 表头与主体的横向偏移需手动同步 |

---

## 6. 与 Web 路线的对比（同一张设计稿）

| 维度 | 原生（Gio） | Web（系统 webview） |
|---|---|---|
| 视觉等价度 | 98–99%（约束设计规范后） | 100% |
| 像素一致 | 不可能 | 也不保证（跨浏览器仍有差异） |
| 黄金图回归 | ✅ Gio `unit` | ✅ 浏览器截图，同样可行 |
| 设计约束 | 必须禁用 Grid / 阴影 / 滤镜 | 无 |
| 产物体积 | 10–20MB | 10–20MB |
| 内存占用 | 低 | 中（浏览器渲染进程） |
| 启动速度 | 快 | 中 |
| 语言栈 | 纯 Go | Go + Web |
| 中文 IME | 协议级完整实现 ✅ | 天然正确 ✅ |

**结论：两条路都能做到「人眼分辨不出」的还原度。** 差别在于原生路线要你接受一份「禁用清单」，Web 路线不用。

既然两者都要，那就把取舍点明确下来 —— 这也是最终要拍板的事。
