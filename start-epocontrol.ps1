$dir=Split-Path -Parent $MyInvocation.MyCommand.Path
try{ Invoke-WebRequest http://localhost:8765/ -UseBasicParsing -TimeoutSec 2 | Out-Null; 'Already running' }catch{
  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$dir\server.ps1"; Start-Sleep 2 }
Start-Process 'http://localhost:8765/'
