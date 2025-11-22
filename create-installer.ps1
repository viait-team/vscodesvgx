# This script builds the VS Code installer for Windows (x64 user setup).

# Exit on any error
$ErrorActionPreference = "Stop"

# --- Configuration ---
$BuildTask = "vscode-win32-x64"
$InstallerTask = "vscode-win32-x64-user-setup"
$InstallerDir = "installer"
$InstallerZipName = "VSCode-installer.zip"
$InstallerZipPath = Join-Path $InstallerDir $InstallerZipName
$SetupDir = ".build/win32-x64/user-setup"

# --- Build Steps ---
$env:NODE_OPTIONS = "--max-old-space-size=4096"
Write-Host "NODE_OPTIONS=$env:NODE_OPTIONS"

Write-Host "Installing dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "Dependencies installed."

Write-Host "Starting VS Code build..."
npm run gulp -- $BuildTask
if ($LASTEXITCODE -ne 0) {
    Write-Error "VS Code build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "VS Code build completed."

Write-Host "Building Inno Updater..."
npm run gulp -- vscode-win32-x64-inno-updater
if ($LASTEXITCODE -ne 0) {
    Write-Error "Inno Updater build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "Inno Updater build completed."

Write-Host "Creating installer..."
npm run gulp -- $InstallerTask
if ($LASTEXITCODE -ne 0) {
    Write-Error "Installer creation failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "Installer creation completed."

Write-Host "Finding installer executable..."
$InstallerExe = Get-ChildItem -Path $SetupDir -Filter "*.exe" | Select-Object -First 1
if (-not $InstallerExe) {
	Write-Error "Installer executable not found in $SetupDir"
	exit 1
}
Write-Host "Found installer: $($InstallerExe.FullName)"

Write-Host "Zipping installer..."
if (-not (Test-Path -Path $InstallerDir)) {
	New-Item -ItemType Directory -Path $InstallerDir
}
Compress-Archive -Path $InstallerExe.FullName -DestinationPath $InstallerZipPath -Force
Write-Host "Installer zipped to $InstallerZipPath"

Write-Host "Script finished successfully."
