$ErrorActionPreference = 'Stop'
# Build both before changing the user's profile. Run after stopping dsh web.
$packages = @('paperdock-plugin', 'session-delete-plugin')
foreach ($package in $packages) {
    & node (Join-Path $PSScriptRoot "$package\build.mjs")
    if ($LASTEXITCODE -ne 0) { throw "$package build failed; profile has not been changed." }
}
foreach ($package in $packages) {
    $lib = Join-Path $PSScriptRoot "$package\lib"
    foreach ($file in (Get-ChildItem -LiteralPath $lib -File | Where-Object { $_.Extension -in @('.js', '.mjs') })) {
        & node --check $file.FullName
        if ($LASTEXITCODE -ne 0) { throw "$package syntax check failed; profile has not been changed." }
    }
}
foreach ($package in $packages) {
    & (Join-Path $PSScriptRoot "$package\install-to-dsh.ps1")
    if ($LASTEXITCODE -ne 0) { throw "$package installation failed." }
}
Write-Host 'Both plugins installed. Run dsh web, then refresh your browser.'
