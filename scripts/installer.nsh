; Supported electron-builder hook, shared by installation and uninstallation.
; Never terminate a running copy: it may own a long task in another profile.
!macro customCheckAppRunning
  nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
  Pop $R0
  ${If} $R0 == 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Kuade Harness is running. Finish or save your tasks and exit all Kuade windows and background instances, then run setup again." /SD IDOK
    SetErrorLevel 2
    Quit
  ${ElseIf} $R0 != 603
    MessageBox MB_OK|MB_ICONSTOP "Kuade Harness setup could not check running applications (code $R0). Setup has stopped without closing any application. Please retry after exiting Kuade." /SD IDOK
    SetErrorLevel 3
    Quit
  ${EndIf}
!macroend
