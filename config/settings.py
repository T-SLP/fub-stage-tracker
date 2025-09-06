"""
Shared configuration for FUB Stage Tracker
Centralizes environment variables and settings used by both webhook and polling systems
"""

import os
from typing import Optional

class FUBConfig:
    """FUB API Configuration"""
    
    @property
    def api_key(self) -> Optional[str]:
        return os.getenv("FUB_API_KEY")
    
    @property
    def system_key(self) -> Optional[str]:
        return os.getenv("FUB_SYSTEM_KEY")
    
    @property
    def api_base_url(self) -> str:
        return "https://api.followupboss.com/v1"
    
    @property
    def system_name(self) -> str:
        return "SynergyFUBLeadMetrics"

class DatabaseConfig:
    """Database Configuration"""
    
    @property
    def url(self) -> Optional[str]:
        return os.getenv("SUPABASE_DB_URL")
    
    @property
    def ssl_mode(self) -> str:
        return "require"

class WebhookConfig:
    """Webhook Server Configuration"""
    
    @property
    def base_url(self) -> Optional[str]:
        return os.getenv("WEBHOOK_BASE_URL")
    
    @property
    def port(self) -> int:
        return int(os.getenv("PORT", os.getenv("WEBHOOK_PORT", 5000)))
    
    @property
    def queue_size(self) -> int:
        return 10000
    
    @property
    def dedup_window_seconds(self) -> int:
        return 30

class PollingConfig:
    """Polling Collector Configuration"""
    
    @property
    def interval_seconds(self) -> int:
        return int(os.getenv("POLLING_INTERVAL", 1800))  # Default 30 minutes
    
    @property
    def max_retries(self) -> int:
        return 3
    
    @property
    def batch_size(self) -> int:
        return 100
    
    @property
    def lookback_days(self) -> int:
        return int(os.getenv("POLLING_LOOKBACK_DAYS", 7))

# Global configuration instances
fub_config = FUBConfig()
db_config = DatabaseConfig()
webhook_config = WebhookConfig()
polling_config = PollingConfig()

# Standard FUB Stages for validation
STANDARD_FUB_STAGES = [
    "Contact Upload", 
    "ACQ - New Lead", 
    "ACQ - Attempted Contact",
    "ACQ - Contacted", 
    "ACQ - Qualified", 
    "ACQ - Offers Made",
    "ACQ - Price Motivated", 
    "ACQ - Under Contract", 
    "ACQ - Closed Won",
    "ACQ - Closed Lost", 
    "ACQ - On Hold", 
    "ACQ - Not Qualified",
    "ACQ - Offer Not Accepted"
]

def validate_configuration() -> list:
    """Validate all required configuration is present"""
    errors = []
    
    if not fub_config.api_key:
        errors.append("FUB_API_KEY environment variable is required")
    
    if not db_config.url:
        errors.append("SUPABASE_DB_URL environment variable is required")
    
    return errors

def get_stage_priority(stage_name: str) -> int:
    """Get stage priority for sorting/comparison"""
    try:
        return STANDARD_FUB_STAGES.index(stage_name)
    except ValueError:
        return 999  # Unknown stages get lowest priority