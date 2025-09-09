"""
FUB API utilities for consistent authentication and request handling
"""
import os
import requests
import base64
from typing import Dict, Optional, Any

class FUBApiClient:
    """Centralized FUB API client with authentication and common methods"""
    
    def __init__(self, api_key: Optional[str] = None, system_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('FUB_API_KEY', 'fka_0DxOlS07NmHLDLVjKXB7N9qJyOSM4QtM2u')
        self.system_key = system_key or os.getenv('FUB_SYSTEM_KEY', '390b59dea776f1d5216843d3dfd5a127')
        self.base_url = 'https://api.followupboss.com/v1'
        self.session = requests.Session()
        self.session.headers.update(self._get_auth_headers())
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers for FUB API"""
        auth_string = base64.b64encode(f'{self.api_key}:'.encode()).decode()
        return {
            'Authorization': f'Basic {auth_string}',
            'X-System': 'SynergyFUBLeadMetrics',
            'X-System-Key': self.system_key,
            'Content-Type': 'application/json'
        }
    
    def get_person(self, person_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific person by ID"""
        try:
            response = self.session.get(f'{self.base_url}/people/{person_id}', timeout=30)
            if response.status_code == 200:
                return response.json()
            else:
                print(f"Error getting person {person_id}: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"Exception getting person {person_id}: {e}")
            return None
    
    def search_people(self, **params) -> list:
        """Search for people with given parameters"""
        try:
            response = self.session.get(f'{self.base_url}/people', params=params, timeout=30)
            if response.status_code == 200:
                return response.json().get('people', [])
            else:
                print(f"Error searching people: {response.status_code} - {response.text}")
                return []
        except Exception as e:
            print(f"Exception searching people: {e}")
            return []
    
    def search_by_name(self, first_name: str, last_name: str) -> list:
        """Search for person by first and last name"""
        return self.search_people(firstName=first_name, lastName=last_name)
    
    def get_recent_people(self, since_date: str) -> list:
        """Get people updated since a specific date"""
        return self.search_people(updated=since_date, sort='-updated')
    
    def list_webhooks(self) -> list:
        """List all registered webhooks"""
        try:
            response = self.session.get(f'{self.base_url}/webhooks', timeout=30)
            if response.status_code == 200:
                return response.json().get('webhooks', [])
            else:
                print(f"Error listing webhooks: {response.status_code} - {response.text}")
                return []
        except Exception as e:
            print(f"Exception listing webhooks: {e}")
            return []
    
    def register_webhook(self, event: str, url: str) -> Optional[Dict[str, Any]]:
        """Register a new webhook"""
        try:
            data = {"event": event, "url": url}
            response = self.session.post(f'{self.base_url}/webhooks', json=data, timeout=30)
            if response.status_code == 201:
                return response.json()
            else:
                print(f"Error registering webhook: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"Exception registering webhook: {e}")
            return None
    
    def delete_webhook(self, webhook_id: str) -> bool:
        """Delete a webhook by ID"""
        try:
            response = self.session.delete(f'{self.base_url}/webhooks/{webhook_id}', timeout=30)
            return response.status_code == 204
        except Exception as e:
            print(f"Exception deleting webhook {webhook_id}: {e}")
            return False

# Convenience function for scripts that need a quick client
def get_fub_client() -> FUBApiClient:
    """Get a configured FUB API client"""
    return FUBApiClient()