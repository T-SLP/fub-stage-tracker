import requests
import psycopg2
import psycopg2.extras
import datetime
import json
import os
import base64
from urllib.parse import urlencode

# === CONFIG ===
SYSTEM_NAME = "SynergyFUBLeadMetrics"
SYSTEM_KEY = "390b59dea776f1d5216843d3dfd5a127"

# === AUTH HEADERS ===
def get_fub_headers():
    api_key = os.getenv("FUB_API_KEY", "")
    encoded_auth = base64.b64encode(f"{api_key}:".encode()).decode()
    return {
        "Authorization": f"Basic {encoded_auth}",
        "X-System": SYSTEM_NAME,
        "X-System-Key": SYSTEM_KEY,
        "Content-Type": "application/json"
    }

# === CONNECT TO SUPABASE POSTGRES ===
def get_connection():
    return psycopg2.connect(os.getenv("SUPABASE_DB_URL", ""), sslmode='require')

# === LOAD ALL LAST STAGES INTO MEMORY ===
def load_all_last_stages(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (person_id) person_id, stage_to
            FROM stage_changes
            ORDER BY person_id, changed_at DESC
        """)
        return {str(row[0]): row[1] for row in cur.fetchall()}

# === BATCH INSERT STAGE CHANGES ===
def log_stage_changes(conn, changes):
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO stage_changes (
                person_id, deal_id, first_name, last_name,
                stage_from, stage_to, changed_at, received_at, raw_payload
            ) VALUES %s
            """,
            changes
        )
    conn.commit()

# === FETCH PEOPLE WITH PAGINATION ===
def fetch_all_people():
    people = []
    page = 1
    headers = get_fub_headers()

    while True:
        url = f"https://api.followupboss.com/v1/people?{urlencode({'page': page})}"
        resp = requests.get(url, headers=headers)

        if resp.status_code != 200:
            print("Error fetching people:", resp.text)
            break

        data = resp.json()
        batch = data.get("people", [])
        print(f"Fetched page {page} with {len(batch)} people")
        people.extend(batch)

        if not data.get("more", False):
            print(f"No more pages after page {page}")
            break

        page += 1

    return people

# === MAIN LOGIC ===
def run_polling():
    print("Starting stage polling...")
    people = fetch_all_people()
    print(f"Total people fetched from FUB: {len(people)}")

    conn = get_connection()
    last_stages = load_all_last_stages(conn)
    print(f"Loaded {len(last_stages)} prior stage records.")

    to_log = []
    skipped = 0

    for person in people:
        person_id = str(person.get("id"))
        current_stage = person.get("stage")

        if not person_id or not current_stage:
            continue

        if current_stage == "Contact Upload":
            skipped += 1
            continue

        last_stage = last_stages.get(person_id)

        if last_stage is None:
            to_log.append((
                person_id,
                None,
                person.get("firstName"),
                person.get("lastName"),
                "Contact Upload",
                current_stage,
                datetime.datetime.utcnow(),
                datetime.datetime.utcnow(),
                json.dumps(person)
            ))
            print(f"New tracked lead {person.get('firstName')} {person.get('lastName')} moved from Contact Upload -> {current_stage}")
        elif last_stage != current_stage:
            to_log.append((
                person_id,
                None,
                person.get("firstName"),
                person.get("lastName"),
                last_stage,
                current_stage,
                datetime.datetime.utcnow(),
                datetime.datetime.utcnow(),
                json.dumps(person)
            ))
            print(f"Logging stage change for {person.get('firstName')} {person.get('lastName')}: {last_stage} -> {current_stage}")

    if to_log:
        log_stage_changes(conn, to_log)

    print(f"Skipped {skipped} leads still in 'Contact Upload'")
    print(f"Logged {len(to_log)} stage changes")
    print("Done.")
    conn.close()

if __name__ == "__main__":
    run_polling()