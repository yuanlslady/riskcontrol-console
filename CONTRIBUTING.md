# Contributing

感谢你愿意一起把这个项目做得更好。

## 开始之前

- 请勿在任何提交里包含 `.env.local`、API Key、Supabase service role key 等敏感信息。
- 如果你只是想提建议，优先使用 Issue（项目里已提供模板）。

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 提交内容建议

- 一个 PR 尽量只做一件事（一个功能点 / 一个修复）
- 提供截图或录屏（尤其是 UI/流程改动）
- 如果改动涉及 Supabase schema 或函数：请同步更新 `supabase/schema.sql` 或 `supabase/functions/*`

