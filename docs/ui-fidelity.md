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

- **gpui v0.2.2**（曾作为选定方案实测，路线已变更；本文的还原度数据对 taffy 路线同样成立）—— Taffy 0.9 提供 Flexbox + Grid + Block 全套（**无 float**），原生 `BoxShadow` 与 `linear_gradient()`
- **Gio v0.10.3**（备选）—— 布局只有 Flex，`op/paint` 与 `op/clip` 里连阴影原语都没有

### 2.1 gpui v0.2.2 的能力（从源码核实，现作参考蓝本）

### 2.2 能 1:1 映射的

| CSS 能力 | GPUI 实现 | 位置 |
|---|---|---|
| Flexbox 布局 | Taffy `flexbox` feature | 依赖 `taffy =0.9.0`（gpui 0.2.2 精确锁定） |
| **CSS Grid 布局** | Taffy `grid` feature | 同上 |
| Block 流式布局 | Taffy `block_layout` | 同上 |
| ~~Float 浮动布局~~ | ❌ Taffy 0.9 不支持，CSS `float` 不可映射 | — |
| content-size 尺寸计算 | Taffy `content_size` | 同上 |
| 盒模型 padding / margin / border | 完整 | `style.rs` |
| **box-shadow** | 原生 `BoxShadow` + `.shadow(vec![BoxShadow{..}])` | `style.rs:308` |
| **线性渐变** | `.bg(linear_gradient(..))` | `examples/gradient.rs` |
| 透明度 | 样式系统 | — |
| 圆角 | 样式系统 | — |
| SVG / 矢量路径 | 渲染层 | — |
| 文本整形与换行 | 自己的文本栈 | `text_system.rs` |
| 系统字体发现 | `zed-font-kit`（Zed 的 font-kit fork，跨平台） | 默认 feature |
| 文本整形 | `cosmic-text 0.14`（内含 `fontdb` + `rustybuzz`） | macOS / Linux |

**布局这一项是 Taffy 路线的决定性优势**：Taffy 用的就是浏览器的 CSS 布局算法集，Flexbox / Grid / Block 全部覆盖，语义与浏览器一致。数据表格的经典布局（表头固定 + 主体滚动 + 横向滚动 + 列宽可调）正是 CSS Grid 的典型用法，taffy 能直接映射，Gio 不能。

> **这一条已经实测过**，不是推断：同一棵布局树在 Chromium 与 gpui（其布局层即 Taffy）上测出的 70 个几何值**逐位相同**，6 段中英混排文本的宽度**亚像素一致**。数据与复现步骤见 [`fidelity-measurement.md`](fidelity-measurement.md)。该结论对 taffy 路线同样成立。

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

## 2.5 实测：布局还原度

用真实 Chromium 与 GPUI 0.2.2 跑同一套布局树（侧边栏 + 工具栏 + 固定表头 + 100 行虚拟列表），逐元素比对 x/y/w/h。

| case | 变化点 | 测量点 | 最大偏差 |
|---|---|---|---|
| a | 基准 | 14 | **0.000px** |
| b | `main` 显式 `height:100%` | 14 | **0.000px** |
| c | `main` 显式 `height:600px` | 14 | **0.000px** |
| d | `toolbar` 不设 `flex:none`（允许收缩） | 14 | **0.000px** |
| e | `table` 设 `overflow:visible`（触发 min-content 规则） | 14 | **0.000px** |

**70 个测量点全部逐位相同，偏差 0.000px。** case e 尤其关键：浏览器把 table 撑到 2832px（100 行 × 28px + 表头），GPUI 得到完全一样的 2832px。

**结论：布局结构可以做到 100% 一致。** Taffy 与浏览器同源不是宣传，是可验证的事实。

### 文字度量：本环境未能测出可信数字

gpui 的无头测试文本系统只注册了 **一个** 真实字体（`.SFNS-Regular`），且 `resolve_font` 对所有族名都返回同一个 id —— 实测：

```
resolve .SFNS-Regular        -> id=1 family=Some(".SFNS-Regular")
resolve Hiragino Sans GB     -> id=1 family=Some(".SFNS-Regular")
resolve Menlo                -> id=1 family=Some(".SFNS-Regular")
```

于是无 CJK 字形可用，中文退化为固定步进估算（4 个汉字 = 32px，而浏览器是 52px），拉丁文也退化为约 0.6em/char 的估算值而非真实 advance。

**这是无头测试环境的限制，不代表真实渲染的度量能力。** 但也意味着：**文字还原度必须在真实窗口下实测，不能靠无头环境的数字下结论。**

### 文字还原度的原理性判断

文字宽度取决于两件事：

1. **所选字体的 advance width** —— 来自字体文件的 `hmtx` 表。同一字体文件下，浏览器与 GPUI 读到的 advance 完全相同 → 宽度可以做到一致
2. **回退字体的选择** —— 某个字符在主字体里没有字形时，浏览器与 GPUI 选哪个回退字体可能不同。GPUI 用 cosmic-text 做整形与断行（UAX #14 同族，但非浏览器同实现）

所以文字宽度的还原度取决于**回退策略是否一致**，这需要在真实窗口下、用真实字体链实测。

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

> **CSS Grid 不在禁用清单内** —— Taffy 原生支持，这正是选 taffy 路线而非自研布局器的关键原因之一。

这套规则做进 Figma 的组件库和 design token 后，**设计稿天然就落在 taffy 路线可映射的子集里**。

分维度的可达上限：

