# AGENTS.md

SelaDB —— 跨平台（Windows / macOS / Linux）数据库管理软件。

## 技术栈（已定，勿随意更换）

全项目 **Rust**。GUI 用 GPUI 直接走平台原生 GPU 渲染（macOS Metal / Windows D3D12 / Linux Vulkan），不用 WebView。

| 层 | 选型 |
|---|---|
| GUI 框架 | `gpui` v0.2.2（Zed 的框架，Apache-2.0） |
| GUI 组件 | 自建，参考官方 `examples/data_table.rs` |
| SQL 语法高亮 | `tree-sitter` + `tree-sitter-sql` |
| CLI 框架 | `clap` v4.6.7 |
| MCP | `rmcp` v3.6.0（官方 Rust SDK） |
| 驱动 | `tokio-postgres` / `sqlx` / `rusqlite` / `redis` / `clickhouse-rs` |
| 日志 | `tracing` + `tracing-subscriber` |

**完整选型、版本号、构建矩阵见 [`docs/architecture.md`](docs/architecture.md) 与 [`docs/gui-architecture.md`](docs/gui-architecture.md)。决策依据见 [`docs/adr/`](docs/adr/)。**

## 硬约束

1. **Cargo 多 crate 工作区**，不合并成单 crate。GUI 的 `gpui` 依赖很重（含 Metal shader 编译），不能污染 CLI / MCP Server 的构建。
2. **只依赖宽松许可证的 crate**。Zed 的应用层 crate（`ui` / `component` / `editor` / `text` / `language` / `theme` / `icons` / `menu`）是 GPL-3.0-or-later 且未发布，**一律不用**。可用的只有 Apache-2.0 的 `gpui` 及其依赖。
3. **业务逻辑只写在 `seladb-core/src/service/`**。CLI 命令、GUI 视图、MCP 工具都只做「解析参数 → 调 service → 格式化输出」，不放业务判断。
4. **驱动用小 trait + 能力探测**（见 `docs/adr/0005-driver-interfaces.md`）。不要为了省事定义大 trait，Redis 实现不了 `list_columns`。
5. **CLI 所有命令必须支持 `--json`**。Skill 包装、MCP 工具、CI 脚本三条路径都依赖它。
6. **gpui 的调用收敛在 `seladb-gui` crate 内**，不外泄到 `core` / `driver` / `service`。
7. **macOS GUI 构建需要 Metal Toolchain 组件**。`xcodebuild -downloadComponent MetalToolchain`（838.9 MB）。CI 的 macOS runner 必须预装，否则构建直接失败。

## 目录约定

```
crates/seladb-core/     领域模型、驱动、查询、服务编排
crates/seladb-cli/      CLI 入口（clap）
crates/seladb-mcp/      MCP Server 入口
crates/seladb-gui/      GUI 入口（gpui）
crates/gui-core/        自研 GUI 框架（taffy + cosmic-text + wgpu）
ui/                     UI 设计源（纯 HTML + CSS + JS，不进 Cargo 工作区）
design/tokens.json      唯一设计源：颜色/间距/字号/圆角/阴影/动效
docs/                   架构文档与 ADR
```

`seladb-core` 内部再分：`core/`（领域模型）、`driver/`（引擎抽象与实现）、`query/`（查询与结果集）、`session/`（连接与凭据）、`service/`（业务逻辑落点）、`config/`（配置加载）。

## UI 设计源（`ui/`）

`ui/` 是**纯静态**的 HTML + CSS + JS 设计源，不进 Cargo 工作区，是后续 Rust 原生实现的视觉与交互基线。

- **零第三方 UI 依赖**：数据网格、对象树、菜单、图标全部自研，视觉完全由 `ui/assets/tokens.css` 控制。
- **零构建步骤**：纯静态 HTML + CSS + JS，**双击 `ui/index.html` 就能打开**，不占端口、不需要服务器。
- 因为不用 ES module（`file://` 下会被 CORS 拦住），所有脚本共享全局作用域，**`ui/assets/` 里的顶层名字必须全局唯一**。
- `tokens.css` 是唯一设计源，组件样式里不出现裸色值与裸尺寸。
- 改动设计源后跑 `cd ui && bun run test:smoke`（直接跑 `file://` 协议，不需要先起服务器），截图落在 `ui/tests/screenshots/` 作为视觉回归基准。
- **改了视觉还要过视觉评审**：`cd ui && node tests/review.mjs` 会把黄金截图交给多模态模型按固定 rubric 打分，输出可定位的问题清单，报告落在 `ui/tests/review-report.md`。功能断言验不了「好不好看」，这一步不能省。
- 详见 [`ui/README.md`](ui/README.md) 与 [`docs/ui-design-plan.md`](docs/ui-design-plan.md)。

## 加新引擎时

在 `seladb-core/src/driver/<engine>/` 建模块，实现 `Driver` + 最小必要的能力 trait，在初始化时注册，然后更新 `docs/engine-support.md` 记录支持到哪一档。只实现引擎真正支持的能力，不要用「永远返回错误」的方法凑接口。

## 提交与规范

- 提交信息用简体中文，遵循 Conventional Commits（`feat:` / `fix:` / `chore:` / `docs:`）
- 换行符由仓库根目录 `.gitattributes` 统一管理，不要在编辑器里手动改
- 架构层面的决策走 `docs/adr/`，先写 ADR 再改代码
- 特性开发走 Spec Kit 工作流：`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`
