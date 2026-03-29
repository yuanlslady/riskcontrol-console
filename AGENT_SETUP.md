# 代理设置

应用现在通过 Supabase Edge Function 调用模型，不再从浏览器直接接触模型提供者。

## 前端环境变量

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AGENT_FUNCTION_NAME=investment-agent
```

演示模式下可附加：

```env
VITE_PUBLIC_DEMO_MODE=true
```

## 服务端 secrets

在 Supabase 上为 `investment-agent` 函数设置：

```text
AGENT_API_BASE_URL
AGENT_API_KEY
AGENT_MODEL
OCR_MODEL
```

## 函数路径

```text
app/supabase/functions/investment-agent/index.ts
```

## 函数负责的工作

- 生成 pre-trade memo
- 生成 post-trade reflection
- 导入截图 OCR

## 预期前端行为

- `Agent Mode / Agent 模式` 显示 `Edge Function`
- 浏览器中不再存储任何模型 API Key
- 若函数尚未部署或 secrets 缺失，会自动降级回本地 memo 生成
