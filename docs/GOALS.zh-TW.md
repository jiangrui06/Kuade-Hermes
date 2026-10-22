# 持續目標與重啟恢復

2026-10-22 介面修正（0.1.12）：執行狀態依 Harness 的真實輪次邊界呈現；目標完成但計畫未勾完時，顯示「本輪結束」並提示核對計畫。跨輪投影為空時，按固定快照分頁尋找最近的持久化計畫並標註「歷史計畫」；明確清空、新計畫與工作階段切換不會被舊回應覆蓋，讀取失敗也不會顯示為沒有計畫。117 項應用測試、22 項驗收工具測試、型別檢查與建置通過；4 項真實 Electron 流程通過，包含保留跨天記錄的中斷與完成狀態。見 [開發建置驗收](acceptance/task-progress-ui-2026-10-22.json)。0.1.12 ZIP 的獨立啟動（保留舊版指標）、4 項桌面流程及壓縮包完整性檢查也已通過，見 [發行包證據](acceptance/release-0.1.12-2026-10-22.json)。NSIS 安裝包已產生，本輪未執行安裝。

2026-10-22 核實：本輪 24 小時資料校驗完成了 1,441 次檢查、1,851,685 筆資料；原始整體驗收仍未通過，協調程序退出碼為 1。根因已確認：驗收器僅讀取最近 100 則訊息，遺漏持久化計畫（序號 27、50）。現已修復固定快照下的完整分頁讀取，110 項應用測試及 22 項驗收工具測試通過。同一工作階段的延遲恢復補驗已通過：再次重啟保留完整歷史與相同目標，真實模型第 3 輪完成，獨立 CLI 核對 137 行輸入、117 筆有效記錄及 791682 分總額，程序退出碼 0；原始失敗回執保持不變。見 [恢復補驗證據](acceptance/real-goal-post-soak-recovery-2026-10-22.json)。見 [本輪記錄](acceptance/real-goal-24-hour-0.1.11-observer-retry-2026-10-16.json)。

2026-10-16 更新：0.1.11 的本輪 24 小時測試已於 17:17（UTC+8）結束，維持未通過。最後資料校驗執行約 6 小時 44 分鐘、405 次檢查，共 520,425 筆資料；驗收腳本的單次 `session/list` 唯讀請求出現 `fetch failed` 後進入清理並關閉應用程式，退出觀察器記錄協調程序退出碼 1。底座當時已退出或僅有短暫連線故障，現有證據尚未證實。原始回執、截圖、日誌與工作階段保留，暫存憑據已移除；本輪未完成 24 小時或重新啟動恢復。驗收器已增加唯讀觀測的有限重試及清理前診斷，新的長測須另行記錄。

