; apps/desktop/build/installer.nsh
; O'rnatish vaqtida Server yoki Klient tanlash

; Tanlangan rol to'g'ridan-to'g'ri config.json'ga yoziladi — apps/desktop/src/config.ts
; readConfig() faqat shu faylni o'qiydi (registry emas); $COMMONAPPDATA ==
; C:\ProgramData, config.ts'dagi getConfigDir() qiymati bilan bir xil.
!macro customInstall
  MessageBox MB_YESNO "Bu kompyuter asosiy server bo'lsinmi?$\n$\nHA — Server (ma'lumotlar shu yerda saqlanadi)$\nYO'Q — Klient (boshqa serverga ulanadi)" IDYES server_mode IDNO client_mode

  server_mode:
    StrCpy $0 "server"
    Goto write_config

  client_mode:
    StrCpy $0 "client"

  write_config:
    CreateDirectory "$COMMONAPPDATA\DentalService"
    FileOpen $1 "$COMMONAPPDATA\DentalService\config.json" w
    FileWrite $1 '{"role":"$0"}'
    FileClose $1
!macroend
