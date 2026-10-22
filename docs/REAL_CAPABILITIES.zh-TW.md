# 真實模型能力驗收

0.2.4 的實際操作流程、介面改善及驗收邊界見 [工具與技能使用流程](CAPABILITY_JOURNEY.zh-TW.md)。本輪 Kimi K3 的電腦操作依靠可讀取的視窗控制項；工具圖片未傳給模型，因此不計為截圖視覺理解通過。

2026-10-22：獨立 0.1.12 ZIP 的真實 Kimi K3 聯動驗收通過。模型載入專案技能後，實際呼叫搜尋及網頁讀取 MCP，在瀏覽器填入隨機標記與官方文件連結並提交；宿主核對收到的表單。接著模型透過包內 qwen_computer 觀察專用 Windows 視窗、輸入中文並點擊按鈕，宿主獨立核對結果檔案。原憑據與環境指紋維持一致，臨時憑據已移除。見 [本輪證據](acceptance/real-capabilities-packaged-0.1.12-2026-10-22.json)。驗證範圍是 Windows 專用視窗及瀏覽器流程，不涵蓋所有應用或 macOS。

0.1.11 解壓縮版已完成新一輪真實 Kimi K3 驗收：載入專案 Skill，呼叫搜尋及網頁讀取 MCP，經 Playwright MCP 填寫並提交正確的隨機標記與官方文件連結，再由 qwen_computer 觀察專用 Windows 視窗、輸入中文及點擊按鈕。HTTP 表單結果與原生視窗輸出檔案均獨立核對通過。兩項工作正常完成，原憑據及系統環境指紋不變，暫存憑據已移除。回執中的 EXE、應用封存及原生元件雜湊均符合 0.1.11 發行包。見 [新版真實呼叫證據](acceptance/real-capabilities-packaged-0.1.11-2026-10-15.json)。這是指定流程的驗收，複雜桌面工作及跨日穩定性另行記錄。

[简体中文](REAL_CAPABILITIES.zh-CN.md) · [English](REAL_CAPABILITIES.en.md)

2026-10-15：修正執行環境 peer 依賴封裝遺漏後，0.1.7 已在獨立發佈目錄通過真實 Kimi K3 的 Skills、搜尋、網頁閱讀、瀏覽器表單提交及 qwen_computer 輸入／按鈕操作。回執綁定應用歸檔與原生元件雜湊；見 [發佈包真實模型驗收](acceptance/real-capabilities-packaged-0.1.7-2026-10-15.json)。原設定與環境指紋未變，臨時憑據已刪除。下方保留 2026-10-14 的開發版歷史證據。

2026-10-14，使用已儲存的 Ollama Cloud Kimi K3，思考強度 low，在 Kuade 開發版的真實 Harness 引擎中完成：

- 透過上游 `skill` 載入專案技能，隨機驗收標記只寫在技能內。
- 透過 DuckDuckGo MCP 搜尋 Electron 官方文件並讀取網頁內容。
- 透過 Playwright MCP 導航、填寫表單並提交；獨立本機 HTTP 服務核對隨機標記及官方文件網址。
- 透過 qwen_computer 觀察專用 WPF 視窗、輸入中文並觸發按鈕；視窗獨立寫出的檔案符合預期。模型實際選用 `get_app_state`、`set_value` 和 `click`。

兩項任務均記錄 `turn/end: completed`。Key 留在原有執行環境；憑據檔案與 User／Machine／Process 環境指紋不變，結束後還原原有 MCP 設定。

最終通過證據：建置鏡像中的 `.cache/real-capabilities-67238442-abc7-4a58-9055-1072c47c6ef5`，另見 [JSON 回執](acceptance/real-capabilities-2026-10-14.json)。前兩輪驗收腳本分別因按鈕定位及過度限定工具名稱而未通過；修正後完整重跑，原紀錄保留。

在建置目錄執行 `scripts/accept-real-capabilities.mjs`，設定 `KUADE_REAL_CAPABILITIES=1`、`KUADE_MODEL_PROFILE`（已儲存模型連線的使用者目錄）及 `KUADE_UVX`。目前腳本將模型設定複製到獨立驗收目錄，載入三個 MCP，結束時刪除臨時憑據；原使用者實例及設定不參與驗收。需互動式 Windows 桌面。`KUADE_ACCEPT_PHASE=web` 或 `computer` 可選單獨流程；`KUADE_ACCEPT_EXECUTABLE` 指定發佈包，記錄版本、應用歸檔雜湊與原生元件路徑。

驗收只涵蓋上述受控任務；任意應用、複雜視覺定位、數小時任務、macOS 及已發佈安裝包尚待驗證。電腦控制截圖由使用者設定的外部模型處理，本輪只使用專用測試視窗。
