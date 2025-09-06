"""
Shared utility functions for FUB Stage Tracker
Used by both webhook server and polling collector
"""

import datetime
import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

def normalize_stage_name(stage: str) -> str:
    """Normalize stage name for consistency"""
    if not stage:
        return ""
    return stage.strip()

def is_valid_person_data(person: Dict[str, Any]) -> bool:
    """Validate that person data has required fields"""
    required_fields = ['id', 'stage']
    return all(field in person and person[field] is not None for field in required_fields)

def safe_get_nested(data: Dict[str, Any], keys: List[str], default: Any = None) -> Any:
    """Safely get nested dictionary value"""
    try:
        result = data
        for key in keys:
            result = result[key]
        return result
    except (KeyError, TypeError):
        return default

def format_person_name(person: Dict[str, Any]) -> str:
    """Format person's full name"""
    first_name = person.get('firstName', '').strip()
    last_name = person.get('lastName', '').strip()
    
    if first_name and last_name:
        return f"{first_name} {last_name}"
    elif first_name:
        return first_name
    elif last_name:
        return last_name
    else:
        return f"Person {person.get('id', 'Unknown')}"

def calculate_time_difference(from_time: datetime.datetime, to_time: datetime.datetime) -> Dict[str, float]:
    """Calculate time difference in days, hours, and minutes"""
    if not from_time or not to_time:
        return {'days': 0, 'hours': 0, 'minutes': 0}
    
    diff = to_time - from_time
    total_seconds = diff.total_seconds()
    
    days = total_seconds / 86400
    hours = total_seconds / 3600
    minutes = total_seconds / 60
    
    return {
        'days': round(days, 2),
        'hours': round(hours, 2),
        'minutes': round(minutes, 2)
    }

def sanitize_for_logging(data: Any, max_length: int = 200) -> str:
    """Sanitize data for safe logging"""
    try:
        if isinstance(data, dict):
            # Remove sensitive fields
            sanitized = {k: v for k, v in data.items() 
                        if not any(sensitive in k.lower() 
                                 for sensitive in ['password', 'token', 'key', 'secret'])}
            json_str = json.dumps(sanitized, default=str)
        else:
            json_str = json.dumps(data, default=str)
        
        if len(json_str) > max_length:
            return json_str[:max_length] + "..."
        return json_str
    except Exception:
        return str(data)[:max_length]

def validate_webhook_payload(payload: Dict[str, Any]) -> bool:
    """Validate webhook payload structure"""
    required_fields = ['event', 'data']
    if not all(field in payload for field in required_fields):
        return False
    
    event_data = payload.get('data', {})
    if not isinstance(event_data, dict):
        return False
    
    # Check for person data in the event
    person = event_data.get('person')
    if not person or not isinstance(person, dict):
        return False
    
    return is_valid_person_data(person)

def get_change_description(stage_from: Optional[str], stage_to: str, person_name: str) -> str:
    """Get human-readable change description"""
    if stage_from:
        return f"{person_name}: {stage_from} → {stage_to}"
    else:
        return f"{person_name}: Initial stage → {stage_to}"