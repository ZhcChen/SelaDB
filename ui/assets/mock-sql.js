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
function splitStatements(sql) {
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
function findTableRefs(statement) {
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
function statementKind(statement) {
  const head = statement.replace(/--[^\n]*/g, "").trimStart().toLowerCase();
  for (const [keyword, kind] of STATEMENT_KINDS) {
    if (head.startsWith(keyword)) return kind;
  }
  return "message";
}

/**
 * 取 SELECT 列表里的投影。
 *
 * 结果集的列必须跟 SQL 写的一致。上面写着 GROUP BY,下面却摊开一张明细表,
 * 看着就不专业 —— 而且设计源要是这么画,后面 Rust 实现也会照着错。
 *
 * @returns {Array<{ expr: string, name: string }>}
 */
function parseProjections(statement) {
  const match = statement.match(/\bselect\s+([\s\S]*?)\bfrom\b/i);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const alias = part.match(/\bas\s+["`]?([\w]+)["`]?$/i);
      if (alias) {
        return {
          expr: part.replace(/\s+as\s+["`]?[\w]+["`]?$/i, "").trim(),
          name: alias[1],
        };
      }
      return { expr: part, name: part.split(".").pop().replace(/["`]/g, "") };
    });
}

/** 聚合函数的合成值。 */
function syntheticValue(expr, index) {
  const text = String(expr ?? "").toLowerCase();
  if (text.startsWith("count")) return 3 + (index % 5);
  if (text.startsWith("sum") || text.startsWith("avg") || text.startsWith("total")) {
    return 120.5 + index * 7.25;
  }
  return null;
}

/**
 * 执行一段 SQL(mock)。
 *
 * @param {string} sql
 * @param {object} options `{ tables: Map<string, {columns, rows, total}> }`
 * @returns {{ ok: boolean, statements: Array, results: Array, error: object|null, elapsedMs: number }}
 */
function executeQuery(sql, { tables }) {
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
      const projections = parseProjections(statement.text);

      if (projections.length === 0) {
        return { kind: "rows", columns: table.columns, rows: table.rows, total: table.total };
      }

      // 按 SELECT 列表投影:命中的列取原值,聚合列合成一个数
      const columns = projections.map((projection) => {
        const source = table.columns.find(
          (column) => column.name === projection.name || column.key === projection.name,
        );
        if (source) return { ...source, name: projection.name, key: projection.name };
        return {
          key: projection.name,
          name: projection.name,
          type: /count|sum|avg|total/i.test(projection.expr) ? "integer" : "text",
        };
      });

      const rows = table.rows.map((row, index) => {
        const projected = {};
        for (const projection of projections) {
          const source = table.columns.find(
            (column) => column.name === projection.name || column.key === projection.name,
          );
          projected[projection.name] = source
            ? row[source.key]
            : syntheticValue(projection.expr, index);
        }
        return projected;
      });

      return { kind: "rows", columns, rows, total: rows.length };
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
