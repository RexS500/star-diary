# 星星日記 Star Diary

星星日記是部署在 Cloudflare Workers 的 Next.js／Vinext PWA，使用 D1 保存家庭資料、R2 保存家庭圖片。

## 開發

需求：Node.js `>=22.13.0`、pnpm `11.9.0`。

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run db:auth:migrate:local
pnpm run dev
```

Google 登入的本機環境變數請由 [.dev.vars.example](./.dev.vars.example) 複製到不會提交的 `.dev.vars`。

## 驗證

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

## Google 登入與正式遷移

完整的 Google Cloud、Cloudflare Secrets、D1 備份／遷移／還原、舊資料接管與驗收步驟，請見 [Google 登入與家庭隔離操作手冊](./docs/google-auth-family-isolation.md)。

正式環境必須先備份 D1、套用遷移並設定 Secrets，才可部署新版程式。不要把任何 Secret 寫入 Git。
