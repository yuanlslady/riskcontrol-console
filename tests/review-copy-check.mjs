import assert from "node:assert/strict";
import { REVIEW_ACTION_LABELS, REVIEW_FIELD_PLACEHOLDERS } from "../src/lib/presentation.js";

assert.equal(REVIEW_ACTION_LABELS.block, "阻止执行", "block 应映射为中文结论");
assert.equal(REVIEW_ACTION_LABELS.delay, "延后复核", "delay 应映射为中文结论");
assert.ok(REVIEW_FIELD_PLACEHOLDERS.whyNow.includes("为什么"), "whyNow 应提供中文提示词");
assert.ok(REVIEW_FIELD_PLACEHOLDERS.thesisReference.includes("核心依据"), "decision basis 应提供中文提示词");

console.log("review copy check passed");
