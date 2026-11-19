// Transactions over the shared `Sql` surface (QA review Q2, 19 Nov 2026).
//
// Driver note: production talks to Neon through node-postgres (`pg`) with a `Pool` (see db.ts), which
// supports real interactive transactions on one checked-out client. Neon's HTTP `neon()` driver would
// not: each call is its own HTTP request, so BEGIN/COMMIT can't span statements (only its batch
// `transaction([...])` of pre-built queries, which can't branch on results). PGlite supports them natively.
// Pure module with relative imports so node tests can use it.
import type { Sql } from "./db.ts";

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

/** The `Sql` tag + `.query()` over one runner (same placeholder rebuild as db.ts). */
function tagged(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) => run<T>(text, params);
  return sql;
}

/**
 * A `Sql` bound to one open transaction. Its own `.transaction()` nests with a SAVEPOINT, so a step that
 * is allowed to fail (and is caught) rolls back only itself instead of aborting the whole transaction.
 */
export function txSql(run: Run): Sql {
  const sql = tagged(run);
  let n = 0;
  sql.inTransaction = true;
  sql.transaction = async <T>(fn: (tx: Sql) => Promise<T>): Promise<T> => {
    const sp = `sp_${++n}`;
    await run(`savepoint ${sp}`, []);
    try {
      const out = await fn(sql);
      await run(`release savepoint ${sp}`, []);
      return out;
    } catch (err) {
      await run(`rollback to savepoint ${sp}`, []);
      throw err;
    }
  };
  return sql;
}

/** Run `fn` in ONE transaction: every statement commits together or none do. Requires a transaction-capable client. */
export async function withTransaction<T>(sql: Sql, fn: (tx: Sql) => Promise<T>): Promise<T> {
  if (typeof sql.transaction !== "function") throw new Error("This database client can't run transactions.");
  return sql.transaction(fn);
}

/** Best-effort step: inside a transaction it gets a savepoint (so a caught failure is harmless); outside, it just runs. */
export async function withSavepoint<T>(sql: Sql, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return sql.inTransaction && typeof sql.transaction === "function" ? sql.transaction(fn) : fn(sql);
}
