"""
Database utilities for consistent database connections and operations
"""
import os
import psycopg2
from psycopg2 import pool
from contextlib import contextmanager
from typing import Optional, List, Dict, Any, Union

class DatabaseClient:
    """Centralized database client with connection pooling"""
    
    def __init__(self, db_url: Optional[str] = None):
        self.db_url = db_url or os.getenv(
            'SUPABASE_DB_URL', 
            'postgresql://postgres.mxxdnmvwtxcjdfagdidj:Synergy2024!@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
        )
        self._pool = None
    
    def get_connection(self):
        """Get a database connection"""
        try:
            return psycopg2.connect(self.db_url)
        except Exception as e:
            print(f"Database connection error: {e}")
            raise
    
    @contextmanager
    def get_cursor(self):
        """Context manager for database operations"""
        conn = None
        cursor = None
        try:
            conn = self.get_connection()
            cursor = conn.cursor()
            yield cursor
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            print(f"Database operation error: {e}")
            raise
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
    
    def execute_query(self, query: str, params: Optional[tuple] = None) -> List[tuple]:
        """Execute a SELECT query and return results"""
        with self.get_cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall()
    
    def execute_update(self, query: str, params: Optional[tuple] = None) -> int:
        """Execute an INSERT/UPDATE/DELETE query and return affected rows"""
        with self.get_cursor() as cursor:
            cursor.execute(query, params)
            return cursor.rowcount
    
    def get_stage_changes(self, person_id: Optional[str] = None, 
                         since_date: Optional[str] = None,
                         limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get stage changes with optional filters"""
        query = '''
            SELECT person_id, person_name, stage_from, stage_to, changed_at,
                   time_in_previous_stage_days, time_in_previous_stage_hours,
                   time_in_previous_stage_minutes, campaign_id, lead_source_tag
            FROM stage_changes 
            WHERE 1=1
        '''
        params = []
        
        if person_id:
            query += ' AND person_id = %s'
            params.append(person_id)
        
        if since_date:
            query += ' AND changed_at >= %s'
            params.append(since_date)
        
        query += ' ORDER BY changed_at DESC'
        
        if limit:
            query += ' LIMIT %s'
            params.append(limit)
        
        results = self.execute_query(query, tuple(params) if params else None)
        
        # Convert to dictionaries
        columns = ['person_id', 'person_name', 'stage_from', 'stage_to', 'changed_at',
                  'time_in_previous_stage_days', 'time_in_previous_stage_hours', 
                  'time_in_previous_stage_minutes', 'campaign_id', 'lead_source_tag']
        
        return [dict(zip(columns, row)) for row in results]
    
    def insert_stage_change(self, person_id: str, person_name: str, 
                           stage_from: str, stage_to: str, changed_at: str,
                           **kwargs) -> bool:
        """Insert a new stage change record"""
        try:
            query = '''
                INSERT INTO stage_changes 
                (person_id, person_name, stage_from, stage_to, changed_at,
                 time_in_previous_stage_days, time_in_previous_stage_hours,
                 time_in_previous_stage_minutes, campaign_id, lead_source_tag,
                 stage_priority, is_forward_progression)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            '''
            
            params = (
                person_id, person_name, stage_from, stage_to, changed_at,
                kwargs.get('time_in_previous_stage_days', 0),
                kwargs.get('time_in_previous_stage_hours', 0), 
                kwargs.get('time_in_previous_stage_minutes', 0),
                kwargs.get('campaign_id'),
                kwargs.get('lead_source_tag'),
                kwargs.get('stage_priority', 0),
                kwargs.get('is_forward_progression', True)
            )
            
            self.execute_update(query, params)
            return True
        except Exception as e:
            print(f"Error inserting stage change: {e}")
            return False
    
    def check_person_exists(self, person_id: str) -> bool:
        """Check if person has any stage changes recorded"""
        query = 'SELECT COUNT(*) FROM stage_changes WHERE person_id = %s'
        result = self.execute_query(query, (person_id,))
        return result[0][0] > 0 if result else False
    
    def get_offers_made_today(self) -> List[Dict[str, Any]]:
        """Get people currently in 'ACQ - Offers Made' stage"""
        query = '''
            SELECT DISTINCT person_id, person_name, changed_at
            FROM stage_changes 
            WHERE stage_to = 'ACQ - Offers Made'
            AND DATE(changed_at) = CURRENT_DATE
            ORDER BY changed_at DESC
        '''
        
        results = self.execute_query(query)
        columns = ['person_id', 'person_name', 'changed_at']
        return [dict(zip(columns, row)) for row in results]

# Convenience function for scripts that need a quick database client
def get_db_client() -> DatabaseClient:
    """Get a configured database client"""
    return DatabaseClient()