"""
Configuration for Lead Daily Hot Sheet
Define contact frequency rules for each stage
"""

# Stage-specific contact frequency rules
# Based on: G:\My Drive\Acquisition Team Folder\Acquisition Manager\Reference Material\Lead Pipeline Contact Frequency Rules.csv
#
# Format: 'Stage Name': {
#     'threshold_hours': hours since last communication before flagging,
#     'rule_description': what action should be taken,
#     'special_logic': optional function name for custom logic
# }
STAGE_CONTACT_RULES = {
    'ACQ - Qualified': {
        'threshold_hours': 12,  # Double dial twice per day (every 12 hours)
        'rule_description': 'Double dial twice per day',
        'priority': 'high'
    },
    'Qualified Phase 2 - Day 3 to 2 Weeks': {
        'threshold_hours': 24,  # Double dial once every day
        'rule_description': 'Double dial daily',
        'priority': 'high'
    },
    'Qualified Phase 3 - 2 Weeks to 4 Weeks': {
        'threshold_hours': None,  # Special Tuesday/Thursday logic
        'rule_description': 'Double dial twice per week (Tuesday and Thursday)',
        'special_logic': 'check_tuesday_thursday',
        'priority': 'medium'
    },
    'ACQ - Needs Offer': {
        'threshold_hours': 48,  # Should not remain more than 2 days
        'rule_description': 'Prepare offer - should not remain in stage >2 days',
        'priority': 'critical'
    },
    'ACQ - Offers Made': {
        'threshold_hours': 96,  # Put on list after 4 days old (4 days * 24 hours)
        'rule_description': 'Follow up on offer sent',
        'priority': 'high'
    },
    'ACQ - Contract Sent': {
        'threshold_hours': 96,  # Put on list after 4 days old
        'rule_description': 'Follow up on contract sent',
        'priority': 'high'
    },
}

# Priority levels for hot sheet display
# Maps stage priority to display order and styling
PRIORITY_LEVELS = {
    'critical': {'order': 1, 'label': '[CRITICAL]'},
    'high': {'order': 2, 'label': '[HIGH]'},
    'medium': {'order': 3, 'label': '[MEDIUM]'},
    'low': {'order': 4, 'label': '[LOW]'}
}

# Email report settings
EMAIL_SUBJECT = 'Daily Lead Hot Sheet - Overdue Contact Report'
EMAIL_SEND_TIME = '08:00'  # Time to send report (24-hour format, Eastern Time)

# Report format preferences
INCLUDE_CAMPAIGN_INFO = True
INCLUDE_CONTACT_HISTORY = True
INCLUDE_CUSTOM_FIELDS = [
    'customCampaignID',
    'customWhoPushedTheLead',
    'customParcelCounty',
    'customParcelState',
    'customAcreage',
    'customRoadFrontageFT',
    'customMarketTotalParcelValue',
    'customMarketValueEstimate',
    'customMarketValueEstimateConfidence'
]

# Exclusion rules - stages to completely ignore
EXCLUDE_STAGES = [
    'Contact Upload',
    'ACQ - Dead / DNC',
    'ACQ - Closed Won',
    'ACQ - Closed Lost'
]

# Fetch optimization: Only fetch leads in stages we care about
# This dramatically speeds up the script by filtering at the API level
# Set to None to fetch all stages, or list specific stages to fetch
FETCH_ONLY_STAGES = list(STAGE_CONTACT_RULES.keys())  # Only fetch stages with contact rules

# Business days only? (Skip weekends for contact frequency calculations)
USE_BUSINESS_DAYS_ONLY = True

# Stages that should show dials/connections since offer columns
OFFER_STAGES = ['ACQ - Offers Made', 'ACQ - Contract Sent']

# Deal stages - show ALL leads (not just overdue) for complete pipeline visibility
# These are later-stage, higher-value leads where managers want full visibility
SHOW_ALL_LEADS_STAGES = ['ACQ - Needs Offer', 'ACQ - Offers Made', 'ACQ - Contract Sent']
