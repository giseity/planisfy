import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { canceledTilesetStatusExpression } from "./job-lifecycle";

test("canceled tileset status keeps PostgreSQL enum typing", () => {
  const query = new PgDialect().sqlToQuery(canceledTilesetStatusExpression());

  assert.match(query.sql, /'DRAFT'::tileset_status/);
  assert.match(query.sql, /'READY'::tileset_status/);
});
