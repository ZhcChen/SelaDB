# AGENTS.md

SelaDB —— 跨平台（Windows / macOS / Linux）数据库管理软件。

## 技术栈（已定，勿随意更换）

全项目 **Rust**。GUI 用自研的 `gui-core` 直接走平台原生 GPU 渲染（macOS Metal / Windows D3D12 / Linux Vulkan），不用 WebView。框架分层与参考实现分工见 [`docs/gui-framework-architecture.md`](docs/gui-framework-architecture.md) 与 [`docs/gui-framework-comparison.md`](docs/gui-framework-comparison.md)。

| 层 | 选型 |
|---|---|
| GUI 框架 | **自研 `crates/gui-core/`**（ADR-0006），布局 `taffy` / 文本 `cosmic-text` / 渲染 `wgpu` / 窗口 `winit` |
| GUI 组件 | 自建，参考 nanoui 与 gpui `examples/data_table.rs`（两者都**没有**树和表格控件） |
| 图标 | 自建，Lucide 风格线条图标（Zed 的 `icons` crate 是 GPL-3.0-or-later 且未发布，不可用） |
| SQL 语法高亮 | `tree-sitter` + `tree-sitter-sql` |
| CLI 框架 | `clap` v4.6.7 |
| MCP | `rmcp` v3.6.0（官方 Rust SDK） |
| 驱动 | `tokio-postgres` / `sqlx` / `rusqlite` / `redis` / `clickhouse-rs` |
| 日志 | `tracing` + `tracing-subscriber` |

**完整选型、版本号、构建矩阵见 [`docs/architecture.md`](docs/architecture.md) 与 [`docs/gui-architecture.md`](docs/gui-architecture.md)。决策依据见 [`docs/adr/`](docs/adr/)。**

## 硬约束

1. **Cargo 多 crate 工作区**，不合并成单 crate。`gui-core` 依赖很重（含 wgpu 与字体栈编译），不能污染 CLI / MCP Server 的构建。
2. **只依赖宽松许可证的 crate**。Zed 的应用层 crate（`ui` / `component` / `editor` / `text` / `language` / `theme` / `icons` / `menu`）是 GPL-3.0-or-later 且未发布，**一律不用**；`Slint`（含 GPL-3.0-only）同样不用。gpui 与 nanoui **只作参考蓝本，不作为依赖引入**。
3. **业务逻辑只写在 `seladb-core/src/service/`**。CLI 命令、GUI 视图、MCP 工具都只做「解析参数 → 调 service → 格式化输出」，不放业务判断。
4. **驱动用小 trait + 能力探测**（见 `docs/adr/0005-driver-interfaces.md`）。不要为了省事定义大 trait，Redis 实现不了 `list_columns`。
5. **CLI 所有命令必须支持 `--json`**。Skill 包装、MCP 工具、CI 脚本三条路径都依赖它。
6. **`gui-core` 的调用收敛在 `seladb-gui` crate 内**，不外泄到 `core` / `driver` / `service`。
7. **macOS GUI 构建不再需要 Metal Toolchain**。wgpu 走 naga（WGSL→MSL/HLSL/SPIR-V 的纯 Rust 翻译），不需要 Xcode 的 `metal` 离线编译器。`xcodebuild -downloadComponent MetalToolchain`（838.9 MB）是 gpui/blade 路线的要求（其 `build.rs` 调 `xcrun metal` 编译 `.metal` 文件），自研路线下**不需要**，CI 的 macOS runner 也不必预装。若将来引入 blade/gpui 渲染后端，这条约束重新生效。
8. **跑 GUI 用例一律无头**，不弹窗、不抢焦点、不驱动真实屏幕。框架侧照 nanoui 的 Tester 模式提供 `TestHarness`（不建窗口，喂合成事件、推进虚拟时钟、读回几何）。

## 目录约定

```
crates/seladb-core/     领域模型、驱动、查询、服务编排
crates/seladb-cli/      CLI 入口（clap）
crates/seladb-mcp/      MCP Server 入口
crates/seladb-gui/      GUI 入口
crates/gui-core/        自研 GUI 框架（taffy + cosmic-text + wgpu + winit）
ui/                     UI 设计源（纯 HTML + CSS + JS，不进 Cargo 工作区）
design/tokens.json      唯一设计源：颜色/间距/字号/圆角/阴影/动效
docs/                   架构文档与 ADR
docs/lessons/           经验库：每轮开发沉淀的可迁移教训
scripts/acceptance.sh   验收脚本：跑通整条通路的端到端断言
```

