"""
Shared FUB API operations for FUB Stage Tracker
Used by both webhook server and polling collector
"""

import requests
import base64
import json
import logging
from typing import Optional, Dict, Any, List
from ..config.settings import fub_config

logger = logging.getLogger(__name__)

class FUBApiClient:
    """Centralized FUB API client"""
    
    def __init__(self):
        self.api_key = fub_config.api_key
        self.system_key = fub_config.system_key
        self.base_url = fub_config.api_base_url
        self.system_name = fub_config.system_name
    
    def get_headers(self, include_system_key: bool = True) -> Dict[str, str]:
        """Get FUB API headers"""
        if not self.api_key:
            raise ValueError("FUB_API_KEY not configured")
        
        headers = {
            "Authorization": f"Basic {base64.b64encode(f'{self.api_key}:'.encode()).decode()}",
            "Content-Type": "application/json",
            "X-System": self.system_name
        }
        
        if include_system_key and self.system_key:
            headers["X-System-Key"] = self.system_key
        
        return headers
    
    def get_person(self, person_id: str, include_custom_fields: bool = True) -> Optional[Dict[str, Any]]:
        """Get person data from FUB API"""
        try:
            url = f"{self.base_url}/people/{person_id}"
            if include_custom_fields:
                url += "?fields=allFields"
            
            response = requests.get(
                url, 
                headers=self.get_headers(), 
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to fetch person {person_id}: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error fetching person {person_id}: {e}")
            return None
    
    def get_people_batch(self, limit: int = 100, offset: int = 0, 
                        updated_since: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get batch of people from FUB API"""
        try:
            params = {
                'limit': limit,
                'offset': offset,
                'fields': 'allFields'
            }
            
            if updated_since:
                params['updatedAfter'] = updated_since
            
            response = requests.get(
                f"{self.base_url}/people",
                headers=self.get_headers(),
                params=params,
                timeout=60
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Failed to fetch people batch: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error fetching people batch: {e}")
            return None
    
    def register_webhook(self, event: str, webhook_url: str) -> bool:
        """Register webhook with FUB"""
        try:
            response = requests.post(
                f"{self.base_url}/webhooks",
                headers=self.get_headers(),
                json={
                    'event': event,
                    'url': webhook_url
                },
                timeout=30
            )
            
            if response.status_code == 201:
                webhook_data = response.json()
                logger.info(f"Successfully registered {event} webhook (ID: {webhook_data.get('id')})")
                return True
            elif response.status_code == 400 and "already exists" in response.text.lower():
                logger.info(f"{event} webhook already exists")
                return True
            else:
                logger.error(f"Failed to register {event} webhook: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error registering {event} webhook: {e}")
            return False
    
    def list_webhooks(self) -> List[Dict[str, Any]]:
        """List existing webhooks"""
        try:
            response = requests.get(
                f"{self.base_url}/webhooks",
                headers=self.get_headers(),
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get('webhooks', [])
            else:
                logger.error(f"Failed to list webhooks: {response.status_code} - {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error listing webhooks: {e}")
            return []

def extract_custom_fields(person: Dict[str, Any]) -> Dict[str, Any]:
    """Extract custom fields from person data"""
    return {
        'campaign_id': person.get('customCampaignID'),
        'who_pushed_lead': person.get('customWhoPushedTheLead'),
        'parcel_county': person.get('customParcelCounty'),
        'parcel_state': person.get('customParcelState')
    }

def extract_lead_source_tag(tags: List[str]) -> Optional[str]:
    """Extract lead source from tags"""
    if not tags or not isinstance(tags, list):
        return None
    
    if "ReadyMode" in tags:
        return "ReadyMode"
    elif "Roor" in tags:
        return "Roor"
    
    return None

def create_stage_change_record(person: Dict[str, Any], stage_from: Optional[str], 
                              stage_to: str, source: str) -> Dict[str, Any]:
    """Create standardized stage change record"""
    import datetime
    import time
    
    custom_fields = extract_custom_fields(person)
    lead_source_tag = extract_lead_source_tag(person.get('tags', []))
    
    return {
        'person_id': str(person.get('id')),
        'deal_id': person.get('dealId'),
        'first_name': person.get('firstName'),
        'last_name': person.get('lastName'),
        'stage_from': stage_from,
        'stage_to': stage_to,
        'changed_at': datetime.datetime.utcnow(),
        'received_at': datetime.datetime.utcnow(),
        'source': source,
        'event_id': f"{source}_{person.get('id')}_{stage_to.replace(' ', '_').replace('-', '_')}_{int(time.time())}",
        'raw_payload': json.dumps(person),
        'campaign_id': custom_fields['campaign_id'],
        'who_pushed_lead': custom_fields['who_pushed_lead'],
        'parcel_county': custom_fields['parcel_county'],
        'parcel_state': custom_fields['parcel_state'],
        'lead_source_tag': lead_source_tag
    }

# Global API client instance
fub_api = FUBApiClient()