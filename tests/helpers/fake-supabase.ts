// Minimal in-memory stand-in for the pieces of the supabase-js query builder
// that app/api/punch/route.ts actually calls. Not a general-purpose fake --
// just enough surface (from/select/eq/in/is/or/single/insert/update, and
// thenable results) to drive the route's server-side tests without a real
// database, including reproducing the partial-unique-index race on inserts.

type Row = Record<string, unknown>;
type QueryResult = { data: unknown; error: { code?: string; message: string } | null };

export class FakeTable {
  rows: Row[] = [];
  private seq = 1;
  nextId() {
    return `row_${this.seq++}`;
  }
}

export class FakeDB {
  tables: Record<string, FakeTable> = {
    settings: new FakeTable(),
    staff: new FakeTable(),
    shifts: new FakeTable(),
    sessions: new FakeTable(),
  };
}

type Filter = (row: Row) => boolean;

class FakeQuery implements PromiseLike<QueryResult> {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;
  private wantsSingle = false;

  constructor(
    private table: FakeTable,
    private tableName: string
  ) {}

  select() {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: null) {
    this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
    return this;
  }
  or(expr: string) {
    const clauses = expr.split(",").map((c) => c.split("."));
    this.filters.push((row) =>
      clauses.some(([col, op, val]) => {
        if (op === "is" && val === "null") return row[col] == null;
        if (op === "gte") return (row[col] as string) >= val;
        return false;
      })
    );
    return this;
  }
  insert(payload: Row) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  single() {
    this.wantsSingle = true;
    return this;
  }

  private run(): QueryResult {
    if (this.mode === "insert" && this.payload) {
      const payload = this.payload;
      if (this.tableName === "sessions" && payload.out_at == null) {
        const conflict = this.table.rows.some((r) => r.staff_id === payload.staff_id && r.out_at == null);
        if (conflict) return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      const row: Row = {
        id: this.table.nextId(),
        created_at: new Date().toISOString(),
        out_at: null,
        out_flag: null,
        shift_id: null,
        ...payload,
      };
      this.table.rows.push(row);
      return { data: [row], error: null };
    }
    if (this.mode === "update" && this.payload) {
      const matches = this.table.rows.filter((r) => this.filters.every((f) => f(r)));
      matches.forEach((r) => Object.assign(r, this.payload));
      return { data: matches.map((r) => ({ id: r.id })), error: null };
    }
    const rows = this.table.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.wantsSingle) {
      if (rows.length !== 1) return { data: null, error: { message: "row count mismatch" } };
      return { data: rows[0], error: null };
    }
    return { data: rows, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    // A real network round-trip -- scheduled as a macrotask rather than
    // resolved immediately -- so that two concurrent callers' queries
    // actually interleave instead of one finishing (including its write)
    // before the other starts. That's what makes the sessions_one_open
    // race reproducible in these tests.
    return new Promise<QueryResult>((resolve) => {
      setTimeout(() => resolve(this.run()), 0);
    }).then(onfulfilled, onrejected);
  }
}

export function fakeAdminClient(db: FakeDB) {
  return {
    from(tableName: string) {
      const table = db.tables[tableName];
      if (!table) throw new Error(`unknown fake table: ${tableName}`);
      return new FakeQuery(table, tableName);
    },
  };
}
