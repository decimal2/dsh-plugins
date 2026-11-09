$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    & node build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'PaperDock build failed.' }
    foreach ($file in @('lib/host.js', 'lib/client.js', 'lib/records.mjs', 'lib/render-figure.mjs')) {
        & node --check $file
        if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $file" }
    }
    New-Item -ItemType Directory -Force -Path dist | Out-Null
    $packed = & npm.cmd pack --ignore-scripts --json --pack-destination dist
    if ($LASTEXITCODE -ne 0) { throw 'PaperDock packaging failed.' }
    $filename = ($packed | ConvertFrom-Json)[0].filename
    & node install.mjs (Join-Path $PSScriptRoot "dist\$filename")
    if ($LASTEXITCODE -ne 0) { throw 'PaperDock installation failed.' }
} finally {
    Pop-Location
}
