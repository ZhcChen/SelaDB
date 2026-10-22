/**
 * 假 SQL 执行器。
 *
 * 设计源不连真实数据库,但「错误定位」这条交互必须能演示:点了执行要能
 * 真的报出「relation "xxx" does not exist」并把出错的那段下划线标出来。
 * 所以这里真的去切语句、真的去找 FROM/JOIN 后面的表名、真的比对已知表。
 */

/** SQL 关键字,用于判断语句类型。 */
const STATEMENT_KINDS = [
  ["select", "rows"],
  ["with", "rows"],
  ["insert", "message"],
  ["update", "message"],
  ["delete", "message"],
  ["create", "message"],
  ["alter", "message"],
  ["drop", "message"],
  ["truncate", "message"],
  ["explain", "rows"],
  ["show", "rows"],
  ["describe", "rows"],
  ["set", "message"],
  ["use", "message"],
];

const MOCK_ELAPSED = [8, 12, 23, 5, 31];

/**
 * 按顶层分号切分语句。
 *
 * 分号出现在字符串或注释里不算语句结束 —— `SELECT ';' FROM t` 是一条语句。
 *
 * @param {string} sql
 * @returns {Array<{ text: string, offset: number, line: number }>}
 */
export function splitStatements(sql) {
  const source = sql ?? "";
  const statements = [];
  let start = 0;
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];

    if (ch === "-" && source[i + 1] === "-") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(source, i);
      continue;
    }
    if (ch === ";") {
      statements.push(makeStatement(source, start, i));
      i += 1;
      start = i;
      continue;
    }
    i += 1;
  }
  statements.push(makeStatement(source, start, n));

  return statements.filter((statement) => !isBlank(statement.text));
}

function skipQuoted(source, from) {
  const quote = source[from];
  let i = from + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return source.length;
}

function makeStatement(source, from, to) {
  const text = source.slice(from, to);
  return {
    text,
    offset: from,
    line: countLines(source, from),
  };
}

function countLines(source, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

function isBlank(text) {
  return text.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim() === "";
}

/**
 * 找出语句里引用的表名及其位置。
 *
 * @returns {Array<{ name: string, start: number, end: number }>}
 */
export function findTableRefs(statement) {
  const refs = [];
  const pattern =
    /\b(?:from|join|into|update)\s+("(?:[^"]+)"|`[^`]+`|[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)/gi;
  let match;
  while ((match = pattern.exec(statement)) !== null) {
    let name = match[1];
    let start = match.index + match[0].length - match[1].length;
    if (
      (name.startsWith('"') && name.endsWith('"')) ||
      (name.startsWith("`") && name.endsWith("`"))
    ) {
      name = name.slice(1, -1);
      start += 1;
    }
    refs.push({ name, start, end: start + name.length });
  }
  return refs;
}

/** 判断语句类型。 */
export function statementKind(statement) {
  const head = statement.replace(/--[^\n]*/g, "").trimStart().toLowerCase();
  for (const [keyword, kind] of STATEMENT_KINDS) {
    if (head.startsWith(keyword)) return kind;
  }
  return "message";
}

/**
 * 执行一段 SQL(mock)。
 *
 * @param {string} sql
 * @param {object} options `{ tables: Map<string, {columns, rows, total}> }`
 * @returns {{ ok: boolean, statements: Array, results: Array, error: object|null, elapsedMs: number }}
 */
export function executeQuery(sql, { tables }) {
  const statements = splitStatements(sql);

  if (statements.length === 0) {
    return {
      ok: false,
      statements,
      results: [],
      elapsedMs: 0,
      error: { message: "没有可执行的语句", start: 0, end: 0, line: 1 },
    };
  }

  for (const statement of statements) {
    for (const ref of findTableRefs(statement.text)) {
      if (!tables.has(ref.name)) {
        return {
          ok: false,
          statements,
          results: [],
          elapsedMs: 0,
          error: {
            message: `relation "${ref.name}" does not exist`,
            detail: `第 ${statement.line + countLines(statement.text, ref.start) - 1} 行的对象 "${ref.name}" 不存在`,
            start: statement.offset + ref.start,
            end: statement.offset + ref.end,
            line: statement.line + countLines(statement.text, ref.start) - 1,
          },
        };
      }
    }
  }

  const results = statements.map((statement) => {
    const kind = statementKind(statement.text);
    const refs = findTableRefs(statement.text);

    if (kind === "rows" && refs.length > 0) {
      const table = tables.get(refs[0].name);
      return { kind: "rows", columns: table.columns, rows: table.rows, total: table.total };
    }
    if (kind === "rows") {
      // 没有 FROM 的 SELECT,比如 SELECT 1
      return {
        kind: "rows",
        columns: [{ key: "?column?", name: "?column?", type: "integer" }],
        rows: [{ "?column?": 1 }],
        total: 1,
      };
    }
    return { kind: "message", message: "Query OK" };
  });

  const elapsedMs = MOCK_ELAPSED[statements.length % MOCK_ELAPSED.length];
  return { ok: true, statements, results, error: null, elapsedMs };
}
