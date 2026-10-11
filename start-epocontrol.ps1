$dir=Split-Path -Parent $MyInvocation.MyCommand.Path
try{ Invoke-WebRequest http://localhost:8765/ -UseBasicParsing -TimeoutSec 2 | Out-Null }catch{
  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$dir\server.ps1"; Start-Sleep 2 }
$chrome='C:\Program Files\Google\Chrome\Application\chrome.exe'
$edge='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if(Test-Path $chrome){ Start-Process $chrome '--app=http://localhost:8765/' }
elseif(Test-Path $edge){ Start-Process $edge '--app=http://localhost:8765/' }
else{ Start-Process 'http://localhost:8765/' }
