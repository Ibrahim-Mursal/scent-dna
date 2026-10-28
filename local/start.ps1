# Runs the full Scent DNA site on this PC at http://127.0.0.1:8090 with accounts, Community and Shops.
# Started by "Start Scent DNA.cmd". Keep the window open; closing it stops the site.
# The database lives in %LOCALAPPDATA%\ScentDNA, not in this folder, so nothing private gets uploaded with the site.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root    = Split-Path -Parent $PSScriptRoot
$Data    = Join-Path $env:LOCALAPPDATA "ScentDNA"
$Version = "0.40.5"
$Exe     = Join-Path $Data "pocketbase.exe"
$PbData  = Join-Path $Data "pb_data"
$Mig     = Join-Path $Data "migrations"
$Hooks   = Join-Path $Root "server\pb_hooks"
$Url     = "http://127.0.0.1:8090/"
$Log     = Join-Path $Data "local-run.log"

function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }

Say ""
Say "  Scent DNA - local run" "Green"
Say "  ---------------------"

if (-not (Test-Path (Join-Path $Root "index.html"))) { Say "  index.html is missing. Run this from the scent-dna folder." "Red"; exit 1 }
New-Item -ItemType Directory -Force -Path $Data, $Mig | Out-Null

# already running?
if (Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue) {
  Say "  Something is already using port 8090. If Scent DNA is already running, it's at $Url" "Yellow"
  Start-Process $Url
  exit 0
}

# 1. PocketBase (accounts, database and photo storage in one program), first time only
$verFile = Join-Path $Data "version.txt"
if (-not (Test-Path $Exe) -or -not (Test-Path $verFile) -or ((Get-Content $verFile -Raw).Trim() -ne $Version)) {
  Say "  Downloading PocketBase $Version (about 15 MB, first time only)..."
  $zip = Join-Path $Data "pocketbase.zip"
  try {
    Invoke-WebRequest -UseBasicParsing -OutFile $zip -Uri "https://github.com/pocketbase/pocketbase/releases/download/v$Version/pocketbase_${Version}_windows_amd64.zip"
  } catch { Say "  The download failed. Check your internet connection and try again." "Red"; exit 1 }
  Expand-Archive -Path $zip -DestinationPath $Data -Force
  Remove-Item $zip -Force
  Set-Content -Path $verFile -Value $Version
}

# 2. Database: the real migrations plus local demo data (demo data only ever exists on this PC)
Copy-Item (Join-Path $Root "server\pb_migrations\*.js") $Mig -Force
Copy-Item (Join-Path $PSScriptRoot "demo_data.js") (Join-Path $Mig "1769000000_local_demo_data.js") -Force
Say "  Preparing the database..."
& $Exe migrate up --dir $PbData --migrationsDir $Mig *> $Log
if ($LASTEXITCODE -ne 0) { Say "  The database couldn't be prepared. Details: $Log" "Red"; exit 1 }
& $Exe superuser upsert "admin@scentdna.local" "demo12345" --dir $PbData *>> $Log

# 3. Open the browser a moment after the server starts
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -Command Start-Sleep -Seconds 3; Start-Process '$Url'"

Say ""
Say "  Site:       $Url" "Green"
Say "  Dashboard:  ${Url}_/   (admin@scentdna.local / demo12345)"
Say ""
Say "  Demo accounts on the site (password demo12345):"
Say "    ibrahim@demo.local   you, the admin (Orders and shops)"
Say "    sha@demo.local       Sha Perfume's owner (Shop dashboard)"
Say "    shop@demo.local      Erbil Originals' owner (Shop dashboard)"
Say "    sara@demo.local      a member with reviews"
Say ""
Say "  Keep this window open. Close it to stop the site."
Say ""
& $Exe serve --http "127.0.0.1:8090" --dir $PbData --publicDir $Root --migrationsDir $Mig --hooksDir $Hooks
