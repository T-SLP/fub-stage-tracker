import requests
import psycopg2
import psycopg2.extras
import datetime
import json
import os
import base64
from urllib.parse import quote_plus

# === CONFIG ===
FUB_API_KEY = os.getenv("FUB_API_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")

# === DEBUG: Check accessible lead count ===
def fetch_people_count():
    url = "https://api.followupboss.com/v1/people/count"
    auth_string = base64.b64encode(f"{FUB_API_KEY}:".encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": f"Basic {auth_string}",
        "X-System": "SynergyFUBLeadMetrics",
        "X-System-Key": os.getenv("FUB_SYSTEM_KEY")
    }
    resp = requests.get(url, headers=headers)
    if resp.status_code == 200:
        print("FUB reports total accessible leads:", resp.json().get("count"))
    else:
        print("Error fetching lead count:", resp.text)

# === GET PEOPLE FROM FUB ===
def fetch_all_people():
    url = "https://api.followupboss.com/v1/people"
    auth_string = base64.b64encode(f"{FUB_API_KEY}:".encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": f"Basic {auth_string}",
        "X-System": "SynergyFUBLeadMetrics",
        "X-System-Key": os.getenv("FUB_SYSTEM_KEY")
    }

    people = []
    page = 1

    while True:
        params = {
            "page": page,
            "limit": 100,
            "assigned": False
        }

        resp = requests.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            print("Error fetching people:", resp.text)
            break

        data = resp.json()
        current_batch = data.get("people", [])
        people.extend(current_batch)
        print(f"Fetched page {page} with {len(current_batch)} people")

        if data.get("more", False):
            print("More pages available...")
            page += 1
        else:
            print("No more pages after page", page)
            break

    return people

# === CONNECT TO SUPABASE POSTGRES ===
def get_connection():
    return psycopg2.connect(SUPABASE_DB_URL, sslmode='require')

# === GET LAST RECORDED STAGE FOR A PERSON ===
def get_last_stage_for_person(conn, person_id):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT stage_to FROM stage_changes
            WHERE person_id = %s
            ORDER BY changed_at DESC
            LIMIT 1;
        """, (str(person_id),))
        row = cur.fetchone()
        return row[0] if row else None

# === LOG STAGE CHANGE ===
def log_stage_change(conn, person, old_stage):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO stage_changes (
                person_id, deal_id, first_name, last_name,
                stage_from, stage_to, changed_at, received_at, raw_payload
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            person.get("id"),
            None,  # no deal_id for leads
            person.get("firstName"),
            person.get("lastName"),
            old_stage,
            person.get("stage"),
            datetime.datetime.utcnow(),
            datetime.datetime.utcnow(),
            json.dumps(person)
        ))
    conn.commit()

# === MAIN LOGIC ===
def run_polling():
    print("Starting stage polling...")
    fetch_people_count()
    people = fetch_all_people()
    print(f"Total people fetched from FUB: {len(people)}")

    conn = get_connection()
    skipped = 0
    logged = 0

    for person in people:
        person_id = person.get("id")
        current_stage = person.get("stage")
        if not person_id or not current_stage:
            continue

        if current_stage == "Contact Upload":
            skipped += 1
            continue

        last_stage = get_last_stage_for_person(conn, str(person_id))

        if last_stage is None:
            log_stage_change(conn, person, "Contact Upload")
            print(f"New tracked lead {person.get('firstName')} {person.get('lastName')} moved from Contact Upload -> {current_stage}")
            logged += 1
        elif last_stage != current_stage:
            log_stage_change(conn, person, last_stage)
            print(f"Logging stage change for {person.get('firstName')} {person.get('lastName')}: {last_stage} -> {current_stage}")
            logged += 1

    print(f"Skipped {skipped} leads still in 'Contact Upload'")
    print(f"Logged {logged} stage changes")
    conn.close()
    print("Done.")

if __name__ == "__main__":
    run_polling()
