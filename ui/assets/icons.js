/**
 * 图标系统。
 *
 * 设计源不引入任何图标字体或第三方图标库,全部用内联 SVG 描边图标,
 * 颜色继承 currentColor,这样图标自动跟随 token 的 --fg-* 变化。
 *
 * 统一 16×16 视窗、1.4 描边、圆头圆角,保证和 12–13px 的文字基线对齐。
 */

// 每个图标一条 path 数据。少数图标由多条 path 组成,用数组表示。
const ICON_PATHS = {
  connection: ['M6 2v4', 'M10 2v4', 'M4 6h8v2a4 4 0 0 1-8 0V6Z', 'M8 12v2'],
  database: [
    'M3 4.5C3 3.7 5.1 3 8 3s5 .7 5 1.5S10.9 6 8 6 3 5.3 3 4.5Z',
    'M3 4.5v7C3 12.3 5.1 13 8 13s5-.7 5-1.5v-7',
    'M3 8c0 .8 2.1 1.5 5 1.5s5-.7 5-1.5',
  ],
  schema: ['M8 1.5 14 5v6l-6 3.5L2 11V5l6-3.5Z', 'M2 5l6 3.5L14 5', 'M8 8.5v6'],
  group: ['M2 4.5A1 1 0 0 1 3 3.5h3l1.5 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8Z'],
  table: ['M2.5 3.5h11v9h-11v-9Z', 'M2.5 7.2h11', 'M6.8 7.2v5.3', 'M10.5 7.2v5.3'],
  view: ['M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8Z', 'M10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  collection: [
    'M6 2.5c-1.5 0-2 .8-2 2v1.5c0 1-.4 1.5-1.5 1.5C3.5 7.5 4 8 4 9s-.5 1.5-1.5 1.5C3.5 10.5 4 11 4 12v1.5c0 1.2.5 2 2 2',
    'M10 2.5c1.5 0 2 .8 2 2v1.5c0 1 .4 1.5 1.5 1.5-1.1 0-1.5.5-1.5 1.5s.4 1.5 1.5 1.5c-1.1 0-1.5.5-1.5 1.5v1.5c0 1.2-.5 2-2 2',
  ],
  function: ['M5 13c1.5-1 2-3 2-5s-.5-4-2-5', 'M11 3c-1.5 1-2 3-2 5s.5 4 2 5', 'M4 8h8'],
  procedure: [
    'M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
    'M8 1.6v1.6',
    'M8 12.8v1.6',
    'M1.6 8h1.6',
    'M12.8 8h1.6',
    'M3.5 3.5l1.1 1.1',
    'M11.4 11.4l1.1 1.1',
    'M3.5 12.5l1.1-1.1',
    'M11.4 4.6l1.1-1.1',
  ],
  sequence: ['M3.5 4h9', 'M3.5 8h9', 'M3.5 12h4.5', 'M10 10.5l2 1.5-2 1.5'],
  index: ['M10.5 3a3 3 0 1 0-2.3 4.9L3 13.1V15h2v-1.5h1.5V12h1.5l1.2-1.2A3 3 0 0 0 10.5 3Z', 'M11.2 5.2h.01'],
  trigger: ['M9 1.5 3.5 9h4l-.5 5.5L12.5 7h-4l.5-5.5Z'],
  event: ['M3 4.5h10v9H3v-9Z', 'M3 7.5h10', 'M5.5 2.5v3', 'M10.5 2.5v3'],
  keygroup: ['M10.5 3a3 3 0 1 0-2.3 4.9L3 13.1V15h2v-1.5h1.5V12h1.5l1.2-1.2A3 3 0 0 0 10.5 3Z', 'M11.2 5.2h.01'],

  chevron: ['M6 3.5 10.5 8 6 12.5'],
  search: ['M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'M10.8 10.8 14 14'],
  command: ['M4 4.5 7 8l-3 3.5', 'M8.5 12.5h4'],
  settings: [
    'M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
    'M8 1.6v1.6',
    'M8 12.8v1.6',
    'M1.6 8h1.6',
    'M12.8 8h1.6',
    'M3.5 3.5l1.1 1.1',
    'M11.4 11.4l1.1 1.1',
    'M3.5 12.5l1.1-1.1',
    'M11.4 4.6l1.1-1.1',
  ],
  sun: ['M8 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M8 1v1.5', 'M8 13.5V15', 'M15 8h-1.5', 'M2.5 8H1', 'M12.9 3.1l-1 1', 'M4.1 11.9l-1 1', 'M12.9 12.9l-1-1', 'M4.1 4.1l-1-1'],
  // 显示器:表示「跟随系统」
  monitor: ['M2.5 3.5h11v7h-11v-7Z', 'M6 13.5h4', 'M8 10.5v3'],
  moon: ['M13.5 9.5A5.8 5.8 0 0 1 6.5 2.5 5.8 5.8 0 1 0 13.5 9.5Z'],
  plus: ['M8 3.5v9', 'M3.5 8h9'],
  close: ['M4 4l8 8', 'M12 4l-8 8'],
  refresh: ['M13.5 8A5.5 5.5 0 0 1 3.4 5.4', 'M2.5 8A5.5 5.5 0 0 1 12.6 10.6', 'M12.5 2v3h-3', 'M3.5 14v-3h3'],
  // 回滚:与「刷新」区分开,两个动作不能共用一个图标
  undo: ['M4.5 8a5 5 0 1 0 1.8-3.8', 'M2.5 4v4h4'],
  play: ['M5 3.5 12.5 8 5 12.5v-9Z'],
  download: ['M8 2.5v8', 'M4.5 7.5 8 11l3.5-3.5', 'M2.5 13.5h11'],
  copy: ['M5.5 5.5h8v8h-8v-8Z', 'M3 10.5H2.5V2.5H10.5V3'],
  pencil: ['M11 2.5 13.5 5 6 12.5H3.5V10L11 2.5Z', 'M9.5 4 12 6.5'],
  check: ['M3.5 8.5 6.5 11.5 12.5 4.5'],
  filter: ['M2.5 3.5h11l-4 5v4l-3 1.5v-5.5l-4-5Z'],
  columns: ['M2.5 3.5h11v9h-11v-9Z', 'M6 3.5v9', 'M10 3.5v9'],
  warning: ['M8 2.5 14.5 13.5h-13L8 2.5Z', 'M8 6.5v3.5', 'M8 11.8v.01'],
  error: ['M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13Z', 'M5.8 5.8l4.4 4.4', 'M10.2 5.8l-4.4 4.4'],
  info: ['M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13Z', 'M8 7.5v4', 'M8 5.2v.01'],
  dot: ['M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
};

/**
 * 创建图标元素。
 *
 * @param {string} name ICON_PATHS 里的键
 * @param {number} size 像素边长,默认 16
 * @returns {SVGElement}
 */
function createIcon(name, size = 16) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.4");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");

  const paths = ICON_PATHS[name] ?? ICON_PATHS.dot;
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** 对象类型 kind 对应的图标名。与 mock-data.js 的 UI_COPY.objectKinds 保持一致。 */
const KIND_ICONS = {
  connection: "connection",
  database: "database",
  schema: "schema",
  group: "group",
  table: "table",
  view: "view",
  collection: "collection",
  function: "function",
  procedure: "procedure",
  sequence: "sequence",
  index: "index",
  trigger: "trigger",
  event: "event",
  keygroup: "keygroup",
};

function iconForKind(kind, fallback = "dot") {
  return KIND_ICONS[kind] ?? fallback;
}
