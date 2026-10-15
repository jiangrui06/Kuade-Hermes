# Git 與 GitHub

最新驗收（2026-10-15）：82 項測試與型別檢查通過。真實 Kimi K3 已在獨立儲存庫完成檢查、修改、提交及推送；宿主驗證本機 bare 儲存庫與工作區提交一致、工作區乾淨。見 [Git 驗收記錄](acceptance/real-git-2026-10-15.json)。這項記錄未涉及 GitHub 帳號授權或遠端寫入。

[简体中文](GITHUB.zh-CN.md) · [English](GITHUB.en.md)

本機版本控制繼續使用系統 Git：Agent 透過 Harness 終端工具執行 Git，修改頁面提供未暫存 Diff 與單一檔案還原。連接 GitHub 不會自動提交、推送或建立分支；這些操作應由使用者的具體任務決定。

在「工具与技能」點擊「添加GitHub」，等待官方元件下載與 SHA-256 驗證，再點擊「保存并重新加载」。有任務執行時先等待完成。首次要求 Agent 查詢 GitHub 帳號或儲存庫時，官方 MCP 會引導你在瀏覽器登入授權。Kuade 不實作自己的 OAuth，也不將權杖寫入擴充設定。

目前固定使用 GitHub 官方 MCP v2.0.2 的 Windows x64 版本（MIT），啟用儲存庫、Git 物件、Issue、Pull Request 與使用者工具，授權範圍為 `repo,read:org`。實際可操作的儲存庫與操作取決於登入帳號權限。GitHub 儲存庫工具操作的是遠端儲存庫，本機工作區的提交與推送仍使用 Git。

OAuth 權杖由官方 MCP 保留在程序記憶體中；引擎重新啟動後可能需要重新授權。工具已註冊只證明元件可用，帳號連接需要透過實際 `get_me` 等呼叫驗證。快取位於 Kuade 使用者資料目錄的 `tools/github-mcp-2.0.2`；快取驗證失敗時不會啟動該檔案。

2026-10-15：型別檢查、建置及 75 項單元／元件測試通過，涵蓋下載與解壓驗證、快取竄改、並行安裝和介面失敗處理。真實桌面下載與註冊、瀏覽器授權、真實模型的 Git/GitHub 操作分別驗收；目前帳號授權與遠端寫入仍待驗收。

參考：[官方 MCP](https://github.com/github/github-mcp-server/tree/v2.0.2)、[官方 OAuth 文件](https://github.com/github/github-mcp-server/blob/v2.0.2/docs/oauth-login.md)、[發行檔案與校驗值](https://github.com/github/github-mcp-server/releases/tag/v2.0.2)。

真實桌面下載、設定儲存、引擎重新載入與官方工具註冊已通過（含 `get_me`）。下載改用 Electron 系統代理網路堆疊；新增網路錯誤測試通過。證據：[GitHub 註冊驗收](acceptance/github-registration-2026-10-15.json)。本次未呼叫帳號授權或遠端寫入。
