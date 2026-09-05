# Build the release zip for a GitHub release. Entry names are written explicitly with forward
# slashes through ZipArchive.CreateEntry — Compress-Archive on Windows PowerShell 5.1 writes
# backslashes, which Node-based extractors read as one literal filename (the Battle Flow
# lesson, tools/build-release.ps1 there). Ships module.json, README.md, LICENSE and scripts/.
#
#   powershell -ExecutionPolicy Bypass -File tools/build-release.ps1
#   gh release create vX.Y.Z --title "vX.Y.Z - short phrase" --notes-file dist/RELEASE-NOTES.md `
#     dist/fvtt-mod-miscpatches.zip module.json
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repo = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content (Join-Path $repo "module.json") -Raw | ConvertFrom-Json
$version = $manifest.version
$expected = "https://github.com/Txpple/fvtt-mod-miscpatches/releases/download/v$version/fvtt-mod-miscpatches.zip"
if ($manifest.download -ne $expected) { throw "module.json download URL does not name v$version - bump both fields together" }

$dist = Join-Path $repo "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
$zip = Join-Path $dist "fvtt-mod-miscpatches.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

$files = @("module.json", "README.md", "LICENSE")
$scripts = Join-Path $repo "scripts"
foreach ($f in Get-ChildItem $scripts -Recurse -File) {
  $rel = $f.FullName.Substring($repo.Length + 1)
  $files += ($rel -replace "\\", "/")
}

$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::CreateNew)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($rel in $files) {
  $entry = $archive.CreateEntry($rel)
  $in = [System.IO.File]::OpenRead((Join-Path $repo $rel))
  $out = $entry.Open()
  $in.CopyTo($out)
  $out.Dispose(); $in.Dispose()
}
$archive.Dispose(); $fs.Dispose()

$check = [System.IO.Compression.ZipFile]::OpenRead($zip)
$names = $check.Entries | ForEach-Object { $_.FullName }
$check.Dispose()
if ($names | Where-Object { $_ -match "\\" }) { throw "an entry name carries a backslash" }
$names | ForEach-Object { Write-Output "  $_" }
Write-Output ("{0:N0} bytes, {1} entries, forward slashes verified - v{2}" -f (Get-Item $zip).Length, $names.Count, $version)
