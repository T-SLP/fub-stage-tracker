# Shared Utilities

Common utilities used across all FUB Stage Tracker Python scripts to eliminate code duplication and ensure consistency.

## Components

### fub_api.py
**FUBApiClient** - Centralized FUB API client with:
- Automatic authentication handling
- Common API methods (get_person, search_people, etc.)
- Webhook management (list, register, delete)
- Consistent error handling and logging

### database.py  
**DatabaseClient** - Centralized database operations with:
- Connection management and pooling
- Context managers for safe operations
- Common queries (stage changes, offers made, etc.)
- Transaction handling and error recovery

## Usage Examples

### FUB API Client
```python
from shared.fub_api import get_fub_client

# Get a configured client
fub = get_fub_client()

# Search for a person
people = fub.search_by_name("John", "Doe")

# Get recent activity
recent = fub.get_recent_people("2025-09-08T00:00:00Z")

# Manage webhooks
webhooks = fub.list_webhooks()
```

### Database Client
```python
from shared.database import get_db_client

# Get a configured client
db = get_db_client()

# Get stage changes for a person
changes = db.get_stage_changes(person_id="12345")

# Insert a new stage change
db.insert_stage_change(
    person_id="12345",
    person_name="John Doe", 
    stage_from="Lead",
    stage_to="Qualified",
    changed_at="2025-09-09T12:00:00Z"
)

# Check recent offers
offers = db.get_offers_made_today()
```

## Benefits

- **Consistency**: All scripts use the same authentication and connection patterns
- **Maintainability**: Changes to API keys, URLs, or connection strings only need to be updated in one place
- **Error Handling**: Centralized error handling and logging
- **Performance**: Connection pooling and optimized queries
- **Security**: Centralized credential management