# Google 登入與家庭資料隔離操作手冊

本次改版採用 Auth.js v5、Google OAuth、Cloudflare D1 database session。所有家庭資料與 R2 圖片都由伺服器根據 Session 決定家庭範圍；瀏覽器不傳入、也不能自行指定 `family_id`。

> 本次開發只建立與測試本機遷移檔，沒有對正式 D1 執行遷移，也沒有部署正式 Worker。

## 1. 資料與權限架構

- `users`、`accounts`、`sessions`、`verification_tokens`：Auth.js 官方 D1 Adapter 使用的表。
- `families`：家庭主檔；`legacy_state = 1` 表示上線前既有家庭。
- `family_members`：使用者與家庭的關聯，角色為 `owner`、`parent`、`viewer`。
- `family_state`：沿用成熟的 Star Diary JSON 資料模型，但改成每個 `family_id` 一列。
- `media_objects`：記錄新 R2 物件的家庭、種類與建立者。
- `app_migrations`：記錄已套用的遷移版本。
- `app_state`：舊表完整保留，只複製、不搬移、不刪除，供回復舊版 Worker 使用。

權限規則：

- `owner`、`parent`：可讀寫家庭資料與圖片。
- `viewer`：只可讀取；寫入 API 會回傳 403。
- 未登入：首頁顯示 Google 登入；私人 API 回傳 401。
- 查不到或不屬於目前家庭的圖片：一律回傳 404，避免透露資源是否存在。

目前產品仍是一位使用者預設進入一個家庭；資料表已支援未來邀請與多家庭，但這一版未加入邀請 UI 或家庭切換器。

## 2. 必要環境變數

| 名稱 | 用途 | 是否為 Secret |
|---|---|---|
| `AUTH_SECRET` | Auth.js Cookie／Token 加密與簽章金鑰 | 是 |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID | 是 |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret | 是 |
| `INITIAL_OWNER_EMAIL` | 首位可接管既有正式家庭資料的 Google Email | 是 |

本機請複製 `.dev.vars.example` 為 `.dev.vars`，再填入值。`.dev.vars` 已被 `.gitignore` 排除。

PowerShell 可產生 `AUTH_SECRET`：

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

`INITIAL_OWNER_EMAIL` 必須與 Google 登入後的 Email 完全相同；程式會先移除前後空白並忽略英文大小寫。不要填孩子 Email，也不要將它提交到 GitHub。

## 3. Google Cloud Console 設定

1. 到 Google Cloud Console 建立或選擇專案。
2. 在「Google Auth Platform」設定 OAuth 同意畫面：App 名稱使用「星星日記」，加入支援 Email；Scopes 只需基本 `openid`、`email`、`profile`。
3. 若 App 還在 Testing，將實際測試登入的 Google 帳號加入 Test users；正式對外使用前再依 Google 規則發布。
4. 到「Clients／Credentials」建立 OAuth Client，類型選 Web application。
5. Authorized JavaScript origins 加入：
   - `http://localhost:3000`
   - 正式網站 Origin，例如 `https://star-diary.example.com`
6. Authorized redirect URIs 加入：
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<正式網站完整網域>/api/auth/callback/google`
7. 將 Client ID、Client Secret 分別放入 `AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`。

Redirect URI 必須逐字相同，包含 `https`、子網域與路徑；若仍使用 `workers.dev` 網址，就必須填該完整網址。未來換自訂網域時，要把新 callback URI 一併加入 Google Console。

## 4. 本機遷移與測試

先準備 `.dev.vars`，再執行：

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm run db:auth:migrate:local
pnpm run verify
pnpm run dev
```

`0002_auth_and_family_scope.sql` 可重複執行。它會建立新表，並以 `INSERT OR IGNORE ... SELECT` 將舊 `app_state.id = 'family'` 複製到 `legacy-family-v1`；不會刪除舊列。

本機檢查表與複製結果：

```powershell
pnpm exec wrangler d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
pnpm exec wrangler d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --command "SELECT family_id, updated_at FROM family_state"
```

## 5. 正式 D1：備份優先

以下步驟是正式上線手冊，本次開發沒有執行。

1. 先完成一次可還原的正式備份，輸出到 Repository 之外的安全資料夾：

```powershell
pnpm run build
pnpm exec wrangler d1 export DB --remote --config dist/server/wrangler.json --output "C:\secure-backups\star-diary-before-google-auth.sql"
```

2. 確認備份檔不是 0 bytes，並保留當下正式 Worker 的版本／Commit 編號。
3. 在正式 D1 先只做唯讀盤點：

```powershell
pnpm exec wrangler d1 execute DB --remote --config dist/server/wrangler.json --command "SELECT id, updated_at, length(data) AS bytes FROM app_state"
```

4. 執行正式遷移：

```powershell
pnpm exec wrangler d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0002_auth_and_family_scope.sql
```

5. 驗證舊列仍在，且複製後筆數與內容長度合理：

```powershell
pnpm exec wrangler d1 execute DB --remote --config dist/server/wrangler.json --command "SELECT id, updated_at, length(data) AS bytes FROM app_state"
pnpm exec wrangler d1 execute DB --remote --config dist/server/wrangler.json --command "SELECT family_id, updated_at, length(data) AS bytes FROM family_state"
pnpm exec wrangler d1 execute DB --remote --config dist/server/wrangler.json --command "SELECT version, applied_at FROM app_migrations"
```

遷移檔只新增資料結構並複製舊 JSON，沒有 `DROP`、`DELETE` 或覆寫舊 `app_state`。

## 6. Cloudflare Secrets

