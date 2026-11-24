/** Real SQLite execution for analytics contract tests; no production binding is used. */
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
} from "@cloudflare/workers-types";
export function analyticsDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(
    readFileSync(
      new URL("../analytics/migrations/0001_analytics.sql", import.meta.url),
      "utf8"
    )
  );
  sqlite.exec(
    readFileSync(
      new URL(
        "../analytics/migrations/0002_collection_start.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  sqlite.exec(
    readFileSync(
      new URL(
        "../analytics/migrations/0003_native_reports.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  class Statement implements D1PreparedStatement {
    constructor(
      private sql: string,
      private values: SQLInputValue[] = []
    ) {}
    bind(...values: unknown[]) {
      return new Statement(this.sql, values as SQLInputValue[]);
    }
    async first<T>(column?: string): Promise<T | null> {
      const rows = await this.all<Record<string, unknown>>();
      return (
        column ? (rows.results[0]?.[column] ?? null) : (rows.results[0] ?? null)
      ) as T | null;
    }
    async all<T>(): Promise<D1Result<T>> {
      const prepared = sqlite.prepare(this.sql);
      const reads = prepared.columns().length > 0;
      const results = reads ? (prepared.all(...this.values) as T[]) : [];
      const changes = reads ? 0 : Number(prepared.run(...this.values).changes);
      return {
        success: true,
        results,
        meta: {
          changes,
          duration: 0,
          last_row_id: 0,
          changed_db: changes > 0,
          size_after: 0,
          rows_read: results.length,
          rows_written: changes,
        },
      };
    }
    run<T>() {
      return this.all<T>();
    }
    raw<T>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
    raw<T>(options?: { columnNames?: false }): Promise<T[]>;
    async raw<T>(options?: {
      columnNames?: boolean;
    }): Promise<T[] | [string[], ...T[]]> {
      const rows = (await this.all<Record<string, unknown>>()).results;
      const values = rows.map(row => Object.values(row)) as T[];
      return options?.columnNames
        ? [Object.keys(rows[0] ?? {}), ...values]
        : values;
    }
  }
  const db: D1Database = {
    prepare: sql => new Statement(sql),
    async batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec("BEGIN");
      try {
        const rows = [];
        for (const statement of statements) rows.push(await statement.all<T>());
        sqlite.exec("COMMIT");
        return rows;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    withSession() {
      throw new Error("Not used by analytics contracts");
    },
    async dump() {
      throw new Error("Not used by analytics contracts");
    },
  };
  return { db, sqlite };
}
