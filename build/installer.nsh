; Keep in sync with publish.owner/repo in electron-builder.yml. The /LANG must
; match electron-builder's own version keys (en-US unless nsis.language is set).
!macro customHeader
  VIAddVersionKey /LANG=1033 "ProvenanceRepo" "non7top/promptloom"
!macroend