`seladb-core` 内部再分：`core/`（领域模型）、`driver/`（引擎抽象与实现）、`query/`（查询与结果集）、`session/`（连接与凭据）、`service/`（业务逻辑落点）、`config/`（配置加载）。

## 开发循环

**怎么开发**写在 [`docs/development-loop.md`](docs/development-loop.md)：Propose–Probe–Compose 的两层递归、盲选 rubric、证据纪律、经验库格式。

几条最容易忘的：

- **经验库在 `docs/lessons/`**，每轮收尾要写一条。没有证据支撑的教训不写入 —— 写 `NO_ENTRY`。
- **评审的结论要逐条用像素/计算样式核实**，误判要驳回。我们已经被同一种幻觉坑过三次。
- **验证器与被测物分离**：单测不打桩，集成测试用真库真 SQL，验收脚本跑真二进制。

常用命令：

```bash
cargo build                          # 只建 core 与 cli（gui-core 依赖 wgpu，很重）
cargo test                           # 单元 + 集成测试
scripts/acceptance.sh                # 端到端验收
cd ui && bun run test:smoke          # 设计源功能验收
cd ui && bun run test:contrast       # 设计源对比度检查
```

## UI 设计源（`ui/`）

`ui/` 是**纯静态**的 HTML + CSS + JS 设计源，不进 Cargo 工作区，是后续 Rust 原生实现的视觉与交互基线。

- **零第三方 UI 依赖**：数据网格、对象树、菜单、图标全部自研，视觉完全由 `ui/assets/tokens.css` 控制。
- **零构建步骤**：纯静态 HTML + CSS + JS，**双击 `ui/index.html` 就能打开**，不占端口、不需要服务器。
- **截图的浏览器构建全仓库只有一处**：`ui/tests/browser.mjs` 的 `launchBrowser()`。
  不要写裸 `chromium.launch()` —— Playwright 1.49 起那走的是
  `chromium_headless_shell`（缺 `window.chrome`、`plugins=0`），**而且渲染出的
  像素与完整 Chromium 不同**（实测同一界面差 0.05% 的像素，分布整个窗口）。
  截图与基准图必须来自同一构建，否则像素比对全是假差异。
- 因为不用 ES module（`file://` 下会被 CORS 拦住），所有脚本共享全局作用域，**`ui/assets/` 里的顶层名字必须全局唯一**。
- `tokens.css` 是唯一设计源，组件样式里不出现裸色值与裸尺寸。
- 改动设计源后跑 `cd ui && bun run test:smoke`（直接跑 `file://` 协议，不需要先起服务器），截图落在 `ui/tests/screenshots/` 作为视觉回归基准。
- **改了视觉还要过视觉评审**：`cd ui && node tests/review.mjs` 会把黄金截图交给多模态模型按固定 rubric 打分，输出可定位的问题清单，报告落在 `ui/tests/review-report.md`。功能断言验不了「好不好看」，这一步不能省。
- **绝对分数有 ±1 的抖动**，只能当方向。判断改动好坏用成对比较：`cd ui && node tests/review.mjs --compare`（基线截图在 `ui/tests/baseline/`）。
- 详见 [`ui/README.md`](ui/README.md) 与 [`docs/ui-design-plan.md`](docs/ui-design-plan.md)。

## 加新引擎时

在 `seladb-core/src/driver/<engine>/` 建模块，实现 `Driver` + 最小必要的能力 trait，在初始化时注册，然后更新 `docs/engine-support.md` 记录支持到哪一档。只实现引擎真正支持的能力，不要用「永远返回错误」的方法凑接口。

## 提交与规范

- 提交信息用简体中文，遵循 Conventional Commits（`feat:` / `fix:` / `chore:` / `docs:`）
- 换行符由仓库根目录 `.gitattributes` 统一管理，不要在编辑器里手动改
- 架构层面的决策走 `docs/adr/`，先写 ADR 再改代码
- 特性开发走 Spec Kit 工作流：`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`
