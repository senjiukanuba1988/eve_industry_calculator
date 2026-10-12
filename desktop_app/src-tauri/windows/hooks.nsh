; Installer hooks for Tauri's NSIS template (tauri.conf.json, bundle.windows.nsis.installerHooks).
;
; Uninstalling never touches the data folder: it lives in Documents, outside everything the
; uninstaller removes (the "Delete the application data" checkbox only clears the WebView
; cache in AppData). After a real uninstall, say where the data is, so the user knows it is
; still there and can delete it or keep it for a later install. Not when the uninstaller
; runs as part of installing a newer build over this one (/UPDATE), and not when silent.
;
; The folder name must match DATA_FOLDER_NAME in src/lib.rs (release builds). $DOCUMENTS
; follows a redirected Documents folder (OneDrive), as the app's known-folder lookup does.

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetShellVarContext current
    StrCpy $R9 "$DOCUMENTS\EVE Industry Calculator"
    ${If} ${FileExists} "$R9\*.*"
      MessageBox MB_OK|MB_ICONINFORMATION "${PRODUCTNAME} has been removed. Your recipes, hangar and plans were not deleted - they are still in:$\r$\n$\r$\n$R9$\r$\n$\r$\nInstalling the application again picks them up. Delete that folder yourself if you no longer want them." /SD IDOK
    ${EndIf}
  ${EndIf}
!macroend
