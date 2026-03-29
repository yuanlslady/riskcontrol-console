import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const constantsSource = fs.readFileSync(new URL("../src/lib/constants.js", import.meta.url), "utf8");
const configRepoSource = fs.readFileSync(new URL("../src/lib/repositories/user-config-repo.js", import.meta.url), "utf8");
const schemaSource = fs.readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const positionsRepoSource = fs.readFileSync(new URL("../src/lib/repositories/positions-repo.js", import.meta.url), "utf8");
const topdownSource = fs.readFileSync(new URL("../src/lib/topdown-review.js", import.meta.url), "utf8");

assert.ok(appSource.includes("Macro Framework / 宏观框架"), "导航中应新增宏观框架页面");
assert.ok(appSource.includes("Industry Map / 产业地图"), "导航中应新增产业地图页面");
assert.ok(appSource.includes("Save Macro Framework / 保存宏观框架"), "宏观框架页应提供保存入口");
assert.ok(appSource.includes("Save Industry Map / 保存产业地图"), "产业地图页应提供保存入口");
assert.ok(appSource.includes("Top-Down Check / 上层一致性检查"), "交易审查中应展示上层一致性检查");
assert.ok(appSource.includes("Decision Snapshot / 决策快照"), "复盘页应展示决策快照");
assert.ok(constantsSource.includes("macroFramework"), "默认 state 应包含 macroFramework");
assert.ok(constantsSource.includes("industryViews"), "默认 state 应包含 industryViews");
assert.ok(configRepoSource.includes("macro_framework"), "user_config 映射应写入 macro_framework");
assert.ok(configRepoSource.includes("industry_views"), "user_config 映射应写入 industry_views");
assert.ok(positionsRepoSource.includes("industry_view_id"), "positions repo 应写入 industry_view_id");
assert.ok(topdownSource.includes("evaluateTopdownReview"), "应新增 top-down 一致性判断逻辑");
assert.ok(schemaSource.includes("macro_framework jsonb"), "schema 应新增 macro_framework 字段");
assert.ok(schemaSource.includes("industry_views jsonb"), "schema 应新增 industry_views 字段");
assert.ok(schemaSource.includes("industry_view_id text"), "schema 应新增 positions.industry_view_id 字段");

console.log("topdown pages check passed");
