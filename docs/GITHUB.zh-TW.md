# Git 與 GitHub

[简体中文](GITHUB.zh-CN.md) · [English](GITHUB.en.md)

本機版本控制沿用系統 Git：Agent 透過 Harness 終端執行 Git，變更頁面提供未暫存 Diff 與單檔還原。GitHub 連接沿用官方 MCP，不另寫 GitHub API 或 OAuth。操作範圍由使用者任務及帳號權限決定。

在「工具与技能」點選「添加GitHub」，等待下載及 SHA-256 校驗，再點選「保存并重新加载」。有任務執行時先等待完成。首次要求 Agent 查詢帳號或儲存庫時，在瀏覽器完成官方授權。GitHub MCP 操作遠端儲存庫，本機提交及推送仍使用 Git。

目前固定 GitHub MCP v2.0.2、Windows x64、MIT，開啟 context、repos、issues、pull_requests、users、git 工具集，授權範圍為 repo,read:org。權杖僅由官方元件保留在程序記憶體中，重啟可能需要重新授權；Kuade 不將權杖寫入擴充設定。快取位於使用者資料目錄 tools/github-mcp-2.0.2，校驗失敗的檔案不會啟動。

## 已驗收範圍（2026-10-15）

- [元件註冊](acceptance/github-registration-2026-10-15.json)：實際下載、校驗、設定儲存、引擎重載及工具註冊。
- [本機 Git](acceptance/real-git-2026-10-15.json)：真實 Kimi K3 檢查、修改、提交並推送至本機 bare 儲存庫；宿主核對提交一致及工作區乾淨。
- [GitHub 讀取](acceptance/real-github-read-2026-10-15.json)：使用者完成 OAuth，真實模型呼叫帳號、提交及檔案／資源讀取；獨立核對帳號 ID、提交 SHA 及 README 完整 Git blob。初版腳本漏判資源讀取路徑，原失敗回執保留，持久化事件複驗通過。
- [GitHub 寫入](acceptance/real-github-write-2026-10-15.json)：真實模型在批准的 main 分支寫入一個驗收檔案。首次轉錄少一個冒號；第二個真實模型任務修正後，宿主核對全文、blob、父提交、提交訊息及唯一變更路徑全部正確。首次失敗保留；臨時模型憑據已刪除。

以上證明具體帳號及批准的單檔讀寫路徑，不代表所有 Issue、Pull Request、組織或分支保護情境均已驗收。註冊狀態本身不代表登入成功。

## 複驗

標準 npm test 包含 87 項應用測試及 7 項驗收檢查測試。scripts/accept-real-github.mjs 預設唯讀：從已建置開發目錄設定 KUADE_REAL_GITHUB=1 與 KUADE_MODEL_PROFILE（已儲存模型連接的 Kuade 使用者資料目錄）後執行。使用獨立實例，退出時刪除臨時憑據，OAuth 由使用者完成。寫入模式僅針對本次明確批准的固定記錄；已有檔案拒絕重複新增，修復模式只接受已知的冒號轉錄偏差，並非通用發佈命令。

參考：[官方 MCP](https://github.com/github/github-mcp-server/tree/v2.0.2)、[OAuth](https://github.com/github/github-mcp-server/blob/v2.0.2/docs/oauth-login.md)、[發佈與校驗](https://github.com/github/github-mcp-server/releases/tag/v2.0.2)。