| 维度 | 可达水平 | 依据 |
|---|---|---|
| 布局结构 | **100%** | 实测 0.000px（5 case / 70 测量点） |
| 盒模型 / 圆角 / 边框 / 阴影 / 渐变 / 透明度 | ~100% | 原生 API 一一对应 |
| 文字宽度 | 原理上 ~99%+ | 同一字体 hmtx 相同；风险在回退字体选择，需真实窗口实测 |
| 文字断行 / 行高 | ~95–98% | cosmic-text 与浏览器非同实现 |
| 交互态（hover/focus/active） | ~95% | 逐个手写映射 |
| CSS 滤镜 / 混合模式 / 元素级毛玻璃 / 伪元素 / 复杂 mask | **0%** | 源码核实，gpui 无等价物 |
| 像素级一致 | **0%** | 原理不可能（光栅化、字距、亚像素策略均不同） |

**综合：设计稿受约束时可达 98–99% 视觉等价；重度依赖 web 特效时降到 70–80%。**

> 实测口径的更新：布局几何与文字度量已验证为**等价**（0.000px / ≤0.014px），所以「98–99%」不再是估计，而是「除栅格化与被禁用的 CSS 特效外，其余部分完全等价」。

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

gpui 0.2.2 **没有截图 API** —— 无 `platform/visual_test.rs`、无 `screenshot()`、无 `toggle_headless`。测试设施（`test-support`）只提供几何量 `debug_bounds`，不产出像素。

流程：

1. 从设计稿导出 PNG（`design/screenshots/`）
2. 真机窗口渲染 → `screencapture -x -R<x,y,w,h>` 抓图 → PNG
3. 两者做像素 diff（SSIM 或感知哈希）
4. 设阈值（如 SSIM ≥ 0.98）进 CI

**这把「还原度」从主观感受变成 CI 里可测量的数字。** 任何视觉回归都会被拦下。

---

## 4. 对数据库管理工具的具体影响

SelaDB 的界面主体是数据表格，而**数据表格的经典布局正是 CSS Grid**（表头固定 + 主体纵向滚动 + 横向滚动 + 列宽可调）。

**Taffy 原生支持 Grid，设计稿可以照常用 CSS Grid 表达，不必降级成 Flex。** 这是选 taffy 路线的直接收益 —— 换成自研布局器就只能要么禁用 Grid、要么放弃数据网格的经典布局。

gpui `examples/data_table.rs`（参考蓝本）给出的实现路线是：表头与 `uniform_list` 平级（表头天然固定），列宽由 `FIELDS` 数组统一定义，可见范围通过 `uniform_list` 的 `range` 回调追踪。

需要自建的增量主要是：列宽拖拽调整（gpui 参考示例是固定列宽）、横向滚动与纵向滚动的偏移同步、单元格类型着色（NULL / BLOB / 时间格式）。

---

## 5. 代价清单（诚实版）

即使采用上述做法，以下成本依然存在。其中若干项是 gpui 路线的能力缺口，**换成自研 gui-core 后解法已变**，逐行标注如下：

| 成本 | 说明 |
|---|---|
| 人工翻译层 | CSS → 自研样式层的映射仍是人工的，没有自动化工具 |
| 像素差异 | 字体光栅化永远不一致，黄金图阈值要留余量（**布局与字宽已实测等价**，见 [`fidelity-measurement.md`](fidelity-measurement.md)） |
| 抓图链路自建 | **解法已变**：自研方案按 nanoui 的 Tester 模式提供无头渲染与像素输出，不再依赖 `screencapture` 真机抓图 |
| 字体相关断言 | **解法已变**：自研字体栈在无头环境加载真实字体，列宽 / 截断 / 换行类断言可进单测 |
| 交互状态 | **已由自研方案覆盖**：style 层提供 CSS 解析、选择器匹配与级联，`:hover` / `:focus` / `:active` 直接由级联得出，无需逐个映射回调 |
| 字体回退 | 需确认目标平台的系统中文字体覆盖情况与设计稿一致 |
| CSS `float` | Taffy 不支持 float 布局（实测版本 0.9 无 float），设计稿禁用浮动布局 |
| 列宽拖拽 | gpui 参考示例是固定列宽，拖拽调整需自建 |
| 双轴滚动同步 | 表头与主体的横向偏移需手动同步 |
| 滚动容器要显式声明 | `overflow:visible` 的 flex item 有 min-content 地板，翻译时必须显式给出 `overflow: hidden` / `overflow: scroll` |

---

## 6. 与 Web 路线的对比（同一张设计稿）

| 维度 | 原生（自研 gui-core） | Web（系统 webview） |
|---|---|---|
| 视觉等价度 | 布局与字宽**实测等价**，栅格化有差异（约束设计规范后） | 100% |
| 像素一致 | 不可能 | 也不保证（跨浏览器仍有差异） |
| 黄金图回归 | ⚠️ 需自建无头渲染与像素回归 | ✅ 浏览器截图，直接可用 |
| 设计约束 | 必须禁用 滤镜 / 混合模式 / 伪元素 / float | 无 |
| 产物体积 | 10–20MB | 10–20MB |
| 内存占用 | 低 | 中（浏览器渲染进程） |
| 启动速度 | 快 | 中 |
| 语言栈 | 纯 Rust | Go + Web |
| 中文 IME | 协议级完整实现 ✅（自研路线待实现） | 天然正确 ✅ |

**结论：两条路都能做到「人眼分辨不出」的还原度。** 差别在于原生路线要你接受一份「禁用清单」，Web 路线不用。

既然两者都要，那就把取舍点明确下来 —— 这也是最终要拍板的事。
