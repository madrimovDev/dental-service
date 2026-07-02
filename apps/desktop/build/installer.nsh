; apps/desktop/build/installer.nsh
; O'rnatish vaqtida Server yoki Klient tanlash

!macro customInstall
  MessageBox MB_YESNO "Bu kompyuter asosiy server bo'lsinmi?$\n$\nHA — Server (ma'lumotlar shu yerda saqlanadi)$\nYO'Q — Klient (boshqa serverga ulanadi)" IDYES server_mode IDNO client_mode

  server_mode:
    WriteRegStr HKCU "Software\DentalService" "Role" "server"
    Goto done

  client_mode:
    WriteRegStr HKCU "Software\DentalService" "Role" "client"
    done:
!macroend
