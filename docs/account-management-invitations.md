# 帳號管理與家庭邀請操作手冊

本功能沿用既有 Auth.js Google 登入、D1 `users`／`families`／`family_state` 與同一套星星、任務、兌換資料。官方邀請不建立第二套家庭資料；登入者決定權限，畫面選取的孩子只決定目前顯示的資料。

## 角色與權限

- `owner`：完整家庭與帳號管理權；可移除 Parent／Child，但 Owner 不可被移除。
- `parent`：完整家庭功能；可邀請 Parent／Child、設定 Child 權限、移除 Child，不能移除 Owner 或 Parent。
- `child`：只能收到獲准 `can_view` 的孩子資料；只有 `can_operate` 的孩子可提交每日任務與兌換。不能加／扣星、進入家長模式、儲存家庭設定或管理其他帳號，但可在「帳號管理」解除自己的家庭關係。

所有寫入都由 Worker 依 Auth.js Session 取得 `user_id` 與 `family_id`。前端沒有可指定 `family_id`、角色或邀請綁定孩子的欄位。涉及孩子的 Child 操作會再次查詢 `member_child_permissions`。

## Migration 0003

檔案：`drizzle/0003_account_management_and_invitations.sql`

- 擴充 `family_members`：角色改為 `owner | parent | child`，新增 `child_id`、`status`、`updated_at`。
- `family_members_user_unique`：一個 Google user 只能有一筆家庭 membership。
- `family_members_child_binding_unique`：同一家庭的一個 child profile 只能綁定一個啟用中的 Child 帳號。
- 新增 `family_invitations`：只保存 `token_hash`、角色、綁定孩子、狀態、建立／到期／接受／取消資訊。
- `family_invitations_pending_child_unique`：同一家庭的一個孩子同時最多一個 pending 邀請；建立新邀請前會先將已到期的 pending 列標記為 expired。
- 新增 `member_child_permissions`：以 `(family_id, user_id, child_id)` 為主鍵，分別保存 `can_view` 與 `can_operate`，並以 CHECK 保證可操作一定可查看。
- 既有 `viewer` 會轉成 `child`，但沒有綁定孩子；Owner／Parent 可移除後用新邀請重新綁定。既有 `family_state`、歷史星星、任務、獎勵、兌換與 R2 物件都不會刪除或重寫。

`0003` 是一次性 schema migration，不要重複執行。

## 邀請安全設計

1. Worker 使用 Web Crypto 產生 32 bytes 隨機值，編碼成 43 字元 URL-safe Base64。
2. 明文 token 只存在新建立的 `/join/{token}` 網址並只回傳一次。
3. D1 只保存 SHA-256 `token_hash`，不保存明文 token。
4. 有效期固定 10 分鐘。前端倒數只供顯示；讀取與接受 API 都以伺服器時間重新檢查 `status = pending` 與 `expires_at`。
5. 接受邀請使用 D1 batch transaction，先條件式將邀請標為 accepted，再從該邀請列複製角色與 `child_id` 建立 membership；瀏覽器不能改角色或孩子。
6. unique constraint 防止同一帳號加入多家庭與同一孩子重複綁定；已使用、取消、過期 token 都會拒絕。

## API 路由

- `GET /api/account`：Owner／Parent 取得家庭成員、Child 權限、有效與歷史邀請；Child 只取得自己的家庭離開狀態，不會看到其他成員或邀請。
- `POST /api/account`
  - `create_invitation`
  - `cancel_invitation`
  - `update_child_permissions`
  - `remove_member`
  - `leave_family`：Parent／Child 只可解除自己的 membership，並立即使自己的 session 失效。
  - `delete_empty_family`：只允許唯一 Owner 刪除非 legacy 的空白家庭。
- `GET /api/invitations/{token}`：公開查詢仍有效的邀請摘要，不回傳 family id 或 token hash。
- `POST /api/invitations/{token}`：已登入 Google 使用者接受邀請。
- `GET /api/state`：Owner／Parent 取得全家庭；Child 只取得可查看孩子及相關紀錄。
- `POST /api/state`：Child 只可對獲准操作的孩子送出每日任務完成與兌換；其他動作回 403。

錯誤皆使用 `{ "error": "繁體中文訊息" }`，並依情況回傳 401、403、404、409、410、422。

## 離開家庭與刪除空白家庭

