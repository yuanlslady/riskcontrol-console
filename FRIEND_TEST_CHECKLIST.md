# 发朋友前最后检查清单（2026-03-28 更新）

在把应用链接发给朋友之前，按顺序完成这份清单。目标不是“功能大致能跑”，而是确保朋友第一次打开时不会立刻卡住。

## 推荐分享方式

请准备两条链接：

1. Demo 站：`https://riskcontrol-demo.vercel.app`
2. 真实测试站：`https://riskcontrol-app.vercel.app`

建议先发 Demo 站，让朋友先理解流程；只有愿意继续深测的人，再发真实测试站。

## 一、上线前配置核对

全部满足后再进入功能测试：

- [ ] `app/supabase/schema.sql` 已在 Supabase 执行
- [ ] Email 登录已开启，允许注册
- [ ] Password reset / 重置密码 已开启
- [ ] `Site URL` 和 `Redirect URLs` 已配置正确
- [ ] RLS 已启用，且为 owner-only 策略
- [ ] `investment-agent` 已成功部署
- [ ] Edge Function secrets 已写入：`AGENT_API_BASE_URL`、`AGENT_API_KEY`、`AGENT_MODEL`、`OCR_MODEL`
- [ ] `riskcontrol-demo` 和 `riskcontrol-app` 都已写入 Vercel 环境变量：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_AGENT_FUNCTION_NAME`
- [ ] Demo 站额外配置：`VITE_PUBLIC_DEMO_MODE=true`、`VITE_PORTFOLIO_CONTROL_USER_ID=demo-user`
- [ ] 真实测试站额外配置：`VITE_PUBLIC_DEMO_MODE=false`
- [ ] 前端环境变量里没有旧字段：`VITE_AGENT_API_KEY`、`VITE_AGENT_API_BASE_URL`、`VITE_AGENT_MODEL`、`VITE_OCR_MODEL`

## 二、Demo 站最后检查

预期环境变量：

```env
VITE_PUBLIC_DEMO_MODE=true
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_AGENT_FUNCTION_NAME=investment-agent
```

发出前至少自己走一遍：

- [ ] 链接能正常打开，不白屏，不一直 loading
- [ ] 页面进入后直接有示例数据
- [ ] 左侧 `Data Source / 数据源` 显示 `Demo`
- [ ] 左侧 `Cloud Account / 云端账户` 显示 `Demo Mode / 演示模式`，而不是登录表单
- [ ] 可以切换页面标签
- [ ] `Reset Demo Data / 重置演示数据` 可用
- [ ] Demo 操作不会污染真实用户数据

## 三、真实测试站最后检查

预期环境变量：

```env
VITE_PUBLIC_DEMO_MODE=false
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_AGENT_FUNCTION_NAME=investment-agent
```

请用一个全新邮箱完整跑一遍：

- [ ] 页面能正常打开，不白屏，不一直 loading
- [ ] 可以 `Sign Up / 注册`
- [ ] 能收到邮箱确认邮件
- [ ] 邮箱确认后可以 `Sign In / 登录`
- [ ] `Forgot Password / 找回密码` 可发送重置邮件
- [ ] 登录后左侧显示邮箱
- [ ] `Data Source / 数据源` 从 `Local (Signed-out)` 变为 `Supabase`
- [ ] 刷新页面后仍保持登录态

## 四、核心功能冒烟测试

这部分通过后，才建议发给朋友。

- [ ] 新增一条观察池记录并保存成功
- [ ] 新增一条持仓并保存成功
- [ ] `持仓概览`、`宏观框架`、`产业地图`、`交易审查`、`复盘归因` 标签切换正常
- [ ] 刷新页面后数据仍在
- [ ] 生成一次 `Pre-trade Memo / 投前纪要`
- [ ] 生成一次 `Post-trade Memo / 投后复盘纪要`
- [ ] 上传一张券商截图并点击 `Analyze Screenshot / 识别截图`
- [ ] OCR 成功返回草稿，或至少返回可理解的错误信息，而不是 `Invalid JWT`
- [ ] 登出后再次登录，OCR 仍可正常使用

## 五、发朋友时建议附带的话术

可以直接照这个意思发：

1. 这是 Demo 链接，你可以先快速看一遍完整流程和页面结构。
2. 如果你愿意认真测，我再发你真实测试版链接，可以注册、登录并保存自己的数据。
3. 真实测试站支持 `找回密码`，如果登录链路有问题也请直接告诉我。
4. 如果哪里卡住，请直接截屏，并告诉我是在哪个页面、哪一步卡住。
5. 如果哪一句话别扭、哪一步不清楚、哪一块不想用，都请直接说。

## 六、希望朋友重点反馈什么

优先收这 5 类反馈：

- 30 秒第一印象是什么
- 页面结构和流程是否清晰，尤其是 `控制台说明 -> 持仓概览 -> 交易审查`
- 投前纪要、投后纪要的语言是否像投资产品，而不是像工具说明
- 注册登录、找回密码、持仓录入、OCR 导入分别卡不卡
- 这个工具有没有让他更愿意按纪律做判断

## 七、发出前最后一条判断

如果下面任意一条还没通过，就先不要发真实测试站：

- 登录链路还不稳定
- 找回密码链路不可用
- 刷新后数据会丢
- OCR 仍随机报错
- 页面偶发白屏
- 你自己还说不清楚应该让朋友先点哪里
