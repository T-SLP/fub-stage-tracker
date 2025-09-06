"""
Shared database operations for FUB Stage Tracker
Used by both webhook server and polling collector
"""

import psycopg2
import psycopg2.extras
import logging
from typing import Optional, Dict, Any, List
from contextlib import contextmanager
from .settings import db_config

logger = logging.getLogger(__name__)

class DatabaseManager:
    """Centralized database operations"""
    
    def __init__(self):
        self.connection_string = db_config.url
        self.ssl_mode = db_config.ssl_mode
    
    @contextmanager
    def get_connection(self):
        """Get database connection with automatic cleanup"""
        conn = None
        try:
            conn = psycopg2.connect(self.connection_string, sslmode=self.ssl_mode)
            yield conn
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    def get_person_last_stage(self, person_id: str) -> Optional[Dict[str, Any]]:
        """Get person's most recent stage change"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.execute("""
                    SELECT stage_to, changed_at, source
                    FROM stage_changes 
                    WHERE person_id = %s 
                    ORDER BY changed_at DESC 
                    LIMIT 1
                """, (person_id,))
                
                result = cur.fetchone()
                return dict(result) if result else None
    
    def insert_stage_change_if_not_exists(self, stage_data: Dict[str, Any]) -> bool:
        """Insert stage change only if it doesn't already exist (deduplication)"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Check if similar record exists within 5-minute window
                cur.execute("""
                    SELECT COUNT(*) FROM stage_changes 
                    WHERE person_id = %(person_id)s 
                    AND stage_to = %(stage_to)s 
                    AND ABS(EXTRACT(EPOCH FROM (changed_at - %(changed_at)s))) < 300
                """, stage_data)
                
                exists = cur.fetchone()[0] > 0
                
                if not exists:
                    query = """
                        INSERT INTO stage_changes (
                            person_id, deal_id, first_name, last_name,
                            stage_from, stage_to, changed_at, received_at,
                            source, event_id, raw_payload,
                            campaign_id, who_pushed_lead, parcel_county, 
                            parcel_state, lead_source_tag
                        ) VALUES (
                            %(person_id)s, %(deal_id)s, %(first_name)s, %(last_name)s,
                            %(stage_from)s, %(stage_to)s, %(changed_at)s, %(received_at)s,
                            %(source)s, %(event_id)s, %(raw_payload)s,
                            %(campaign_id)s, %(who_pushed_lead)s, %(parcel_county)s,
                            %(parcel_state)s, %(lead_source_tag)s
                        )
                        ON CONFLICT (event_id) DO NOTHING
                    """
                    
                    cur.execute(query, stage_data)
                    conn.commit()
                    
                    logger.info(f"Inserted stage change: {stage_data.get('first_name')} {stage_data.get('last_name')} -> {stage_data.get('stage_to')}")
                    return True
                else:
                    logger.debug(f"Stage change already exists, skipping: {stage_data.get('person_id')} -> {stage_data.get('stage_to')}")
                    return False
    
    def get_recent_activity_summary(self, hours: int = 24) -> List[Dict[str, Any]]:
        """Get recent activity summary by source"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.execute("""
                    SELECT 
                        source,
                        COUNT(*) as record_count,
                        MAX(changed_at) as latest_change,
                        MAX(received_at) as latest_received
                    FROM stage_changes 
                    WHERE received_at >= NOW() - INTERVAL '%s hours'
                    GROUP BY source 
                    ORDER BY record_count DESC
                """, (hours,))
                
                return [dict(row) for row in cur.fetchall()]
    
    def ensure_enhanced_schema(self, cursor):
        """Ensure database schema supports enhanced tracking"""
        try:
            # Check if enhanced columns exist
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'stage_changes' 
                AND column_name IN (
                    'time_in_previous_stage_days',
                    'time_in_previous_stage_hours', 
                    'time_in_previous_stage_minutes',
                    'previous_stage_entered_at',
                    'stage_priority_from',
                    'stage_priority_to',
                    'is_forward_progression'
                )
            """)
            
            existing_columns = {row[0] for row in cursor.fetchall()}
            required_columns = {
                'time_in_previous_stage_days',
                'time_in_previous_stage_hours',
                'time_in_previous_stage_minutes',
                'previous_stage_entered_at',
                'stage_priority_from',
                'stage_priority_to',
                'is_forward_progression'
            }
            
            missing_columns = required_columns - existing_columns
            
            # Add missing columns
            for column in missing_columns:
                if 'time_in_previous_stage' in column and column.endswith(('_days', '_hours', '_minutes')):
                    cursor.execute(f"ALTER TABLE stage_changes ADD COLUMN IF NOT EXISTS {column} NUMERIC DEFAULT 0")
                elif column == 'previous_stage_entered_at':
                    cursor.execute(f"ALTER TABLE stage_changes ADD COLUMN IF NOT EXISTS {column} TIMESTAMP")
                elif 'stage_priority' in column:
                    cursor.execute(f"ALTER TABLE stage_changes ADD COLUMN IF NOT EXISTS {column} INTEGER DEFAULT 999")
                elif column == 'is_forward_progression':
                    cursor.execute(f"ALTER TABLE stage_changes ADD COLUMN IF NOT EXISTS {column} BOOLEAN DEFAULT TRUE")
            
            if missing_columns:
                logger.info(f"Added missing database columns: {missing_columns}")
                
        except Exception as e:
            logger.warning(f"Could not ensure enhanced schema: {e}")

# Global database manager instance
db_manager = DatabaseManager()