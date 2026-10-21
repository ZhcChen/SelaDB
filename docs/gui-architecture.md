# GUI 方案：GPUI

> 状态：2026-10-21 定稿
> 关联：ADR-0004（界面栈选型）、ADR-0002（CGO 边界）、[`gui-framework-survey.md`](gui-framework-survey.md)（全景对比）、[`compile-benchmarks.md`](compile-benchmarks.md)（实测数据）
>
> **决策沿革**：初版 Wails v2 + Web 前端 → 因需求改为「原生 GPU 渲染」转向 Gio → 经源码核实与实测转向 **GPUI**。详见 ADR-0004 的决策沿革。

本文聚焦 GUI 客户端。核心库、CLI、MCP Server 的选型见 [`architecture.md`](architecture.md)。

---

## 1. 结论

**GUI 用 `gpui`（Zed 的框架）v0.2.2，Apache-2.0，可脱离 Zed 仓库独立使用。**

| 平台 | 渲染后端 |
|---|---|
| macOS | **Metal**（`Metal.framework` + `QuartzCore.framework`，已实测链接确认） |
| Linux | Vulkan（经 `blade-graphics`） |
| Windows | Direct3D 12 / Vulkan（经 `blade-graphics`） |

依赖 `blade-graphics` 0.9.0（Zed 的 GPU 抽象层，Apache-2.0，crates.io 已发布），一套代码覆盖三平台。

---

## 2. 为什么是 GPUI

### 2.1 布局层与浏览器同源

GPUI 用 **Taffy 0.13**，features 开启 `flexbox` / `grid` / `block_layout` / `float_layout` / `content_size` —— 这是浏览器的 CSS 布局算法集，**不是仿写，是同一套实现**。

这意味着设计稿的布局可以近乎直接映射：

| CSS | GPUI |
|---|---|
| `display: flex` + `flex-direction` / `gap` / `justify-content` / `align-items` | `div().flex().flex_col().gap_3().justify_center().items_center()` |
| `display: grid` + `grid-template-columns` | Taffy 的 grid 支持，**唯一能直接映射 CSS Grid 的候选** |
| `position: absolute` | `layout.Stack` |
| `padding` / `margin` / `border` / `box-sizing` | 完整支持 |
| `float` / `block` 流式布局 | Taffy 支持 |

API 形态接近 Tailwind 的 utility class，设计稿的规整布局能一对一手写。

### 2.2 官方提供的数据表参考实现

`gpui` crate 内自带 `examples/data_table.rs`（**473 行，Apache-2.0**），已经实现数据库表格需要的全套：

| 能力 | 实现 |
|---|---|
| 固定表头 | 表头与 `uniform_list` 平级，天然固定 |
| 虚拟化 | `uniform_list` + `cx.processor(move \|this, range: Range<usize>, _, _| ...)`，只渲染可见区间 |
| 列宽 | `FIELDS.map(\|(key, width)\| ... .w(px(width)))` |
| 文本截断 | `.truncate().whitespace_nowrap()` |
| 自定义滚动条 | `render_scrollbar` |
| 可见范围追踪 | `self.visible_range = range.clone()`，可用于分页与虚拟滚动联动 |
| 单元格类型着色 | `change_color` 返回 `gpui::Hsla` |

**这是所有候选里唯一由框架作者提供、且许可可商用的完整数据表实现。**

### 2.3 中文 IME 是完整协议实现

| 平台 | 实现位置 | 内容 |
|---|---|---|
| macOS | `src/platform/mac/window.rs` | Cocoa `NSTextInput` 协议：`set_marked_text` / `insert_text` / `has_marked_text` / `marked_text_range` / `valid_attributes_for_marked_text` |
| Linux Wayland | `src/platform/linux/wayland/window.rs` | `input_handler.marked_text_range()` 集成 |
| Linux X11 | `src/platform/linux/x11/window.rs` | 同上 |

Zed 是编辑器，中文输入是刚需，这条路径是生产验证过的。

### 2.4 版本稳定，可正常锁版本

