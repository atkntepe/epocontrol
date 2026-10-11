$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$l=[System.Net.HttpListener]::new(); $l.Prefixes.Add('http://localhost:8765/'); $l.Start()
while($l.IsListening){ $c=$l.GetContext()
  try{ $b=[IO.File]::ReadAllBytes((Join-Path $root 'index.html')); $c.Response.ContentType='text/html; charset=utf-8'; $c.Response.OutputStream.Write($b,0,$b.Length) }catch{ $c.Response.StatusCode=500 }
  $c.Response.Close() }
