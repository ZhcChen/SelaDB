/**
 * 把构建产物内联成单个 HTML 文件。
 *
 * 为什么需要这一步:`file://` 下浏览器的 CORS 规则会拦住 `<script type="module">`
 * 去加载外部 .js 文件 —— 设计源直接双击 index.html 就是一片空白。
 * 内联之后没有外部依赖,单个文件双击就能打开,方便发给同事看。
 *
 * 内联的 `<script type="module">` 不受 CORS 限制(限制只针对「去 fetch 一个
 * 模块文件」),所以这里保留 module 类型即可。
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "..", "dist");

/** 取出 HTML 里引用的 JS / CSS,替换成内联内容。 */
async function inline(html) {
  const scriptMatch = html.match(
    /<script\s+type="module"\s+crossorigin\s+src="([^"]+)"><\/script>/,
  );
  const styleMatch = html.match(
    /<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]+)">/,
  );

  if (!scriptMatch || !styleMatch) {
    throw new Error("构建产物里没找到预期的 script / link 标签,Vite 的输出格式变了");
  }

  const scriptPath = join(distDir, scriptMatch[1].replace(/^\.\//, ""));
  const stylePath = join(distDir, styleMatch[1].replace(/^\.\//, ""));

  const script = await readFile(scriptPath, "utf8");
  const style = await readFile(stylePath, "utf8");

  let out = html.replace(scriptMatch[0], `<script type="module">\n${script}\n</script>`);
  out = out.replace(styleMatch[0], `<style>\n${style}\n</style>`);
  return out;
}

const indexPath = join(distDir, "index.html");
const html = await readFile(indexPath, "utf8");
const single = await inline(html);

// 单独产出一份「双击就能看」的文件,原来的 index.html 也覆盖成单文件版本,
// 这样 dist/ 整个目录拷走也能用
await writeFile(indexPath, single, "utf8");
await writeFile(join(distDir, "SelaDB-UI-Preview.html"), single, "utf8");

console.log("已生成单文件版本:dist/SelaDB-UI-Preview.html");