gpui 的 crates.io 发布记录：

| 版本 | 发布时间 |
|---|---|
| 0.2.0 | 2025-10-09 |
| 0.2.1 | 2025-10-14 |
| 0.2.2 | 2025-10-22 |

三个版本集中在 2025-10，之后一年无新版本。**一年一版 = 可以正常锁版本、可以计划升级**。

对比 Gio：官方明说 0.x 阶段每次 minor 升级都是破坏性变更、tags 不回移 bugfix、必须跟 `main` 分支 —— 那是完全相反的处境。

gpui.rs 官网说「GPUI is tied to Zed」约束的是**你不能给 gpui 单独打补丁**（贡献要提到 Zed 仓库），不是「你不能锁版本」。

### 2.5 独立使用已实测通过

我把 crates.io 上发布的 `gpui 0.2.2` 拉进一个空项目，只依赖 crates.io（无任何 git/path 依赖）：

```toml
[dependencies]
gpui = "0.2"
rand = "0.9"
```

| 验证项 | 结果 |
|---|---|
| 独立构建 | ✅ 成功 |
| 产物大小 | **5.6M** |
| 链接的图形后端 | `Metal.framework` + `QuartzCore.framework` |
| 冷编译 | ~76s |
| 真增量（改一行） | **0.99s** |

gpui 的依赖在发布时重命名以避开与 Zed 主程序的冲突：`collections` → `gpui_collections`、`http_client` → `gpui_http_client`、`gpui_macros` → `gpui-macros`、`gpui_util` → `gpui_util`、`gpui_util_macros` → `gpui_util_macros`，全部在 crates.io 上。

---

## 3. 许可证边界

| crate | license | 可用性 |
|---|---|---|
| `gpui` | **Apache-2.0** | ✅ crates.io 0.2.2 |
| `gpui_collections` / `gpui_http_client` / `gpui-macros` / `gpui_util` / `gpui_util_macros` | Apache-2.0 | ✅ 均为 0.2.x |
| `blade-graphics` / `blade-macros` / `blade-util` | Apache-2.0 | ✅ |
| `ui` / `component` / `editor` / `text` / `language` / `theme` / `icons` / `menu` / `search` | **GPL-3.0-or-later** | ❌ 未发布（Zed 工作区 `publish = false`） |

**规则：只依赖 Apache-2.0 的部分，不引入 Zed 的应用层 crate。**

这意味着组件要自建，但影响有限：

- Zed 的 `ui` 组件是按 Zed 的设计语言做的，数据库工具本来就要自己的组件
- 核心的通用控件在 `gpui` crate 内有基础设施（`interactivity`、`focus`、`tab_stop`、`clip`/`paint` 原语）
- 数据表有官方 473 行参考实现可改

---

## 4. 构建环境

### 4.1 macOS 必须安装 Metal Toolchain

gpui 的 build.rs 在编译期调用 Apple 的 `metal` 着色器编译器。现代 Xcode 默认不带该组件：

```
cargo::error=metal shader compilation failed:
error: cannot execute tool 'metal' due to missing Metal Toolchain;
use: xcodebuild -downloadComponent MetalToolchain
```

`xcodebuild -showComponent MetalToolchain` → `Status: uninstalled`。

**一次性安装**：

```bash
xcodebuild -downloadComponent MetalToolchain   # 838.9 MB，本机实测 43 秒
```

**CI 的 macOS runner 也必须预装这个组件**，否则构建直接失败。这是选型时最容易漏掉的运维成本。

### 4.2 交叉编译 Windows 需 mingw-w64

Rust 交叉编译到 Windows 需要额外的链接器工具链：

| target | 需要 | 本机实测 |
|---|---|---|
| `x86_64-pc-windows-msvc` | Windows 上的 Visual Studio Build Tools（提供 `link.exe`） | ❌ 失败 |
| `x86_64-pc-windows-gnu` | mingw-w64（`brew install mingw-w64`） | ❌ 失败（未装） |

Go 则是 `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build` 一条命令，零额外工具链 —— 这是 Go 相对 Rust 的实质优势。

