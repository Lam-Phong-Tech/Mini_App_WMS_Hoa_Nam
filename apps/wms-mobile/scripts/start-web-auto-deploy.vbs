Option Explicit

' Runs at the Windows user's sign-in without showing a console window.
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\Users\TANMIE~1\Documents\GitHub\Mini_App_WMS_Hoa_Nam\apps\wms-mobile\scripts\bootstrap-watch-deploy-web.ps1", 0, False
