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

## 2. Gio v0.10.3 的实际能力清单

以下逐项从源码核实（`layout/`、`op/paint/`、`op/clip/`、`text/`、`fontscan`）。

### 2.1 能 1:1 映射的

| CSS 能力 | Gio 实现 | 位置 |
|---|---|---|
| Flexbox 布局 | `layout/flex.go`，含 gap / 主轴对齐 / 交叉轴对齐 / 换行 | `layout/` |
| 绝对定位 | `layout/stack.go` | `layout/` |
| 盒模型 padding / margin / border | 完整 | `layout/flex.go` |
| 纯色填充 | `paint.Fill` / `paint.FillShape` | `op/paint/paint.go` |
| 线性渐变 | `paint.LinearGradientOp`（着色器类型 `TypeLinearGradient`） | `op/paint/paint.go` |
| 图片 | `paint.NewImageOp` | `op/paint/paint.go` |
| 透明度 | `paint.PushOpacity` | `op/paint/paint.go` |
| 矢量路径 | `clip.Path`：Move / Line / Quad / Cube / Arc / Close | `op/clip/clip.go` |
| 描边 / 轮廓 | `clip.Stroke` / `clip.Outline` | `op/clip/clip.go` |
| 圆角矩形 | `clip.UniformRRect`（四角同半径） | `op/clip/shapes.go` |
| **文本换行算法** | go-text/typesetting：HarfBuzz 整形 + **CSS UAX #14 换行** + bidi | `text/` |
| 系统字体发现 + 缺字回退 | fontscan 纯 Go 跨平台 + 字形覆盖率查询 | `text/` |

**文本这一项值得单独强调**：Gio 的换行与整形走的是 go-text/typesetting，其中换行规则实现的是 CSS 的 UAX #14，**与浏览器同源**。中英混排的断行位置、标点避头尾、连字与字距都能对上浏览器。这是原生方案里最难补齐的一块，而 Gio 恰好有。

### 2.2 缺口的

| CSS 能力 | Gio 现状 | 补齐成本 |
|---|---|---|
| **CSS Grid 布局** | ❌ `layout/` 下只有 flex / stack / list，**没有 Grid** | **高** —— 要自己实现 Grid 布局算法 |
| **box-shadow** | ❌ **没有任何阴影原语**。material 里唯一的 "shadow" 是 switch 滑块用半透明圆盘近似 | 中 —— 需自建离屏模糊 |
| **backdrop-filter / blur()** | ❌ 无 | 高 |
| **mix-blend-mode** | ❌ 无 | 高 —— 需离屏合成 |
| **CSS filter** | ❌ 唯一的 "filter" 是图片缩放插值（linear/nearest） | 高 |
| **CSS mask / 复杂 clip-path** | ⚠️ `clip.Path` 可近似，非等价 | 中 |
| **::before / ::after** | ❌ 无伪元素 | 低 —— 用子元素替代 |
| **自定义滚动条** | ❌ 无 `::-webkit-scrollbar` 等价物 | 低 —— 自绘 |
| **transition / @keyframes** | ⚠️ 只有 `spring.rs` 弹簧动画，缓动曲线需重新实现 | 中 |
| **像素级字体渲染** | ❌ | 不可解决 |

---

## 3. 核心结论：还原度由你的设计规范决定，不由框架决定

这是整个问题的关键。

**框架只提供「可映射的子集」，最终还原度取决于你是否把设计约束在这个子集内。**

### 做法一：约束设计规范（推荐）

在设计阶段就禁用不可映射的特性：

| 规则 | 替代方案 |
|---|---|
| 禁用 CSS Grid | 全部用 Flex 布局 |
| 禁用 box-shadow | 用预渲染的阴影位图，或用 1px 边框 + 背景色差模拟层次 |
| 禁用毛玻璃 / 混合模式 | 用不透明度叠加的纯色 |
| 渐变只用线性 | 径向渐变不用 |
| 动画只用弹簧预设档位 | 不用 CSS 缓动曲线 |
| 圆角只用固定档位 | 如 4 / 8 / 12 |

这套规则做进 Figma 的组件库和 design token 后，**设计稿天然就落在 Gio 可映射的子集里**。此时还原度可以做到 **98–99%** —— 剩下的 1–2% 是字体光栅化的亚像素差异，人眼不可辨。

### 做法二：设计源用 token，不用 HTML

```
design/
├── tokens.json          # 颜色 / 间距 / 字号 / 圆角 / 阴影 / 动效参数
├── prototype/           # HTML/CSS 原型，只用于出稿与交互验证
│   └── index.html
└── screenshots/         # 设计稿导出的 PNG，用作黄金图基准
```

- `tokens.json` 是**唯一设计源**，前端原型与 Go 实现读同一份
- HTML 的作用是出稿和验证交互，不是最终实现
- 翻译过程是机械映射，不靠人肉对像素

### 做法三：还原度用黄金图度量

Gio 的 `unit` 包能把界面渲染成图片：

```go
golden := unit.New(frame)
img := golden.Image()
```

流程：

1. 从设计稿导出 PNG（`design/screenshots/`）
2. Gio 渲染同一界面 → PNG
3. 两者做像素 diff（SSIM 或感知哈希）
4. 设阈值（如 SSIM ≥ 0.98）进 CI

**这把「还原度」从主观感受变成 CI 里可测量的数字。** 任何视觉回归都会被拦下。

---

## 4. 对数据库管理工具的具体影响

SelaDB 的界面主体是数据表格，而**数据表格的经典布局正是 CSS Grid**（表头固定 + 主体纵向滚动 + 横向滚动 + 列宽可调）。

Gio 没有 Grid，只有 Flex。要实现这个布局只有两条路：

1. **用 Flex 拼** —— 表头是横向 Flex，主体是纵向虚拟化 List，两者用 `layout.Stack` 叠加，表头和主体各自独立滚动并同步横向偏移。可行，但列宽对齐需要手动同步
2. **自己实现 Grid 布局** —— 在 `internal/ui/` 里写一个 Grid 布局器（把子元素按行列放置）。工作量不小，但只有这一个布局器，之后所有 Grid 设计稿都能直接映射

**建议：走 Flex 拼的路线，把 Grid 列入禁用清单。** 表格的列宽同步问题在实现时集中处理一次即可。

---

## 5. 代价清单（诚实版）

即使采用上述做法，以下成本依然存在：

| 成本 | 说明 |
|---|---|
| 阴影自建 | 若设计上不允许用边框模拟，需要写离屏模糊渲染 |
| Grid 缺失 | 要么禁用，要么自建布局器 |
| 人工翻译层 | CSS → Gio 的映射是人工的，没有自动化工具 |
| 像素差异 | 字体光栅化永远不一致，黄金图阈值要留余量 |
| 交互状态 | CSS 的 `:hover` / `:focus` / `:active` 要逐个映射成 Gio 的事件回调 |
| 字体回退 | 需确认目标平台的系统中文字体覆盖情况与设计稿一致 |

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