### 4.3 建议的构建矩阵

| 目标 | 构建位置 | 额外依赖 |
|---|---|---|
| macOS arm64 / amd64 | macOS runner | **Metal Toolchain 组件** |
| Windows amd64 / arm64 | Windows runner | 无（MSVC 工具链自带） |
| Linux amd64 / arm64 | Linux 容器 | `libx11`、`libxkbcommon`、Vulkan 驱动 |

**GUI 不做跨平台交叉编译**（图形栈交叉编译代价极高），各平台原生构建。

---

## 5. 目录结构

GPUI 是混合模式（hybrid immediate & retained），状态在外部、渲染无状态：

```
SelaDB/
├── Cargo.toml
├── crates/
│   ├── seladb/                # 工作区入口（库）
│   ├── seladb-cli/           # CLI 二进制：clap
│   ├── seladb-mcp/           # MCP Server：rmcp
│   └── seladb-gui/           # GUI 二进制：gpui
├── src/  (或各 crate 内)
│   ├── core/                 # 领域模型：连接、库、schema、表、列、结果集
│   ├── driver/               # 引擎抽象 + 注册表
│   │   ├── postgres/  mysql/  sqlite/  mssql/  clickhouse/  redis/  mongo/  oracle/
│   ├── query/                # 查询执行、结果集
│   ├── session/              # 连接会话、凭据
│   ├── service/              # 业务逻辑唯一落点
│   └── config/               # 配置加载
├── design/
│   ├── tokens.json           # 唯一设计源：颜色/间距/字号/圆角/阴影/动效
│   └── screenshots/          # 设计稿导出 PNG（黄金图基准）
└── docs/
```

### 5.1 分层规则

- `service` 层是**唯一的业务逻辑落点**。CLI 命令、GUI 视图、MCP 工具都只做「解析参数 → 调 service → 格式化输出」
- `driver` 层只做「把引擎原生语义翻译成核心抽象」
- GUI 侧的 gpui 调用**收敛在 `seladb-gui` crate 内**，不外泄到 `core`/`driver`/`service`

---

## 6. 组件策略

### 6.1 自建清单

| 组件 | 来源 | 规模估计 | 优先级 |
|---|---|---|---|
| 虚拟化数据表格 | 改自官方 `data_table.rs` | 400–700 行 | P0 |
| 树形导航（连接→库→schema→表→列） | 自建 | 300–500 行 | P0 |
| 单元格类型渲染（类型着色 / NULL 样式 / BLOB 截断 / 时间格式） | 自建 | 200 行 | P0 |
| SQL 编辑器 | 基于 gpui 文本系统 + tree-sitter 语法高亮 | 400–800 行 | P1 |
| 分栏布局（可拖拽） | 自建 | 300 行 | P1 |
| 主题（深色 / 浅色） | 基于 gpui 主题机制 | 200 行 | P1 |
| 对话框 / 菜单 | gpui 基础能力 + 自建 | 150 行 | P2 |

### 6.2 语法高亮

gpui 本身不含语法高亮。两种选择：

1. **tree-sitter**（Zed 的方案）—— `tree-sitter-sql` + `tree-sitter-highlight`，增量解析，与编辑器一致
2. **syntect**（egui 的方案）—— 基于 TextMate 语法，主题生态丰富

数据库工具的 SQL 高亮建议走 tree-sitter：能拿到语法树做结构化分析（比如识别表名、列名做跳转），而不只是着色。

### 6.3 语法高亮与数据渲染的一致性

数据表格和 SQL 编辑器应该共享一套 token（数据库类型 → 颜色映射），都从 `design/tokens.json` 派生。

---

## 7. 还原度策略

GPUI 的 Taffy 与浏览器同源，所以布局还原度天花板是所有原生方案里最高的。配合设计规范约束，可达 98–99% 视觉等价。

**设计规范禁用清单**（Taffy / gpui 不支持或不等价的）：

