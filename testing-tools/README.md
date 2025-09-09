# Testing Tools

Python scripts for testing, validation, and debugging of the FUB Stage Tracker system.

## Post-Deployment Testing
- **post_deployment_test.py** - Comprehensive post-deployment validation
- **validate_fixes.py** - Validation of system fixes and corrections

## Database Testing
- **test_direct_database_capture.py** - Direct database capture testing
- **test_rapid_stage_capture.py** - Rapid stage transition capture testing

## Webhook Testing
- **test_live_webhook_server.py** - Live webhook server functionality testing  
- **test_webhook_fixes.py** - Webhook system fixes validation

## Data Synchronization
- **fix_missing_stage_sync.py** - Fix missing stage synchronization issues
- **fub_sync_missing_stages.py** - Comprehensive FUB stage synchronization
- **quick_fix_rose_gary.py** - Specific lead fix utility

## Usage

Most scripts require environment variables:
- `FUB_API_KEY` - Your Follow Up Boss API key
- `SUPABASE_DB_URL` - Database connection string  
- `FUB_SYSTEM_KEY` - FUB system key

Run scripts from the project root directory:
```bash
cd /path/to/fub-stage-tracker
python testing-tools/script_name.py
```