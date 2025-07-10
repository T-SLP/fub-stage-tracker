import requests
import psycopg2
import psycopg2.extras
import datetime
import json
import base64
from urllib.parse import quote_plus
import os

# === CONFIG ===
FUB_API_KEY = os.getenv("FUB_API_KEY")
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL")

# === GET PEOPLE FROM FUB ===
def fetch_all_people():
    url = "https://api.followupboss.com/v1/people"
    auth_string = base64.b64encode(f"{FUB_API_KEY}:".encode("utf-8")).decode("utf-8")
    headers = {"Authorization": f"Basic {auth_string}"}

    people = []
    page = 1

    while True:
        resp = requests.get(url, headers=headers, params={"page": page})
        if resp.status_code != 200:
            print("Error fetching people:", resp.text)
            break

        data = resp.json()
        people.extend(data.get("people", []))

        if not data.get("more", False):
            break
        page += 1

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
    people = fetch_all_people()
    conn = get_connection()

    for person in people:
        person_id = person.get("id")
        current_stage = person.get("stage")
        if not person_id or not current_stage:
            continue

        # Skip if still in Contact Upload stage
        if current_stage == "Contact Upload":
            continue

        last_stage = get_last_stage_for_person(conn, person_id)

        # If first time seeing this lead and they're not in Contact Upload, set from_stage = Contact Upload
        if last_stage is None:
            log_stage_change(conn, person, "Contact Upload")
            print(f"New tracked lead {person.get('firstName')} {person.get('lastName')} moved from Contact Upload -> {current_stage}")

        elif last_stage != current_stage:
            log_stage_change(conn, person, last_stage)
            print(f"Logging stage change for {person.get('firstName')} {person.get('lastName')}: {last_stage} -> {current_stage}")

    conn.close()
    print("Done.")

if __name__ == "__main__":
    run_polling()
