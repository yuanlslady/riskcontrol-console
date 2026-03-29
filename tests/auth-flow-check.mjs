import assert from "node:assert/strict";
import fs from "node:fs";

const supabaseSource = fs.readFileSync(new URL("../src/lib/supabase.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

assert.ok(supabaseSource.includes("signInWithPassword"), "supabase auth layer 应支持密码登录");
assert.ok(supabaseSource.includes("signUpWithPassword"), "supabase auth layer 应支持密码注册");
assert.ok(!supabaseSource.includes("signInWithEmailLink"), "不应继续保留 magic link 登录入口");
assert.ok(appSource.includes("Sign In / 登录"), "界面应展示密码登录按钮");
assert.ok(appSource.includes("Sign Up / 注册"), "界面应展示注册按钮");
assert.ok(appSource.includes("type=\"password\""), "界面应包含密码输入框");

console.log("auth flow check passed");
