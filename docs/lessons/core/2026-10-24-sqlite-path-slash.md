# SQLite 路径的前导斜杠

第一轮实现 `seladb-core` + `seladb-cli` 时踩到的。

## edits

| 组件 | 改了什么 | 观察到的差异 | 判定 |
|---|---|---|---|
| `core/conn_url.rs` | SQLite 分支不再 `strip_prefix('/')` | 绝对路径的库能连上了 | helped |
| `core/conn_url.rs`（单测） | 断言从 `tmp/a b/c.db` 改成 `/tmp/a b/c.db` | 单测与真行为一致了 | helped |
| `scripts/acceptance.sh` | 断言改成用 python 按值取 JSON | 验收不再误报 | helped |

## lesson

- **cue**:用户在连接串里给的是绝对路径(带前导斜杠),而解析器把它当相对路径处理了
- **lesson**:
  解析带 `scheme://` 前缀的路径型连接串时,**不要剥前导斜杠** ——
  `scheme:///a/b` 里第三个斜杠是路径自己的首斜杠,剥掉它就把绝对路径
  变成相对路径。要区分相对还是绝对,看 `rest` 开头有没有斜杠,而不是
  主动去 `strip_prefix` 一个。
- **evidence**:上面三行 edits
- **confidence**:high —— 验收脚本用真绝对路径立刻复现,改完立刻通过

## 附带的一条

写这一轮的时候还发现:**单元测试把我当时的错误理解固化了**。
我先写了断言「`sqlite:///tmp/x.db` → 路径 `tmp/x.db`」,测试是绿的,
但那个行为本身就是错的。真正的验收脚本拿真绝对路径去连,立刻炸了。

→ 详见 [../../process/2026-10-24-unit-test-freezes-bug.md](../../process/2026-10-24-unit-test-freezes-bug.md)
