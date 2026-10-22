import { boot } from "./app.js";

/**
 * 设计源入口。
 *
 * 启动顺序在这里刻意保持最简:先恢复偏好(主题跟随系统),再构建节点索引,
 * 最后交给 app.js 的路由分发。渲染逻辑不放在这里。
 */
const root = document.getElementById("app");
if (!root) {
  throw new Error("缺少 #app 挂载点");
}

boot(root);
