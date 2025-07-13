import requests
import psycopg2
import psycopg2.extras
import datetime
import json
import os

from urllib.parse import quote_plus

# === CONFIG ===
FUB_API_KEY = os.getenv("FUB_API_KEY")
FUB_SYSTEM_KEY = os.getenv("FUB_SYSTEM_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")

# === GET PEOPLE FROM FUB WITH PAGINATION ===
def fetch_all_people():
    url = "https://api.followupboss.com/v1/people"
    headers = {
        "Authorization": f"Basic {FUB_API_KEY}",
        "X-System": "SynergyFUBLeadMetrics",
        "X-System-Key": FUB_SYSTEM_KEY
    }
    people = []
    params = {"limit": 100}
    while url:
        resp = requests.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            print("Error fetching people:", resp.text)
            break
        data = resp.json()
        people.extend(data.get("people", []))
        url = data.get("_metadata", {}).get("next")
        if url:
            print(f"Fetching next page: {url}")
    print(f"Total people fetched from FUB: {len(people)}")
    return people

# === CONNECT TO SUPABASE POSTGRES ===
def get_connection():
    return psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

# === LOAD ALL LAST STAGES IN ONE QUERY ===
def load_all_last_stages(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (person_id) person_id, stage_to
            FROM stage_changes
            ORDER BY person_id, changed_at DESC
        """)
        return {str(row[0]): row[1] for row in cur.fetchall()}

# === MAIN LOGIC ===
def run_polling():
    print("Starting stage polling...")
    people = fetch_all_people()
    conn = get_connection()

    now = datetime.datetime.utcnow()
    stage_changes_to_log = []

    last_stages = load_all_last_stages(conn)
    print(f"Loaded {len(last_stages)} prior stage records.")

    skipped_contact_upload = 0
    changes_logged = 0

    for person in people:
        person_id = str(person.get("id"))
        current_stage = person.get("stage")
        if not person_id or not current_stage:
            continue

        if current_stage == "Contact Upload":
            skipped_contact_upload += 1
            continue

        last_stage = last_stages.get(person_id)

        if last_stage is None:
            # First time seeing this person
            stage_changes_to_log.append((
                person_id,
                None,
                person.get("firstName"),
                person.get("lastName"),
                "Contact Upload",
                current_stage,
                now,
                now,
                json.dumps(person)
            ))
            changes_logged += 1
        elif last_stage != current_stage:
            # Stage has changed
            stage_changes_to_log.append((
                person_id,
                None,
                person.get("firstName"),
                person.get("lastName"),
                last_stage,
                current_stage,
                now,
                now,
                json.dumps(person)
            ))
            changes_logged += 1

    if stage_changes_to_log:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, """
                INSERT INTO stage_changes (
                    person_id, deal_id, first_name, last_name,
                    stage_from, stage_to, changed_at, received_at, raw_payload
                ) VALUES %s
            """, stage_changes_to_log)
        conn.commit()

    conn.close()
    print(f"Skipped {skipped_contact_upload} leads still in 'Contact Upload'")
    print(f"Logged {changes_logged} stage changes")
    print("Done.")

if __name__ == "__main__":
    run_polling()