可在 Cloudflare Dashboard 的 Worker Settings → Variables and Secrets 設定，四項都選 Secret。也可使用 CLI，逐項輸入值：

```powershell
pnpm exec wrangler secret put AUTH_SECRET --config dist/server/wrangler.json
pnpm exec wrangler secret put AUTH_GOOGLE_ID --config dist/server/wrangler.json
pnpm exec wrangler secret put AUTH_GOOGLE_SECRET --config dist/server/wrangler.json
pnpm exec wrangler secret put INITIAL_OWNER_EMAIL --config dist/server/wrangler.json
```

不要把值寫進 `wrangler.json`、`.openai/hosting.json`、GitHub Actions log 或 Commit。Cloudflare Git 自動部署若使用 Dashboard 變數，也要確認 Production environment 四項都存在。

## 7. 舊家庭資料接管

1. 正式遷移前先設定 `INITIAL_OWNER_EMAIL`。
2. 使用該 Email 的 Google 帳號第一次登入。
3. 伺服器以條件式更新認領 `legacy-family-v1`，建立 `owner` membership。
4. 後續其他新帳號第一次登入會建立自己的空家庭，不會看到既有孩子、紀錄、獎品或圖片。
5. 既有家庭一旦被認領，其他帳號即使之後被誤設成 `INITIAL_OWNER_EMAIL` 也不能搶走；衝突會回傳 403。

上線前務必再次確認 `INITIAL_OWNER_EMAIL`，因為第一次正式登入就是資料所有權認領動作。

## 8. 正式部署順序

建議固定順序：

1. Google Console 先加入正式 callback URI。
2. 正式 D1 備份。
3. 正式 D1 執行 `0002` 並查詢驗證。
4. 設定四個 Cloudflare Secrets。
5. `pnpm run verify` 全數通過。
6. 部署新版 Worker，或將已驗證 Commit 推到 Cloudflare 連接的正式分支。
7. 以無痕視窗驗證未登入、owner、第二個全新帳號與登出流程。

若使用手動 Wrangler 部署，命令為：

```powershell
pnpm run build
pnpm exec wrangler deploy --config dist/server/wrangler.json
```

## 9. 回復與還原

這是加法式遷移，最安全的回復方式是：

1. 立刻停止新版寫入或回退到前一個成功 Worker 版本。
2. 舊 Worker 仍讀取完整保留的 `app_state`，通常不需要回灌資料庫。
3. 保留故障後的第二份 D1 export，供比較與救援，不要直接覆蓋唯一備份。
4. 若確實要從 SQL 備份還原，先建立新的空 D1、匯入備份、驗證後再修改 binding；不要在仍有新資料的正式 D1 上直接重播整份 SQL，以免主鍵衝突或覆蓋後續寫入。

不要在沒有第二份備份、沒有停寫、沒有驗證目標 database_id 的情況下執行刪表或覆寫。

## 10. PWA／Session 安全

- Service Worker cache 名稱已更新為 `star-diary-pwa-v3-auth`，啟用時會清除所有舊 `star-diary*` cache。
- `/api/auth/*`、`/api/state`、`/api/media` 一律 `no-store` 並只走網路，離線時不顯示上一位使用者的家庭資料。
- 頁面導覽也使用 network/no-store；離線只顯示不含家庭資料的 `offline.html`。
- 登出時會先清除 React 記憶體中的家庭 state，再交給 Auth.js 移除 Session。
- Google OAuth 在 iPhone PWA 可能切到 Safari 完成授權，回到同一正式網域後 Session 仍由伺服器 Cookie 驗證。

這次不需要因資料結構修改而刪除 iPhone 主畫面 App；若裝置仍長時間載入舊 Service Worker，可先關閉所有星星日記視窗再重開。只有確認 SW 多次未更新時，才刪除主畫面圖示、清除該網站資料後重新加入。

## 11. 必測清單

- 未登入開啟 `/`：只看到 Google 登入，不出現家庭資料。
- 未登入呼叫 `/api/state`、`/api/media`：401。
- owner 登入：看到既有家庭完整資料，新增／修改／刪除正常。
- 第二個全新 Google 帳號：只看到建立第一位孩子的空家庭畫面。
- A 帳號無法以 URL、Request body 或媒體 key 讀取 B 家庭資料。
- `viewer` 可讀但不可 POST state、上傳或刪除圖片。
- 登出後使用瀏覽器返回、離線、重開 PWA：不出現前一帳號的私人畫面。
- 同一帳號跨瀏覽器／裝置登入：由 D1 session 正常取得同一家庭。
- Google 頭像只顯示在帳號區，不覆蓋孩子頭像。
- 舊家庭圖片可讀；新上傳圖片 key 以 `families/<family_id>/...` 開頭。
- `pnpm run lint`、`pnpm run typecheck`、`pnpm run test`、`pnpm run build` 全數通過。

## 12. 已知限制與下一步

- 目前未實作家長邀請、角色管理 UI、家庭切換器與刪除帳號流程；表結構與伺服器角色檢查已預留。
- 目前家庭業務資料仍是一列 JSON，適合保守接入成熟 App；未來資料量大幅增加時，才分階段拆成逐表 `family_id` 模型。
- Google Client Secret 與 `AUTH_SECRET` 需建立定期輪替與緊急撤銷流程；輪替 `AUTH_SECRET` 會讓既有 Session 失效，需要重新登入。
- 正式上線後應觀察 Auth callback 失敗、401／403 數量、D1 latency 與 R2 404；日誌不得記錄 OAuth token、Session token 或完整家庭 JSON。
