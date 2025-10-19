# compile.ps1
# Sets Node heap and runs the compile script, forwarding exit code.

$env:NODE_OPTIONS = "--max-old-space-size=4096"

Write-Host "NODE_OPTIONS=$env:NODE_OPTIONS"
npm run compile
$LASTEXITCODE | Out-Null
exit $LASTEXITCODE