目前長測以無主控台的 `pythonw.exe` 執行 `scripts/acceptance/windows-exit-observer.py`，直接沿用 Windows 程序控制代碼及退出碼 API。它僅使用既有 Python 標準函式庫，不增加桌面發行包依賴。程序身分、無主控台狀態與退出碼 0、7、259 已實測通過；先前 PowerShell 觀察器異常結束的記錄保留。觀察器本身成功退出不代表被觀察程序成功，最終須核對 `exit-observation-gui.json` 的目標退出碼。參考：[Python Windows 執行方式](https://docs.python.org/3.12/using/windows.html)、[Windows 退出碼 API](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getexitcodeprocess)。

外層宿主結束而實際驗收程序仍執行時，保留原測試。`scripts/acceptance/windows-exit-observer.ps1` 核對 PID、執行檔與啟動時間後持有原生程序控制代碼，記錄該程序的真實退出碼；狀態檔案本身不證明程序存活。`node --test scripts/acceptance/windows-exit-observer.test.mjs` 已驗證拒絕過期身分，並取得非子程序的實際退出碼。

2026-10-16：驗收宿主 `scripts/acceptance/windows-task-host.ps1` 沿用 Windows 工作排程器，在目前使用者互動桌面按需啟動驗收，沒有週期觸發器，時限 28 小時。模型目錄透過 Node `realpathSync.native` 解析實際路徑，相容 AppData 虛擬化；工作定義不包含 Key。宿主儲存程序、腳本副本與雜湊，依真實子程序退出碼記錄結果，空退出碼記為失敗。環境修改僅作用於該程序。收集最終回執後移除對應暫存工作。

設定 `KUADE_TEST_WINDOWS_TASK=1` 與指向無憑據啟動清單的 `KUADE_TASK_HOST_EXAMPLE`，執行 `node --test scripts/acceptance/windows-task-host.test.mjs`，驗證真實桌面成功、子程序失敗及無效清單拒絕。正式託管使用 `powershell.exe -NoProfile -File scripts/acceptance/windows-task-host.ps1 -Manifest <實際清單路徑>`。清單位於 `D:\Kuade-acceptance\host-<UUID>`，指定 Node、應用、原始碼、依賴、PowerShell 及模型目錄，校驗時長支援 60000、7200000 或 86400000 毫秒。

參考：[工作主體](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal)、[工作設定](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset)、[按需啟動](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/start-scheduledtask)。

## 長時間驗收方法

2026-10-15：0.1.8 解壓版的 [兩小時真實模型驗收](acceptance/real-goal-two-hour-2026-10-15.json) 已完整通過。實際執行 7,200,005 毫秒，121 次檢查、605 批共 155,485 筆資料，最大心跳間隔約 60.02 秒，另有 236 次宿主觀察。目標在長作業期間自動續輪；重啟後保留相同目標及 4 輪記錄，明確恢復後第 5 輪完成 CLI。獨立輸出校驗通過，原模組及憑據不變，暫存憑據已刪除。

首輪 24 小時測試被 0.1.8 安裝程式中斷，約 73 分鐘的結果維持未通過。第二輪 0.1.9 在約 9 小時 8 分鐘後中斷，測試程序與宿主控制代碼已不存在，未產生最終回執；Windows 未重新啟動，終止原因尚未證實。該輪維持未通過，暫存憑據已清理，見 [中斷記錄](acceptance/real-goal-24-hour-0.1.9-2026-10-15.json)。0.1.11 的獨立託管恢復預檢已通過，完整重測於 2026-10-16 10:32（UTC+8）開始，17:17 提前結束，未進入最終校驗及恢復；見 [本輪中斷記錄](acceptance/real-goal-24-hour-0.1.11-2026-10-16.json)。

真實模型先開發模組與測試，再透過現有背景作業執行獨立校驗：每分鐘以五批新資料核對結果，記錄實際時間、檢查次數與最大心跳間隔；長時間停頓會拒絕通過。宿主同時記錄觀察時間，隨後驗證同對話重啟恢復及 CLI 結果。這涵蓋長命令與目標生命週期，不等同於持續開發大型專案。

執行 `scripts/accept-real-recovery.mjs`，設定 `KUADE_REAL_RECOVERY=1`、`KUADE_RECOVERY_GOAL=1`、`KUADE_MODEL_PROFILE` 與 `KUADE_ACCEPT_EXECUTABLE`。`KUADE_RECOVERY_SOAK_MS=7200000` 表示兩小時，上限為 86400000；一分鐘預檢不計為長時間通過。結束後移除獨立使用者目錄的暫存憑據。首次預檢資料校驗通過，但腳本讀取空計畫投影失敗，回執保留；現依底座語義從持久化 `todo/write` 核對上一輪計畫，恢復時固定事件序號比較內容。

沿用上游 [背景作業](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/jobs/tool-jobs/README.md) 與 [持續目標](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/goal/goal/README.md)，未另建排程器。

[简体中文](GOALS.zh-CN.md) · [English](GOALS.en.md)

0.1.7 可攜 ZIP 在獨立短目錄解壓後，真實 Kimi K3 自動第二輪、重啟等待恢復、第三輪完成及獨立 CLI 校驗全部通過；見 [發佈包目標恢復](acceptance/real-goal-packaged-0.1.7-2026-10-15.json)。這是短時恢復驗收，數小時與跨日穩定性仍待實測。

在工作台輸入區展開「设置持续目标」，填寫目標和自動輪數上限，再點擊「开始持续目标」。目標沿用目前工作區、模型與執行模式；普通訊息仍只啟動一般對話輪次。預設上限為 256 輪，計算自動續輪次數；單輪內可能多次呼叫模型，這並非金額或時間預算。

未完成且已啟用的目標會由 Harness 自動開始下一輪。「暂停目标」停止目前輪次及後續自動執行。退出後保留目標和會話並停止執行中的程序；重開任務後點擊「恢复目标」，模型才會核對檔案並處理剩餘工作。重啟不會原地恢復系統命令。達到上限時停止續輪，可另開任務安排後續工作。

「Agent 报告目标完成」代表模型更新狀態，仍須檢查檔案和測試。長目標可捲動查看，支援鍵盤聚焦與翻頁。背景任務持續使用模型額度；主動休眠、斷網及關機會影響執行。

## 模組邊界

持久化、自動續輪及狀態轉換沿用固定版本 Harness 0.2.0-rc.2 的 goal 與 goal-round-driver。GoalPanel 只透過允許的 `goals/get`、`goals/create`、`goals/pause`、`goals/resume` 操作與顯示狀態，建立時沿用現有會話及模型準備流程。暫停／恢復攜帶 ID 和 revision，避免覆蓋已變更狀態。沒有另建 Agent 迴圈、目標資料庫或新增依賴。

## 驗收（2026-10-15）

- 87 項應用測試、7 項 GitHub 驗收檢查測試、型別檢查及建置通過。
- [受控模型桌面流程](acceptance/controlled-goal-2026-10-15.json)：真實 Electron 中建立、自動第二輪、暫停、重啟保持暫停、明確恢復第三輪、寫檔並獨立核對。這驗證宿主生命週期，不代表真實模型能力。
- [真實模型一般任務恢復](acceptance/real-recovery-2026-10-15.json)：Kimi K3 實作帳目彙總與測試，在受控命令檢查點退出；重啟原會話後完成 CLI，宿主獨立驗證 137 行輸入、117 筆 paid 記錄和 791682 分總額。
- [真實模型持續目標恢復](acceptance/real-goal-2026-10-15.json)：自動進入第二輪後於檢查點退出；重啟保留同一目標與 2 輪記錄並等待恢復，明確恢復後第三輪完成。宿主獨立執行 CLI 核對結果；已完成模組及原使用者憑據未變。

上述是開發建置的短時流程，以正常關閉應用及停止引擎中斷，不等同系統崩潰、斷電、數小時或跨日連續執行。回執保留目標、輪次、會話及校驗結果，目前使用者執行中的發佈包另行交付驗收。

## 複驗

建置後執行 `npx playwright test tests/e2e/goals.spec.ts`。真實測試為 `scripts/accept-real-recovery.mjs`，明確設定 `KUADE_REAL_RECOVERY=1` 和 `KUADE_MODEL_PROFILE`（已儲存模型設定的使用者目錄）；增加 `KUADE_RECOVERY_GOAL=1` 驗收持續目標。腳本使用獨立使用者目錄與臨時工作區，結束時刪除複製的模型憑據，保留使用者執行中的實例。測試消耗模型額度，回執位於 `D:/Kuade-acceptance` 對應目錄。

上游參考：[目標狀態](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/goal/goal)、[自動續輪](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/goal/goal-round-driver)、[會話持久化](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/session/session-persistence)。
