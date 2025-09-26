# FUB Stage Tracker - Cleanup Unused Files
# This script removes identified unused files while preserving core functionality

# Set location
Set-Location "C:\Users\troge\fub-stage-tracker"

Write-Host "Starting cleanup of unused files..." -ForegroundColor Green

# Create backup directory first
Write-Host "Creating backup directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path ".\cleanup_backup" -Force

# Function to safely remove files/directories
function Remove-SafelyWithBackup {
    param($Path, $Description)

    if (Test-Path $Path) {
        Write-Host "Removing: $Description" -ForegroundColor Yellow
        # Create backup
        $backupPath = ".\cleanup_backup\$(Split-Path $Path -Leaf)"
        if (Test-Path $Path -PathType Container) {
            Copy-Item -Path $Path -Destination $backupPath -Recurse -Force
        } else {
            Copy-Item -Path $Path -Destination $backupPath -Force
        }
        # Remove original
        Remove-Item -Path $Path -Recurse -Force
        Write-Host "  ✓ Removed and backed up: $Path" -ForegroundColor Gray
    } else {
        Write-Host "  - Not found: $Path" -ForegroundColor Gray
    }
}

Write-Host "`n=== CATEGORY 1: Duplicate Dashboard Files ===" -ForegroundColor Cyan

# Remove duplicate component directories (these exist in dashboard/ already)
Remove-SafelyWithBackup ".\components" "Duplicate components directory"
Remove-SafelyWithBackup ".\utils" "Duplicate utils directory"
Remove-SafelyWithBackup ".\styles" "Duplicate styles directory"

Write-Host "`n=== CATEGORY 2: Debug/Test JavaScript Files ===" -ForegroundColor Cyan

# Debug files
$debugFiles = @(
    "debug-offers-made.js",
    "debug-campaign-chart-data.js",
    "debug-chart-date-plotting.js",
    "debug-chart-dates.js",
    "debug-current-dashboard-state.js",
    "debug-current-issues.js",
    "debug-dashboard-timerange.js",
    "debug-lead-source-data.js",
    "debug-live-dashboard.js",
    "debug-september-2-chart-dates.js",
    "debug-september-2-price-motivated.js",
    "debug-specific-offers.js",
    "debug-throwaway-timestamps.js",
    "debug-timezone-issue.js",
    "debug-webhook-processing.js"
)

foreach ($file in $debugFiles) {
    Remove-SafelyWithBackup ".\$file" "Debug file: $file"
}

# Test files
$testFiles = @(
    "test-30-day-time-to-offer.js",
    "test-all-metrics-alignment.js",
    "test-avg-time-to-offer.js",
    "test-dashboard-api.js",
    "test-dashboard-time-to-offer.js",
    "test-date-calculation.js",
    "test-date-fix.js",
    "test-eastern-time.js",
    "test-getdaterange.js",
    "test-net-stage-tracking.js",
    "test-pipeline-velocity.js",
    "test-polling-filter.js",
    "test-recent-activity-fix.js",
    "test-timezone-fix.js"
)

foreach ($file in $testFiles) {
    Remove-SafelyWithBackup ".\$file" "Test file: $file"
}

# Check/Audit/Verify files
$checkFiles = @(
    "check-activity-table-timestamps.js",
    "check-constraints.js",
    "check-dashboard-discrepancy.js",
    "check-immediate-webhook-result.js",
    "check-last-3-days.js",
    "check-latest-todd-changes.js",
    "check-live-stage-change.js",
    "check-missing-historical-offers.js",
    "check-monday-events.js",
    "check-recent-offers-made.js",
    "check-wednesday-sources.js",
    "audit-data-manipulations.js",
    "verify-api-fix.js",
    "verify-price-motivated-chart-dates.js",
    "verify-system-robustness.js",
    "verify-timestamp-fixes.js"
)

foreach ($file in $checkFiles) {
    Remove-SafelyWithBackup ".\$file" "Check/Audit file: $file"
}

# Other analysis files
$analysisFiles = @(
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
    Remove-SafelyWithBackup ".\$file" "Analysis file: $file"
}

Write-Host "`n=== CATEGORY 3: Fix/Apply JavaScript Files ===" -ForegroundColor Cyan

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
    Remove-SafelyWithBackup ".\$file" "Fix file: $file"
}

Write-Host "`n=== CATEGORY 4: Legacy Python Files ===" -ForegroundColor Cyan

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
    Remove-SafelyWithBackup ".\$file" "Legacy Python file: $file"
}

Write-Host "`n=== CATEGORY 5: Alternative/Unused Implementations ===" -ForegroundColor Cyan

Remove-SafelyWithBackup ".\webhook-server.js" "Unused Express webhook server"
Remove-SafelyWithBackup ".\=5.8.0" "Artifact file"

Write-Host "`n=== CATEGORY 6: Utility Scripts (Keep in Archive) ===" -ForegroundColor Cyan

# Move testing-tools to archive instead of deleting
if (Test-Path ".\testing-tools") {
    Write-Host "Archiving testing-tools directory..." -ForegroundColor Yellow
    Move-Item -Path ".\testing-tools" -Destination ".\cleanup_backup\testing-tools-archive"
    Write-Host "  ✓ Moved testing-tools to cleanup_backup\testing-tools-archive" -ForegroundColor Gray
}

Write-Host "`n=== CLEANUP SUMMARY ===" -ForegroundColor Green
Write-Host "Files have been removed and backed up to: .\cleanup_backup\" -ForegroundColor Yellow
Write-Host "Core functionality preserved:" -ForegroundColor Green
Write-Host "  ✓ dashboard/ directory (Next.js app)" -ForegroundColor Gray
Write-Host "  ✓ fub_stage_tracker.py (main polling)" -ForegroundColor Gray
Write-Host "  ✓ webhook-server/ (Python webhook server)" -ForegroundColor Gray
Write-Host "  ✓ shared/ (utilities)" -ForegroundColor Gray
Write-Host "  ✓ Configuration files" -ForegroundColor Gray
Write-Host "  ✓ Documentation files" -ForegroundColor Gray

Write-Host "`nTo restore any files: Copy from .\cleanup_backup\ back to main directory" -ForegroundColor Cyan
Write-Host "To permanently delete backup: Remove-Item .\cleanup_backup -Recurse -Force" -ForegroundColor Red

Write-Host "`nCleanup completed successfully!" -ForegroundColor Green