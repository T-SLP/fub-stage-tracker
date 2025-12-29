# Weekly Agent Report Setup

## One-Time Setup Steps

### 1. Create a Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"
4. Create a service account:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "Service Account"
   - Name it something like "fub-report-writer"
   - Click "Create and Continue", then "Done"
5. Create a key for the service account:
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose JSON format
   - Download the JSON file (keep it safe, you'll need it)

### 2. Create Your Report Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it something like "Weekly Agent Reports"
4. Copy the spreadsheet ID from the URL:
   - URL looks like: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit`
   - Copy the part between `/d/` and `/edit`
5. Share the spreadsheet with your service account:
   - Click "Share" button
   - Paste the service account email (looks like `name@project.iam.gserviceaccount.com`)
   - Give it "Editor" access

### 3. Add GitHub Secrets

Go to your GitHub repo > Settings > Secrets and variables > Actions

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `SUPABASE_DB_URL` | Your Supabase PostgreSQL connection string (already in use) |
| `FUB_API_KEY` | Your Follow Up Boss API key (already in use) |
| `GOOGLE_SHEETS_CREDENTIALS` | The entire contents of the JSON key file from step 1 |
| `GOOGLE_SHEET_ID` | The spreadsheet ID from step 2 |

## Running the Report

### Automatic (Weekly)
The report runs automatically every Friday at 5 PM Eastern.

### Manual Trigger
1. Go to GitHub repo > Actions tab
2. Click "Weekly Agent Report" in the left sidebar
3. Click "Run workflow" button
4. Optionally change the number of days (default is 7)
5. Click "Run workflow"

### Local Testing
```bash
# Install dependencies
pip install -r reports/requirements.txt

# Set environment variables
export SUPABASE_DB_URL="your-connection-string"
export FUB_API_KEY="your-api-key"
export GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account",...}'
export GOOGLE_SHEET_ID="your-spreadsheet-id"

# Run with dry-run to test without writing to sheets
python reports/weekly_agent_report.py --dry-run

# Run for real
python reports/weekly_agent_report.py --days 7
```