- Parent、Child 可以離開目前家庭；後端只刪除目前登入 user 的 membership，不刪除 `users` 或 `accounts`。
- Owner 不能直接離開有正式資料的家庭，也不能讓有其他成員的家庭成為無主家庭；必須先轉移 Owner。
- 只有非 legacy、成員僅剩目前 Owner，而且 state、孩子、星星、任務、獎勵、紀錄、兌換、圖片、邀請與權限均為空的家庭，才會顯示「刪除空白家庭」。
- 刪除 UI 需要兩次確認。Worker 會在執行前重新解析完整 `family_state`；未知的未來資料欄位只要不是空值也會阻擋刪除。
- 真正 DELETE 同時檢查 member count、legacy 標記、R2 metadata、邀請、權限與 `family_state.updated_at`。若檢查後資料被其他請求更新，刪除會回 409，不會套用舊判斷。
- `legacy-family-v1` 永遠不會被「刪除空白家庭」動作刪除。

## 本機驗證

先完成建置，讓 `dist/server/wrangler.json` 存在：

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm run db:auth:migrate:local
pnpm run db:account:migrate:local
pnpm run verify
```

正式測試邀請需要 Google OAuth callback 使用實際可存取的 HTTPS 網址。純邏輯與 migration contract 已由 `pnpm run test` 使用可控制時間驗證，不需要等待 10 分鐘。

## 正式 D1 上線順序

正式環境已執行 `0002` 才能執行本 migration。先備份，不要直接跳到部署：

```powershell
pnpm run build
pnpm exec wrangler d1 export DB --remote --config dist/server/wrangler.json --output "C:\secure-backups\star-diary-before-account-invites.sql"
pnpm exec wrangler d1 execute DB --remote --config dist/server/wrangler.json --command "SELECT version, applied_at FROM app_migrations ORDER BY applied_at"
pnpm exec wrangler d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/0003_account_management_and_invitations.sql
pnpm exec wrangler d1 execute DB --remote --config dist/server/wrangler.json --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('family_invitations','member_child_permissions') ORDER BY name"
pnpm exec wrangler d1 execute DB --remote --config dist/server/wrangler.json --command "SELECT version, applied_at FROM app_migrations WHERE version='0003_account_management_and_invitations'"
```

確認備份不是 0 bytes、`0002` 已存在、正式資料庫 binding 的 `database_id` 正確，再執行 `0003`。Migration 成功後才部署包含新 SQL 查詢的 Worker，避免新版先上線卻找不到資料表。

正式 Worker 可由 Cloudflare 連接的 GitHub `main` 自動部署；若使用手動 Wrangler：

```powershell
pnpm run build
pnpm exec wrangler deploy --config dist/server/wrangler.json
```

本功能不需要新增 Cloudflare Secret 或環境變數；沿用 `AUTH_GOOGLE_ID`、`AUTH_GOOGLE_SECRET`、`AUTH_SECRET`、`INITIAL_OWNER_EMAIL`、D1 `DB` 與 R2 `MEDIA`。

## 正式驗收

1. Owner 開啟「帳號管理」，建立 Parent 邀請並確認 10 分鐘倒數、複製與分享。
2. 無痕視窗開啟邀請，選另一個 Google 帳號，確認加入為 Parent。
3. 建立 Child 邀請並指定既有孩子，確認不能替已綁定孩子重複建邀請。
4. Child 登入後只看得到預設綁定孩子，能完成任務與送出兌換，但看不到家長模式與快速加扣星；帳號管理只顯示自己的離開家庭操作。
5. 依序切換「兄弟姊妹共用」「可查看全部」「自訂」，確認切換孩子、查看與操作權限同步生效。
6. 取消邀請、等待測試邀請到期、重開已使用連結，確認 API 均拒絕。
7. 點「切換帳號」，確認 Auth.js 登出後 Google 顯示帳號選擇器；「切換查看孩子」不會登出。
8. Parent／Child 點「離開家庭」，確認只解除自己並登出；Owner 有成員或資料時按鈕必須被後端阻擋。
9. 使用全新空白 Owner 家庭確認「刪除空白家庭」需二次確認；新增任一孩子、紀錄、任務、獎勵、圖片或邀請後都不可刪除。

## 回復策略

若 migration 後尚未有新成員或邀請，可先回退 Worker 到前一版；不要直接刪表。若已開始使用邀請功能，`family_members` 已包含新欄位與角色，舊 Worker 不認得 `child`，回退前應停止寫入並保留故障後第二份 D1 export，再決定以新 D1 從備份還原或製作明確的 down migration。
