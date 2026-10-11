# EpoControl static server: http://localhost:8765/ (loopback only). Serves files under this folder only.
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$types=@{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json';'.png'='image/png';'.svg'='image/svg+xml'}
$l=[System.Net.HttpListener]::new(); $l.Prefixes.Add('http://localhost:8765/'); $l.Start()
while($l.IsListening){ $c=$l.GetContext()
  try{
    $rel=[Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/')); if($rel -eq ''){ $rel='index.html' }
    $full=[IO.Path]::GetFullPath((Join-Path $root $rel)); $ext=[IO.Path]::GetExtension($full).ToLower()
    if(-not $full.StartsWith($root + [IO.Path]::DirectorySeparatorChar) -or -not $types.ContainsKey($ext) -or -not (Test-Path -LiteralPath $full -PathType Leaf)){ $c.Response.StatusCode=404 }
    else{ $b=[IO.File]::ReadAllBytes($full); $c.Response.ContentType=$types[$ext]; $c.Response.Headers['Cache-Control']='no-store'; $c.Response.OutputStream.Write($b,0,$b.Length) }
  }catch{ $c.Response.StatusCode=500 }
  $c.Response.Close() }
