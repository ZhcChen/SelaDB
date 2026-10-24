/**
 * 浏览器启动配置 —— 整个仓库只有这一处定义。
 *
 * **为什么不用裸 `chromium.launch()`**：
 * Playwright 1.49 起，裸调用在 `headless: true` 下走的是
 * `chromium_headless_shell`（旧的 headless 实现），不是完整 Chromium。
 * 两者有可观测的指纹差异：
 *
 *   |                    | headless shell | 完整 Chromium |
 *   |--------------------|---------------|---------------|
 *   | `window.chrome`    | 不存在         | 存在           |
 *   | `navigator.plugins` | 0            | 5              |
 *
 * 而且**两者渲染出的像素不一样**（实测同一界面差 2695 个像素，分布在
 * 345 行上，最大单像素通道差 242/765）—— 字体光栅化的抗锯齿策略不同。
 * 所以「用哪个构建」不是风格问题：基准图与实际截图必须来自同一个构建，
 * 否则像素比对全是假差异。
 *
 * 全局规则（`~/.minimax/AGENTS.md`「浏览器自动化默认策略」）：
 * 无头实例一律用独立构建（完整 Chromium + `channel: "chromium"` +
 * `--disable-blink-features=AutomationControlled`），不占用户前台。
 */

import { chromium } from "playwright";

/** 启动选项。四个测试脚本共用，保证截图与基准来自同一构建。 */
export const BROWSER_LAUNCH_OPTIONS = {
  // 完整 Chromium，不是 chromium_headless_shell
  channel: "chromium",
  args: ["--disable-blink-features=AutomationControlled"],
};

/** 按统一配置启动浏览器。 */
export function launchBrowser(options = {}) {
  return chromium.launch({ ...BROWSER_LAUNCH_OPTIONS, ...options });
}
