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


# === GET PEOPLE FROM FUB ===
def fetch_all_people():
    """
    Fixed pagination using FUB's actual API structure with next tokens
    """
    url = "https://api.followupboss.com/v1/people"
    auth_string = base64.b64encode(f"{FUB_API_KEY}:".encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": f"Basic {auth_string}",
        "X-System": "SynergyFUBLeadMetrics",
        "X-System-Key": os.getenv("FUB_SYSTEM_KEY")
    }

    people = []
    next_token = None
    page_count = 0
    limit = 100  # Maximum allowed by FUB API

    while True:
        page_count += 1
        params = {"limit": limit}

        # Use next token if we have one from previous page
        if next_token:
            params["next"] = next_token

        print(f"Fetching page {page_count} (limit: {limit})")
        resp = requests.get(url, headers=headers, params=params)

        if resp.status_code != 200:
            print(f"Error fetching people (status {resp.status_code}): {resp.text}")
            break

        data = resp.json()
        current_batch = data.get("people", [])
        print(f"Page {page_count}: fetched {len(current_batch)} people")

        if not current_batch:
            print("No more people returned - reached end")
            break

        people.extend(current_batch)

        # Get next token from metadata - this is how FUB handles pagination
        metadata = data.get("_metadata", {})
        next_token = metadata.get("next")
        total = metadata.get("total", 0)

        print(f"Total in system: {total}, fetched so far: {len(people)}")

        # If no next token, we've reached the end
        if not next_token:
            print("No next token - finished pagination")
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
    people = fetch_all_people()  # Now uses the corrected pagination
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
            print(
                f"New tracked lead {person.get('firstName')} {person.get('lastName')} moved from Contact Upload -> {current_stage}")
            logged += 1
        elif last_stage != current_stage:
            log_stage_change(conn, person, last_stage)
            print(
                f"Logging stage change for {person.get('firstName')} {person.get('lastName')}: {last_stage} -> {current_stage}")
            logged += 1

    print(f"Skipped {skipped} leads still in 'Contact Upload'")
    print(f"Logged {logged} stage changes")
    conn.close()
    print("Done.")


if __name__ == "__main__":
    run_polling()