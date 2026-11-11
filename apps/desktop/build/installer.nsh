; apps/desktop/build/installer.nsh
; O'rnatish vaqtida Server yoki Klient tanlash

; Tanlangan rol to'g'ridan-to'g'ri config.json'ga yoziladi — apps/desktop/src/config.ts
; readConfig() faqat shu faylni o'qiydi (registry emas); $COMMONAPPDATA ==
; C:\ProgramData, config.ts'dagi getConfigDir() qiymati bilan bir xil.
; P14: config.json allaqachon bor bo'lsa (yangilash) dialog ham, yozish ham
; o'tkaziladi — NSIS faqat `role` yozadi, qolganini (serverPort, licenseKey...)
; ilova o'zi writeConfig bilan qo'shadi, shuning uchun merge kerak emas.
!macro customInstall
  IfFileExists "$COMMONAPPDATA\DentalService\config.json" config_done 0

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

  config_done:
  ; DT-03: boshqa PC'lardan ulanish (HTTP 8080) va server topish (UDP 47890).
  ; Avval o'chirib qo'shamiz — yangilashda qoida dublikat bo'lmasin.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Dental Service TCP"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Dental Service UDP"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Dental Service TCP" dir=in action=allow protocol=TCP localport=8080'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Dental Service UDP" dir=in action=allow protocol=UDP localport=47890'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Dental Service TCP"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Dental Service UDP"'
!macroend
