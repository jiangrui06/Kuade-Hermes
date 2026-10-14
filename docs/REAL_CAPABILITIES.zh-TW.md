# 真實模型能力驗收

[简体中文](REAL_CAPABILITIES.zh-CN.md) · [English](REAL_CAPABILITIES.en.md)

2026-10-14，使用已儲存的 Ollama Cloud Kimi K3，思考強度 low，在 Kuade 開發版的真實 Harness 引擎中完成：

- 透過上游 `skill` 載入專案技能，隨機驗收標記只寫在技能內。
- 透過 DuckDuckGo MCP 搜尋 Electron 官方文件並讀取網頁內容。
- 透過 Playwright MCP 導航、填寫表單並提交；獨立本機 HTTP 服務核對隨機標記及官方文件網址。
- 透過 qwen_computer 觀察專用 WPF 視窗、輸入中文並觸發按鈕；視窗獨立寫出的檔案符合預期。模型實際選用 `get_app_state`、`set_value` 和 `click`。

兩項任務均記錄 `turn/end: completed`。Key 留在原有執行環境；憑據檔案與 User／Machine／Process 環境指紋不變，結束後還原原有 MCP 設定。

最終通過證據：建置鏡像中的 `.cache/real-capabilities-67238442-abc7-4a58-9055-1072c47c6ef5`，另見 [JSON 回執](acceptance/real-capabilities-2026-10-14.json)。前兩輪驗收腳本分別因按鈕定位及過度限定工具名稱而未通過；修正後完整重跑，原紀錄保留。

在建置目錄執行 `scripts/accept-real-capabilities.mjs`，設定 `KUADE_REAL_CAPABILITIES=1` 及 `KUADE_UVX`。需已儲存的模型連線、空閒 Kuade 與互動式 Windows 桌面。測試暫時載入三個 MCP，完成後還原；`KUADE_ACCEPT_PHASE=web` 或 `computer` 可選單獨流程。

驗收只涵蓋上述受控任務；任意應用、複雜視覺定位、數小時任務、macOS 及已發佈安裝包尚待驗證。電腦控制截圖由使用者設定的外部模型處理，本輪只使用專用測試視窗。
