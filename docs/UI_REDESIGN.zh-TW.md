# Kuade 0.2.0 介面重構

[简体中文](UI_REDESIGN.zh-CN.md) · [English](UI_REDESIGN.en.md)

## 操作流程

以「連接模型 → 描述需求 → 查看結果 → 按需檢查執行過程」重排六個頁面，保留 Harness 執行層。工作臺提供首次使用引導、任務範例及預設工作區；模型按服務分組，集中在同一個選擇器。

對話文字、程式碼、表格分別排版，工具紀錄預設收合，可展開原始詳情及複製完整回覆。閱讀舊訊息時不強制跳到底部。任務紀錄支援搜尋、篩選、重新命名；檔案名稱與還原按鈕分開，還原前仍需確認。模型列表支援搜尋及批選，儲存後直接開始對話。

工具與技能頁提供四種常用能力的一鍵啟停；連線狀態與自訂 MCP 按需展開。有未儲存的進階草稿時停用快捷開關，避免覆蓋。開關僅表示設定已啟用，實際連線以執行時狀態為準。若設定已儲存但重連失敗，介面重新讀取設定並清楚提示。自我迭代頁明確呈現選擇原始碼、獨立測試、更新重啟的步驟。

## 視覺與驗證

統一白色內容區、灰色側欄、藍色操作強調及 13–14px 基本文字。導航、歡迎頁與輸出分組分別模組化。檢查 1440×960 與 1000×760 視窗。

本輪採用隔離資料目錄及本機受控模型服務，驗證真實 Electron、Harness、檔案、剪貼簿、MCP 與持久化流程；不將其當作外部模型品質、跨日執行或自動更新的新驗收。詳細結果見 `docs/acceptance/ui-redesign-0.2.0-2026-10-22.json`。

已通過：154 項自動化檢查（132 項應用測試及 22 項驗收腳本測試）、型別檢查、正式建置、7 條開發版桌面流程及獨立 ZIP 的 3 條桌面流程。ZIP 完整性與複製後 SHA-256 一致性檢查通過。交付版本 0.2.0，未簽章；本輪提供便攜 ZIP，未產生新安裝程式。

## 參考來源 / References

- [Cursor Agent](https://prod.cursor.com/help/ai-features/agent) 和 [Review](https://docs.cursor.com/en/agent/review)：任務與程式碼審查放在主流程。
- [Claude Code Desktop redesign](https://claude.com/resources/articles/claude-code-desktop-redesign)：任務導航與輸出層級。
- [VS Code tools](https://code.visualstudio.com/docs/agents/run/tools)：工具能力與執行狀態分開呈現。
- [Linear UI refresh](https://linear.app/changelog/2026-03-12-ui-refresh)：統一導航、標題和控制項層級。
- [NN/g Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)：進階資訊按需展開。

參考互動原則，未引入這些產品的程式碼、圖示或品牌資產。

## 介面截圖

以下為隔離驗收環境的真實桌面截圖，模型與專案資料為測試範例。

![Welcome](images/ui-0.2.0/01-welcome.png)

![Conversation](images/ui-0.2.0/04-conversation.png)

![Tools](images/ui-0.2.0/07-tools.png)
