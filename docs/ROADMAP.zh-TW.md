# Kuade Harness 自我迭代驗收目標

[简体中文](ROADMAP.zh-CN.md) · [English](ROADMAP.en.md)

2026-10-14。使用者確認：自動更新並重新啟動；電腦控制涵蓋 Windows 應用程式和瀏覽器。

| 模組 | 驗收標準 | 狀態 |
| --- | --- | --- |
| MCP | 顯示設定、實際註冊工具及呼叫結果，獨立核對真實呼叫 | 真實 Kimi K3 搜尋、瀏覽器與電腦控制呼叫通過 |
| Skills | 顯示專案實際發現的技能，模型載入並依指示完成工作 | 真實模型載入 skill 並用隨機標記完成表單，通過 |
| 搜尋 | 成熟 MCP 查詢公開搜尋引擎、讀取頁面並附上可核對來源 | 真實模型搜尋並讀取 Electron 官方文件，通過 |
| 瀏覽器 | Playwright MCP 執行導覽、表單操作與結果驗證 | 真實模型導覽、填寫與提交；独立 HTTP 服務核對結果，通過 |
| 電腦控制 | 優先沿用使用者指定的 qwen_computer MCP，觀察並操作受控桌面視窗，核對實際結果 | 原生元件、受控模型及真實 Kimi K3 視窗輸入／點擊通過；發佈包與複雜任務待驗收 |
| 自我迭代 | 真實模型修改原始碼副本，獨立測試與建置通過後自動切換版本、重新啟動並驗證；失敗保留舊版與診斷 | 完整受控自我迭代、原生視窗驗證及最終產物回退通過；真實模型待驗收 |

擴充與技能沿用 Harness 註冊表、`skills/list` 及 MCP 客戶端；不重寫傳輸或技能解析器。固定版本評估 [Playwright MCP](https://github.com/microsoft/playwright-mcp)（Apache-2.0）、[Windows-MCP](https://github.com/CursorTouch/Windows-MCP)（MIT）、[DuckDuckGo MCP](https://github.com/nickclyde/duckduckgo-mcp-server)（MIT），顯示依賴和真實可用狀態。

自我迭代編排與版本啟動分離，沿用 Electron、electron-builder 及官方程序重啟能力，先驗證可攜版切換獨立版本目錄；安裝版評估 [electron-updater](https://www.electron.build/docs/features/auto-update/) 後接入。原始碼副本不攜帶金鑰與使用者對話，保留舊版及來源。模型完成文字不代表測試通過。

每個模組先自動化測試，再執行實際流程。最後以既有真實模型完成一項可見功能改進及自動更新重啟，記錄版本、工作 ID、變更、退出碼和健康檢查。數小時／跨日穩定性另行驗收。

更新：使用者已確認沿用現有專案的 qwen_computer，Windows-MCP 保留為候選。CodeBuddy 本地版本 0.2.3-local.15 基於 [open-codex-computer-use](https://github.com/iFurySt/open-codex-computer-use)（MIT），提供九項標準 MCP 工具及 macOS 14+ 原生執行層。Mac 真實輸入仍待實機驗收；圖片理解由會話模型負責。

階段證據：49 項單元／元件測試通過。修正 Node 22 裝飾器建置後，開發版桌面 MCP 註冊、echo 檔案結果、呼叫回執及專案技能載入流程通過（`.cache/e2e-be276732-d80c-49aa-8e90-069cbf5d11b9`）。這是受控模型服務的整合驗收，外部模型及發佈包另行驗證。

後續階段為 52 項測試通過。真實搜尋元件：`.cache/search-27a56a31-7414-474d-a750-5c18366399db`；桌面搜尋整合：`.cache/live-search-d5c07975-1b26-4b5e-bdca-90b3015413c5`。電腦控制詳見 [Computer Use](COMPUTER.zh-TW.md)。自動更新模組與驗收邊界見 [自我迭代](SELF_ITERATION.zh-TW.md)；真實模型自主改進仍待驗收。