| 禁用 | 原因 | 替代 |
|---|---|---|
| CSS `filter` / `backdrop-filter` | gpui 无滤镜原语 | 纯色叠加 |
| `mix-blend-mode` | 无混合模式 | 预烘焙颜色 |
| 复杂 `mask` / `clip-path` | 只有基础裁剪 | 预渲染位图 |
| `::before` / `::after` | 无伪元素 | 真实子元素 |
| `::-webkit-scrollbar` | 无自定义滚动条 | 自行绘制（官方示例已有） |
| CSS 缓动曲线 | 只有 spring 动画 | 弹簧参数预设档位 |

**不被禁用**（gpui 原生支持）：Flexbox、Grid、绝对定位、盒模型、圆角、边框、阴影、渐变、透明度、SVG 图标、矢量路径、文本整形与换行。

### 7.1 黄金图回归

gpui 有 `visual_test.rs` 截图对比与 `toggle_headless` 无头模式。流程：

1. `design/screenshots/` 存设计稿导出的 PNG
2. 实现截图 → 与基准做像素 diff
3. 设阈值（SSIM ≥ 0.98）进 CI

**这把还原度从主观感受变成 CI 里可测量的数字。** 详见 [`ui-fidelity.md`](ui-fidelity.md)。

---

## 8. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| **macOS 缺 Metal Toolchain** | 构建直接失败 | 一次性 `xcodebuild -downloadComponent MetalToolchain`；CI runner 预装并检查 |
| **Windows 交叉编译需额外工具链** | 与跨平台目标冲突 | 用 Windows runner 原生构建，或装 mingw-w64 |
| **独立生态规模小**（gpui 38 万下载 vs egui 2722 万） | 第三方参考资料与现成方案少 | 官方示例质量高；组件自建为主 |
| **Zed 应用层组件 GPL 不可用** | 少一批现成控件 | 只用 Apache-2.0 部分；data_table 有参考实现 |
| **冷编译 76s** | CI 慢 | 配 cargo 缓存；日常增量 0.99s 可接受 |
| **gpui 由 Zed 单方面演进** | API 可能破坏 | 锁版本，按季评估升级；gpui 一年一版，升级频率天然低 |
| **Text 排版细节与浏览器有差** | 像素级无法一致 | 黄金图阈值留余量；中英混排换行由 Taffy + gpui 文本系统保证基本一致 |

---

## 9. 与 Go + Gio 方案的取舍

| 维度 | Rust + GPUI | Go + Gio |
|---|---|---|
| 冷编译 | 76s | **9.3s** |
| 增量（改一行） | 0.99s | **0.83s** |
| 交叉编译 Windows | 需 mingw-w64 | **零工具链** |
| macOS 构建前置 | 需 Metal Toolchain | 无 |
| CSS Grid 支持 | ✅ Taffy | ❌ |
| 数据表参考实现 | ✅ 官方 473 行 | ❌ 自建 800–1500 行 |
| 中文 IME | ✅ 完整逐平台 | ✅ 完整逐平台 |
| 版本可锁性 | ✅ 一年一版 | ❌ 必须跟 main |
| 维护主体 | 公司 | 个人 |
| 产物体积 | **5.6M** | 8.9M |
| 语言栈 | 单一 Rust | 单一 Go |

**结论：两者各有胜负，但 GPUI 在「原生 GUI 能力」这一侧优势明显，而 Go 的优势（编译速度）经实测只在冷编译体现。**

如果「还原度 + 原生 GPU」是硬需求 → **GPUI**。
如果「零构建摩擦 + 三平台一键交叉编译」是硬需求 → Go + Gio，但表格与 Grid 要自建。

---

## 10. 待定项

- **GUI 主题**：深色为主还是深浅双主题
- **字体**：gpui 默认走系统字体（`font-kit`），是否额外内置一套保证跨平台一致
- **图表**：结果分布可视化是否做
- **首批引擎**：建议 Postgres + MySQL + SQLite，与 GUI 表格组件同步推进
- **Cargo 工作区结构**：单 crate 还是多 crate workspace（建议多 crate，天然分离 CLI/GUI/MCP）
