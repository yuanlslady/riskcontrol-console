import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

assert.ok(schema.includes('create policy "positions_owner_only"'), "positions 应使用 owner-only policy");
assert.ok(schema.includes('create policy "user_config_owner_only"'), "user_config 应使用 owner-only policy");
assert.ok(schema.includes("auth.uid()::text = user_id"), "RLS 应按 auth.uid 与 user_id 对齐");
assert.ok(!schema.includes("using (true) with check (true)"), "schema 不应继续保留全开放 RLS policy");

console.log("schema security check passed");
