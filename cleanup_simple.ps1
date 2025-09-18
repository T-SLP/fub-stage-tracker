# FUB Stage Tracker - Simple Cleanup Script
Set-Location "C:\Users\troge\fub-stage-tracker"

Write-Host "Starting cleanup of unused files..." -ForegroundColor Green

# Create backup directory
Write-Host "Creating backup directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path ".\cleanup_backup" -Force | Out-Null

Write-Host "`n=== Removing Duplicate Dashboard Files ===" -ForegroundColor Cyan

# Remove duplicate directories
if (Test-Path ".\components") {
    Copy-Item -Path ".\components" -Destination ".\cleanup_backup\components" -Recurse -Force
    Remove-Item -Path ".\components" -Recurse -Force
    Write-Host "✓ Removed duplicate components/ directory" -ForegroundColor Gray
}

if (Test-Path ".\utils") {
    Copy-Item -Path ".\utils" -Destination ".\cleanup_backup\utils" -Recurse -Force
    Remove-Item -Path ".\utils" -Recurse -Force
    Write-Host "✓ Removed duplicate utils/ directory" -ForegroundColor Gray
}

if (Test-Path ".\styles") {
    Copy-Item -Path ".\styles" -Destination ".\cleanup_backup\styles" -Recurse -Force
    Remove-Item -Path ".\styles" -Recurse -Force
    Write-Host "✓ Removed duplicate styles/ directory" -ForegroundColor Gray
}

Write-Host "`n=== Removing Debug Files ===" -ForegroundColor Cyan

# Debug files pattern
$debugFiles = Get-ChildItem -Path "." -Name "debug-*.js"
foreach ($file in $debugFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination ".\cleanup_backup\$file" -Force
        Remove-Item -Path $file -Force
        Write-Host "✓ Removed $file" -ForegroundColor Gray
    }
}

# Test files pattern
$testFiles = Get-ChildItem -Path "." -Name "test-*.js"
foreach ($file in $testFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination ".\cleanup_backup\$file" -Force
        Remove-Item -Path $file -Force
        Write-Host "✓ Removed $file" -ForegroundColor Gray
    }
}

# Check files pattern
$checkFiles = Get-ChildItem -Path "." -Name "check-*.js"
foreach ($file in $checkFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination ".\cleanup_backup\$file" -Force
        Remove-Item -Path $file -Force
        Write-Host "✓ Removed $file" -ForegroundColor Gray
    }
}

Write-Host "`n=== Removing Other Analysis Files ===" -ForegroundColor Cyan

$analysisFiles = @(
    "audit-data-manipulations.js",
    "verify-api-fix.js",
    "verify-price-motivated-chart-dates.js",
    "verify-system-robustness.js",
    "verify-timestamp-fixes.js",
    "investigate-offer-journeys.js",
    "investigate-webhook-activity.js",
    "investigate-wednesday-data.js",
    "monitor-realtime.js",
    "examine-schema.js",
    "examine-webhook-data.js",
    "run-historical-polling.js",
    "simple-diagnostic.js",
    "diagnostic-test-suite.js",
    "diagnose-varchar-error.js"
)

foreach ($file in $analysisFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination ".\cleanup_backup\$file" -Force
        Remove-Item -Path $file -Force
        Write-Host "✓ Removed $file" -ForegroundColor Gray
    }
}

Write-Host "`n=== Removing Fix Files ===" -ForegroundColor Cyan

$fixFiles = @(
    "add-constraint-simple.js",
    "apply-robustness-improvements.js",
    "fix-event-id-constraint.js",
    "fix-existing-timestamps.js",
    "fix-james-beavers-timestamp.js",
    "fix-source-field-length.js",
    "fix-stage-field-lengths.js",
    "simple-constraint-fix.js"
)

foreach ($file in $fixFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination ".\cleanup_backup\$file" -Force
        Remove-Item -Path $file -Force
        Write-Host "✓ Removed $file" -ForegroundColor Gray
    }
}

Write-Host "`n=== Removing Legacy Python Files ===" -ForegroundColor Cyan

$legacyPythonFiles = @(
    "debug_custom_fields.py",
    "debug_fub_data.py",
    "debug-webhooks.py",
    "debug-webhooks-optimized.py",
    "fix-webhook-lead-source-processing.py",
    "fix-webhooks.py",
    "fix-webhooks-optimized.py",
    "populate_custom_fields.py",
    "full_person_check.py",
    "test_all_fields.py",
    "fub_webhook_server.py.old"
)

foreach ($file in $legacyPythonFiles) {
    if (Test-Path $file) {
        Copy-Item -Path $file -Destination ".\cleanup_backup\$file" -Force
        Remove-Item -Path $file -Force
        Write-Host "✓ Removed $file" -ForegroundColor Gray
    }
}

Write-Host "`n=== Removing Alternative Implementations ===" -ForegroundColor Cyan

if (Test-Path "webhook-server.js") {
    Copy-Item -Path "webhook-server.js" -Destination ".\cleanup_backup\webhook-server.js" -Force
    Remove-Item -Path "webhook-server.js" -Force
    Write-Host "✓ Removed webhook-server.js" -ForegroundColor Gray
}

if (Test-Path "=5.8.0") {
    Copy-Item -Path "=5.8.0" -Destination ".\cleanup_backup\=5.8.0" -Force
    Remove-Item -Path "=5.8.0" -Force
    Write-Host "✓ Removed =5.8.0 artifact file" -ForegroundColor Gray
}

Write-Host "`n=== Archiving Testing Tools ===" -ForegroundColor Cyan

if (Test-Path "testing-tools") {
    Copy-Item -Path "testing-tools" -Destination ".\cleanup_backup\testing-tools" -Recurse -Force
    Remove-Item -Path "testing-tools" -Recurse -Force
    Write-Host "✓ Archived testing-tools directory" -ForegroundColor Gray
}

Write-Host "`n=== CLEANUP COMPLETED ===" -ForegroundColor Green
Write-Host "Backup location: .\cleanup_backup\" -ForegroundColor Yellow
Write-Host "To restore files: Copy from backup back to main directory" -ForegroundColor Cyan
Write-Host "Repository cleaned successfully!" -ForegroundColor Green