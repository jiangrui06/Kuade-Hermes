# Windows 安裝與執行中的任務

[简体中文](INSTALLER.zh-CN.md) · [English](INSTALLER.en.md)

0.1.8 安裝驗收重現了安裝程式關閉安裝目錄以外同名 `Kuade.exe` 的問題。首輪 24 小時測試因此在約 73 分鐘時中斷，保留為未通過。請勿在任務執行時使用舊安裝程式。

0.1.9 使用 electron-builder 官方 `customCheckAppRunning` 擴充入口與既有 nsProcess 元件。偵測到任何 Kuade 程序時，安裝或解除安裝以退出碼 2 停止；偵測出錯時返回 3。請先儲存工作、等待任務完成並退出背景程序，再重試。安裝程式不再發送關閉或終止要求。其他目錄或設定的 Kuade 也會阻止操作，以保護長任務。

應用自身候選版本更新仍使用健康檢查及交接模組，不透過 NSIS。安裝保護腳本納入自我迭代基線，模型修改候選腳本不會替換本輪可信打包設定。

`scripts/acceptance/installer.ps1` 僅適用於沒有既有 Kuade 安裝記錄及執行程序的測試環境。參數為 `-Installer`、`-Unpacked`、`-BuildDirectory`、`-Version`。它建立短路徑臨時安裝目錄及獨立同名見證程序，檢查拒絕安裝、正常安裝、啟動、拒絕解除安裝、正常解除安裝及原模型設定雜湊。回執位於 `D:\Kuade-acceptance`，失敗現場保留；腳本啟動或單一退出碼不代表驗收通過。靜默驗收不涵蓋互動精靈或管理員安裝。

參考：[electron-builder NSIS](https://www.electron.build/nsis/)、[nsProcess](https://nsis.sourceforge.io/NsProcess_plugin)、[NSIS 命令列](https://nsis.sourceforge.io/Docs/Chapter3.html)。結果見 [安裝記錄](acceptance/installer-0.1.9-2026-10-15.json)。
