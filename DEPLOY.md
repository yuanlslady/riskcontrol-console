# 投资组合控制部署

本项目当前使用：

- `Vite` 作为前端构建工具
- `Supabase Auth + Database` 管理用户数据
- `Supabase Edge Function` 负责代理生成和 OCR 导入

前端不再需要在浏览器环境变量里保存模型 API Key。

## 1. 本地检验

```bash
npm install
npm run dev
npm run build
```

## 2. 前端环境变量

在 `.env.local` 和部署平台上设置：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PUBLIC_DEMO_MODE=false
VITE_AGENT_FUNCTION_NAME=investment-agent
```

可选项：

```env
# 仅在本地或跳过 Supabase Auth 的模式下使用
VITE_PORTFOLIO_CONTROL_USER_ID=demo-user
```

前端不要再暴露以下变量：

```env
VITE_AGENT_API_BASE_URL
VITE_AGENT_API_KEY
VITE_AGENT_MODEL
VITE_OCR_MODEL
```

## 3. Supabase 数据库

在 Supabase SQL 编辑器中运行最新的 schema：

```text
app/supabase/schema.sql
```

该 schema 会创建：

- `user_config`
- `positions`
- `thesis_snapshots`
- `watchlist`
- `reviews`
- `trade_review_records`
- `behavior_profiles`
- `events`
- `automation_runs`

同时开启 RLS 并使用仅限 owner 的策略。

## 4. Supabase 认证

在 Supabase 控制台：

1. `Authentication -> Sign In / Providers -> Email`
2. 启用 Email 提供者
3. 允许注册
4. 打开邮箱确认（Confirm email）

然后设置重定向 URL：

1. `Authentication -> URL Configuration`
2. 填写 `Site URL`
3. 填写 `Redirect URLs`

示例：

```text
Site URL:
http://localhost:5173

Redirect URLs:
http://localhost:5173/**
https://your-app-domain.com/**
https://your-demo-domain.com/**
```

## 5. Supabase Edge Function

函数路径：

```text
app/supabase/functions/investment-agent/index.ts
```

在 Supabase 上为 `investment-agent` 设定 secrets：

```text
AGENT_API_BASE_URL
AGENT_API_KEY
AGENT_MODEL
OCR_MODEL
```

使用 Supabase CLI 部署：

```powershell
supabase secrets set AGENT_API_BASE_URL=...
supabase secrets set AGENT_API_KEY=...
supabase secrets set AGENT_MODEL=...
supabase secrets set OCR_MODEL=...
supabase functions deploy investment-agent
```

## 6. 公开演示与真实测试

建议部署两个站点：

### 演示站

环境变量设置：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AGENT_FUNCTION_NAME=investment-agent
VITE_PUBLIC_DEMO_MODE=true
```

行为：

- 自动加载演示数据
- 不会写入真实用户云端数据
- 适合收集朋友反馈

### 真实测试站

环境变量设置：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AGENT_FUNCTION_NAME=investment-agent
VITE_PUBLIC_DEMO_MODE=false
```

行为：

- 用户可以注册 / 登录
- 仅显示个人数据
- 数据同步到 Supabase

## 7. 托管

当前配置支持静态部署：

- `vercel.json`
- `netlify.toml`

推荐部署目标：

- `riskcontrol-demo`
- `riskcontrol-app`

## 8. 部署后的快速验证

### 演示站

1. 打开页面
2. 确认 Data Source / 数据源 显示 `Demo`
3. 确认存在示例持仓和复盘数据
4. 点击 `Reset Demo Data / 重置演示数据`

### 真实站

1. 打开页面
2. 使用邮箱/密码注册
3. 如有要求，完成邮箱确认
4. 登录
5. 确认 Data Source / 数据源 从 `Local (Signed-out)` 变为 `Supabase`
6. 新建一个关注清单项目或持仓
7. 刷新页面确认数据仍在
8. 生成一份 pre-trade memo 并确认 Agent Mode / Agent 模式 显示 `Edge Function`
