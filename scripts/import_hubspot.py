#!/usr/bin/env python3
"""
HubSpot → CRM import script.
Run once after clearing CRM data.
Order: stages → users → companies → contacts → deals → tasks → calls → meetings
"""

import openpyxl
import psycopg2
import uuid
import re
from pathlib import Path
from datetime import datetime

DOWNLOADS = Path.home() / "Downloads"
DB_URL = "postgresql://vijay@localhost:5432/ennablcrm_local"

FILES = {
    "companies": DOWNLOADS / "All Companies_18June2026.xlsx",
    "contacts":  DOWNLOADS / "All Contacts_18June2026.xlsx",
    "tasks":     DOWNLOADS / "All Tasks_19June2026.xlsx",
    "calls":     DOWNLOADS / "All Recorded Calls_19June2026.xlsx",
    "meetings":  DOWNLOADS / "All Meetings_19June2026.xlsx",
    "deals":     DOWNLOADS / "All Deals_19June2026.xlsx",
}

def gen_id():
    return str(uuid.uuid4())

def clean(v):
    """Return None for empty / HubSpot (No value) sentinel."""
    if v is None:
        return None
    s = str(v).strip()
    if s in ("", "(No value)", "N/A"):
        return None
    return s

def to_dt(v):
    """Return a datetime or None."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    return None

def load_sheet(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    headers = [str(h).strip() if h else "" for h in rows[0]]
    data = [dict(zip(headers, r)) for r in rows[1:]]
    return data

# ─── helpers for fuzzy company / contact matching ────────────────────────────

def build_name_index(name_id_pairs):
    """
    Returns sorted list [(name_lower, cid)] longest-first for substring search.
    """
    return sorted(
        [(n.lower().strip(), cid) for n, cid in name_id_pairs if n],
        key=lambda x: -len(x[0])
    )

def find_in_text(index, text):
    """Return first company/contact id whose name appears in text (case-insensitive)."""
    if not text:
        return None
    tl = text.lower()
    for name, cid in index:
        if len(name) > 3 and name in tl:
            return cid
    return None

# ─── deactivated users — do NOT create ───────────────────────────────────────

DEACTIVATED = {
    "dakota jacobsen", "david soforenko", "elden schear", "glenn cannon",
    "greg de jesus", "ryan deeds", "support account", "finance department",
    "allison menden",  # internal only
}

# Active users: name → placeholder ennabl email
ACTIVE_USERS = {
    "Aaron Scharnweber":       "ascharnweber@ennabl.com",
    "Abby Biggs":              "abiggs@ennabl.com",
    "Andy Hansen":             "ahansen@ennabl.com",
    "Anton Biziaev":           "abiziaev@ennabl.com",
    "Anton Chudinovskikh":     "achudinovskikh@ennabl.com",
    "Brandon Sykes":           "bsykes@ennabl.com",
    "Chris Nelson":            "cnelson@ennabl.com",
    "Darin Vick":              "dvick@ennabl.com",
    "Justin Aebischer":        "jaebischer@ennabl.com",
    "Kabir Syed":              "ksyed@ennabl.com",
    "Libbie Cedeno":           "lcedeno@ennabl.com",
    "Megan Kyle":              "mkyle@ennabl.com",
    "Michael LaBella":         "mlabella@ennabl.com",
    "Naresh Kumar Narendran":  "nnarendran@ennabl.com",
    "Nate Lurie":              "nlurie@ennabl.com",
    "Patrick Byrne":           "pbyrne@ennabl.com",
    "Thomas O'Connor":         "toconnor@ennabl.com",
    "Xiaohong Yang":           "xyang@ennabl.com",
}

# ─── deal stage mapping ───────────────────────────────────────────────────────

HS_STAGE_MAP = {
    "1. qualified":         "Qualified",
    "2. discovery":         "Discovery",
    "3. validation":        "Validation",
    "4. proposal":          "Proposal",
    "proof of concept":     "Proof of Concept",
    "5. negotiation":       "Negotiation",
    "6. out for signature": "Out for Signature",
    "closed won":           "Won",
    "closed lost":          "Lost",
    "dead no decision":     "No Decision",
}

# ─── task type mapping ────────────────────────────────────────────────────────

HS_TASK_TYPE = {
    "to do":                                  "TODO",
    "call":                                   "CALL",
    "email":                                  "EMAIL",
    "sales navigator - connection request":   "TODO",
}

# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════

conn = psycopg2.connect(DB_URL)
conn.autocommit = False
cur = conn.cursor()

print("✓ Connected to database\n")

# ─── STEP 1 : Add missing deal stages ────────────────────────────────────────
print("── Step 1: Deal stages ──")

# Shift Won (5→6) and Lost (6→7) to make room for Negotiation at 5
cur.execute('UPDATE deal_stages SET "order" = 7 WHERE name = \'Lost\'')
cur.execute('UPDATE deal_stages SET "order" = 6 WHERE name = \'Won\'')

new_stages = [
    ("Qualified",   -1, "#8b5cf6"),
    ("Negotiation",  5, "#f97316"),
    ("No Decision",  8, "#6b7280"),
]
for name, order, color in new_stages:
    cur.execute(
        'INSERT INTO deal_stages (id, name, "order", color) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING',
        (gen_id(), name, order, color)
    )
    print(f"  + Stage: {name} (order={order})")

conn.commit()

# Build stage name → id map
cur.execute('SELECT id, name FROM deal_stages')
stage_name_to_id = {row[1]: row[0] for row in cur.fetchall()}
print(f"  Stages loaded: {list(stage_name_to_id.keys())}\n")

# ─── STEP 2 : Create active users ────────────────────────────────────────────
print("── Step 2: Users ──")

# Load existing users
cur.execute('SELECT id, name, email FROM users')
existing = {row[2].lower(): (row[0], row[1]) for row in cur.fetchall()}
user_name_to_id = {row[1].lower(): row[0] for row in cur.execute('SELECT id, name FROM users') or []}
cur.execute('SELECT id, name FROM users')
user_name_to_id = {row[1].lower(): row[0] for row in cur.fetchall()}

created_users = 0
for display_name, email in ACTIVE_USERS.items():
    if email.lower() in existing:
        uid = existing[email.lower()][0]
        user_name_to_id[display_name.lower()] = uid
        print(f"  ~ Skip (exists): {display_name}")
        continue
    # Check by name too
    if display_name.lower() in user_name_to_id:
        print(f"  ~ Skip (name exists): {display_name}")
        continue
    uid = gen_id()
    cur.execute(
        "INSERT INTO users (id, email, name, role, status) VALUES (%s,%s,%s,'MEMBER','ACTIVE') ON CONFLICT (email) DO NOTHING",
        (uid, email, display_name.replace("Thomas O' Connor", "Thomas O'Connor"))
    )
    user_name_to_id[display_name.lower()] = uid
    created_users += 1
    print(f"  + User: {display_name} ({email})")

conn.commit()

# Reload full name→id after inserts
cur.execute('SELECT id, name FROM users')
for row in cur.fetchall():
    user_name_to_id[row[1].lower()] = row[0]

# Also map "Vijay" and "Vijay Srinivasan" to same id
if "vijay" in user_name_to_id:
    user_name_to_id["vijay srinivasan"] = user_name_to_id["vijay"]

print(f"  Total users now: {len(user_name_to_id)} (created {created_users})\n")

def resolve_user(name_str):
    if not name_str:
        return None
    n = name_str.strip().replace("O' Connor", "O'Connor").lower()
    if n in DEACTIVATED or "deleteduser" in n or "deactivated" in n.lower():
        return None
    return user_name_to_id.get(n)

# ─── STEP 3 : Companies ──────────────────────────────────────────────────────
print("── Step 3: Companies ──")

rows = load_sheet(FILES["companies"])
print(f"  Loaded {len(rows)} company rows")

hs_company_to_crmid = {}   # hubspot_id (str) → crm uuid
company_name_to_id = {}    # company name lower → crm uuid

inserted_companies = 0
skipped_companies = 0

for r in rows:
    hs_id   = clean(r.get("HubSpot Record ID"))
    name    = clean(r.get("Company name")) or "(unnamed)"
    domain  = clean(r.get("Company Domain Name"))
    website = clean(r.get("Website URL"))
    addr    = clean(r.get("Street Address"))
    addr2   = clean(r.get("Street Address 2"))
    city    = clean(r.get("City"))
    state   = clean(r.get("State/Region"))
    postal  = clean(r.get("Postal Code"))
    country = clean(r.get("Country/Region"))
    industry= clean(r.get("Industry"))
    revenue_raw = r.get("Annual Revenue")
    revenue = float(revenue_raw) if revenue_raw and str(revenue_raw).strip() not in ("", "(No value)") else None
    emp_raw = r.get("Number of Employees")
    emp     = int(emp_raw) if emp_raw and str(emp_raw).strip() not in ("", "(No value)") else None
    linkedin= clean(r.get("Linkedin handle"))
    logo    = clean(r.get("Logo URL"))
    tags_raw= clean(r.get("Tags"))
    tags    = [t.strip() for t in tags_raw.split(";")] if tags_raw else []
    ams     = clean(r.get("AMS/CRM"))
    ams_sys_raw = clean(r.get("Types of AMS/CRM Systems"))
    ams_sys = [a.strip() for a in ams_sys_raw.split(";")] if ams_sys_raw else []
    acct_type    = clean(r.get("Account Type"))
    contract_type= clean(r.get("Type of Contract"))
    prospect_tier= clean(r.get("Prospect Type"))
    bde_raw = clean(r.get("BDE or VPN in Place?"))
    bde = True if bde_raw and bde_raw.lower() == "yes" else (False if bde_raw and bde_raw.lower() == "no" else None)
    inst_raw = r.get("Number of AMS/CRM Instances")
    try:
        inst = int(inst_raw) if inst_raw and str(inst_raw).strip() not in ("", "(No value)") else None
    except (ValueError, TypeError):
        inst = None

    cid = gen_id()

    try:
        cur.execute("""
            INSERT INTO companies (
                id, name, domain, hubspot_id, industry,
                estimated_annual_revenue, number_of_employees,
                website, address, address_line_2, city, state, postal_code, country,
                linkedin_url, logo_url, tags, ams_crm, ams_crm_systems, ams_crm_instance_count,
                account_type, contract_type, prospect_tier, bde_vpn_in_place,
                status, created_at, updated_at
            ) VALUES (
                %s,%s,%s,%s,%s,
                %s,%s,
                %s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,
                'PROSPECT', now(), now()
            )
            ON CONFLICT (domain) DO UPDATE SET
                name = EXCLUDED.name,
                hubspot_id = EXCLUDED.hubspot_id,
                industry = EXCLUDED.industry,
                estimated_annual_revenue = EXCLUDED.estimated_annual_revenue,
                number_of_employees = EXCLUDED.number_of_employees,
                website = EXCLUDED.website,
                updated_at = now()
            RETURNING id
        """, (
            cid, name, domain, str(hs_id) if hs_id else None, industry,
            revenue, emp,
            website, addr, addr2, city, state, postal, country,
            linkedin, logo, tags, ams, ams_sys, inst,
            acct_type, contract_type, prospect_tier, bde,
        ))
        result = cur.fetchone()
        actual_id = result[0] if result else cid
        if hs_id:
            hs_company_to_crmid[str(hs_id)] = actual_id
        company_name_to_id[name.lower()] = actual_id
        inserted_companies += 1
    except Exception as e:
        skipped_companies += 1
        if skipped_companies <= 5:
            print(f"  ! Company skip ({name}): {e}")
        conn.rollback()
        # retry without domain
        try:
            cur.execute("""
                INSERT INTO companies (
                    id, name, hubspot_id, industry,
                    estimated_annual_revenue, number_of_employees,
                    website, address, address_line_2, city, state, postal_code, country,
                    linkedin_url, logo_url, tags, ams_crm, ams_crm_instance_count,
                    account_type, contract_type, prospect_tier,
                    status, created_at, updated_at
                ) VALUES (
                    %s,%s,%s,%s,
                    %s,%s,
                    %s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,
                    %s,%s,%s,
                    'PROSPECT', now(), now()
                ) ON CONFLICT DO NOTHING RETURNING id
            """, (
                cid, name, str(hs_id) if hs_id else None, industry,
                revenue, emp,
                website, addr, addr2, city, state, postal, country,
                linkedin, logo, tags, ams, inst,
                acct_type, contract_type, prospect_tier,
            ))
            result = cur.fetchone()
            actual_id = result[0] if result else cid
            if hs_id:
                hs_company_to_crmid[str(hs_id)] = actual_id
            company_name_to_id[name.lower()] = actual_id
        except Exception as e2:
            if skipped_companies <= 5:
                print(f"  !! Company hard skip ({name}): {e2}")
            conn.rollback()
        continue

    if inserted_companies % 1000 == 0:
        conn.commit()
        print(f"  ... {inserted_companies} companies inserted")

conn.commit()
print(f"  ✓ Companies: {inserted_companies} inserted, {skipped_companies} skipped\n")

# Build company name fuzzy index
company_index = build_name_index(company_name_to_id.items())

# ─── STEP 4 : Contacts ───────────────────────────────────────────────────────
print("── Step 4: Contacts ──")

rows = load_sheet(FILES["contacts"])
print(f"  Loaded {len(rows)} contact rows")

hs_contact_to_crmid = {}   # hubspot_id (str) → crm uuid
contact_name_index = []    # for fuzzy matching

inserted_contacts = 0
skipped_contacts = 0

for r in rows:
    hs_id     = clean(r.get("HubSpot Record ID"))
    first     = clean(r.get("First Name")) or ""
    last      = clean(r.get("Last Name")) or ""
    email     = clean(r.get("Email"))
    phone     = clean(r.get("Phone Number"))
    title     = clean(r.get("Job Title"))
    linkedin  = clean(r.get("LinkedIn URL"))
    city      = clean(r.get("City"))
    state     = clean(r.get("State/Region"))
    country   = clean(r.get("Country/Region"))

    # Link to company
    assoc_co_id = clean(r.get("Associated Company IDs"))
    if not assoc_co_id:
        assoc_co_id = clean(r.get("Associated Company"))
    company_crm_id = hs_company_to_crmid.get(str(assoc_co_id)) if assoc_co_id else None

    ennabl_user_raw = clean(r.get("Ennabl Decisions User"))
    ennabl_user = ennabl_user_raw is not None

    marketing_raw = clean(r.get("Marketing contact status"))
    marketing = marketing_raw == "Marketing contact" if marketing_raw else False

    cid = gen_id()

    try:
        cur.execute("""
            INSERT INTO contacts (
                id, first_name, last_name, email, phone, title,
                linked_in, company_id,
                ennabl_user, email_marketing_contact,
                status, review_status, created_at, updated_at
            ) VALUES (
                %s,%s,%s,%s,%s,%s,
                %s,%s,
                %s,%s,
                'LEAD','REVIEWED', now(), now()
            )
            ON CONFLICT (email) DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name  = EXCLUDED.last_name,
                phone      = COALESCE(EXCLUDED.phone, contacts.phone),
                title      = COALESCE(EXCLUDED.title, contacts.title),
                company_id = COALESCE(EXCLUDED.company_id, contacts.company_id),
                updated_at = now()
            RETURNING id
        """, (
            cid, first, last, email, phone, title,
            linkedin, company_crm_id,
            ennabl_user, marketing,
        ))
        result = cur.fetchone()
        actual_id = result[0] if result else cid
        if hs_id:
            hs_contact_to_crmid[str(hs_id)] = actual_id
        full_name = f"{first} {last}".strip().lower()
        if full_name:
            contact_name_index.append((full_name, actual_id))
        inserted_contacts += 1
    except Exception as e:
        skipped_contacts += 1
        if skipped_contacts <= 5:
            print(f"  ! Contact skip ({first} {last}): {e}")
        conn.rollback()
        continue

    if inserted_contacts % 2000 == 0:
        conn.commit()
        print(f"  ... {inserted_contacts} contacts inserted")

conn.commit()
print(f"  ✓ Contacts: {inserted_contacts} inserted, {skipped_contacts} skipped\n")

contact_index = build_name_index(contact_name_index)

# ─── STEP 5 : Deals ──────────────────────────────────────────────────────────
print("── Step 5: Deals ──")

rows = load_sheet(FILES["deals"])
print(f"  Loaded {len(rows)} deal rows")

hs_deal_to_crmid = {}
deal_name_index  = []

inserted_deals = 0
skipped_deals  = 0

for r in rows:
    hs_id      = clean(r.get("Record ID"))
    title      = clean(r.get("Deal Name")) or "(untitled)"
    hs_stage   = clean(r.get("Deal Stage")) or ""
    close_date = to_dt(r.get("Close Date"))
    owner_name = clean(r.get("Deal owner"))
    amount_raw = r.get("Amount")
    amount     = float(amount_raw) if amount_raw and str(amount_raw).strip() not in ("", "(No value)") else None
    pipeline   = clean(r.get("Pipeline"))
    created_at = to_dt(r.get("Create Date")) or datetime.now()

    # Map stage
    stage_name = HS_STAGE_MAP.get(hs_stage.lower().strip(), "Discovery")
    stage_id   = stage_name_to_id.get(stage_name)
    if not stage_id:
        stage_id = stage_name_to_id.get("Discovery")

    # Link company
    assoc_co_id = clean(r.get("Associated Company IDs"))
    company_crm_id = hs_company_to_crmid.get(str(assoc_co_id)) if assoc_co_id else None

    # Assignee
    assignee_id = resolve_user(owner_name)

    did = gen_id()

    try:
        cur.execute("""
            INSERT INTO deals (
                id, title, value, stage_id, company_id, assignee_id,
                close_date, "order", created_at, updated_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,0,%s,now())
            ON CONFLICT DO NOTHING
            RETURNING id
        """, (did, title, amount, stage_id, company_crm_id, assignee_id, close_date, created_at))
        result = cur.fetchone()
        actual_id = result[0] if result else did
        if hs_id:
            hs_deal_to_crmid[str(hs_id)] = actual_id
        deal_name_index.append((title.lower(), actual_id))
        inserted_deals += 1
    except Exception as e:
        skipped_deals += 1
        if skipped_deals <= 5:
            print(f"  ! Deal skip ({title}): {e}")
        conn.rollback()
        continue

    if inserted_deals % 200 == 0:
        conn.commit()
        print(f"  ... {inserted_deals} deals inserted")

conn.commit()
print(f"  ✓ Deals: {inserted_deals} inserted, {skipped_deals} skipped\n")

deal_index = build_name_index(deal_name_index)

# ─── STEP 6 : Tasks ──────────────────────────────────────────────────────────
print("── Step 6: Tasks ──")

rows = load_sheet(FILES["tasks"])
print(f"  Loaded {len(rows)} task rows")

inserted_tasks  = 0
skipped_tasks   = 0
linked_tasks    = 0

for r in rows:
    title       = clean(r.get("Task Title")) or "(untitled)"
    task_type_hs= clean(r.get("Task Type")) or "to do"
    status      = clean(r.get("Task Status")) or "Not Started"
    notes       = clean(r.get("Task Notes"))
    assignee_nm = clean(r.get("Assigned to"))
    creator_nm  = clean(r.get("Created by"))
    due_date    = to_dt(r.get("Due date"))
    created_at  = to_dt(r.get("Created at")) or datetime.now()

    task_type  = HS_TASK_TYPE.get(task_type_hs.lower(), "TODO")
    completed  = status.lower() == "completed"
    completed_at = created_at if completed else None

    assignee_id = resolve_user(assignee_nm)
    creator_id  = resolve_user(creator_nm)

    # Fuzzy link: try title+notes against companies → get contact at that company
    search_text = f"{title} {notes or ''}"
    contact_id  = find_in_text(contact_index, search_text)
    deal_id     = None

    if not contact_id:
        # Try matching company → get first contact at that company
        company_id_match = find_in_text(company_index, search_text)
        if company_id_match:
            cur.execute(
                "SELECT id FROM contacts WHERE company_id = %s LIMIT 1",
                (company_id_match,)
            )
            row = cur.fetchone()
            if row:
                contact_id = row[0]
                linked_tasks += 1

    # Try to link to a deal
    deal_id = find_in_text(deal_index, search_text)

    tid = gen_id()
    try:
        cur.execute("""
            INSERT INTO tasks (
                id, title, description, due_date, completed, completed_at,
                type, contact_id, deal_id, assignee_id, creator_id,
                created_at, updated_at
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
            ON CONFLICT DO NOTHING
        """, (
            tid, title, notes, due_date, completed, completed_at,
            task_type, contact_id, deal_id, assignee_id, creator_id,
            created_at,
        ))
        inserted_tasks += 1
    except Exception as e:
        skipped_tasks += 1
        if skipped_tasks <= 5:
            print(f"  ! Task skip ({title}): {e}")
        conn.rollback()
        continue

    if inserted_tasks % 500 == 0:
        conn.commit()
        print(f"  ... {inserted_tasks} tasks inserted")

conn.commit()
print(f"  ✓ Tasks: {inserted_tasks} inserted, {skipped_tasks} skipped, {linked_tasks} linked to contact\n")

# ─── STEP 7 : Calls (activities) ─────────────────────────────────────────────
print("── Step 7: Calls ──")

rows = load_sheet(FILES["calls"])
print(f"  Loaded {len(rows)} call rows")

inserted_calls = 0
skipped_calls  = 0

for r in rows:
    title       = clean(r.get("Call Title")) or "Call"
    act_date    = to_dt(r.get("Activity date")) or datetime.now()
    assignee_nm = clean(r.get("Activity assigned to"))
    notes       = clean(r.get("Call notes"))
    outcome     = clean(r.get("Call outcome"))

    user_id = resolve_user(assignee_nm)

    # Link contact (first ID in comma list)
    contact_id = None
    raw_contact_ids = clean(r.get("Associated Contact IDs"))
    if raw_contact_ids:
        for cid_hs in str(raw_contact_ids).split(";"):
            cid_hs = cid_hs.strip()
            if cid_hs and cid_hs in hs_contact_to_crmid:
                contact_id = hs_contact_to_crmid[cid_hs]
                break

    # Link company
    company_id = None
    raw_co_id = clean(r.get("Associated Company IDs"))
    if raw_co_id:
        company_id = hs_company_to_crmid.get(str(raw_co_id).strip())

    # Link deal (first ID)
    deal_id = None
    raw_deal_ids = clean(r.get("Associated Deal IDs"))
    if raw_deal_ids:
        for did_hs in str(raw_deal_ids).split(";"):
            did_hs = did_hs.strip()
            if did_hs and did_hs in hs_deal_to_crmid:
                deal_id = hs_deal_to_crmid[did_hs]
                break

    description = f"{notes or ''}\nOutcome: {outcome}" if outcome else notes

    try:
        cur.execute("""
            INSERT INTO activities (
                id, type, title, description, user_id,
                contact_id, company_id, deal_id, created_at
            ) VALUES (%s,'CALL',%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT DO NOTHING
        """, (gen_id(), title, description, user_id, contact_id, company_id, deal_id, act_date))
        inserted_calls += 1
    except Exception as e:
        skipped_calls += 1
        if skipped_calls <= 5:
            print(f"  ! Call skip ({title}): {e}")
        conn.rollback()

conn.commit()
print(f"  ✓ Calls: {inserted_calls} inserted, {skipped_calls} skipped\n")

# ─── STEP 8 : Meetings (activities) ──────────────────────────────────────────
print("── Step 8: Meetings ──")

rows = load_sheet(FILES["meetings"])
print(f"  Loaded {len(rows)} meeting rows")

inserted_meetings = 0
skipped_meetings  = 0
linked_meetings   = 0

# Patterns for extracting company name from meeting title
MEETING_PATTERNS = [
    r"^fathom summary for (.+)$",
    r"^(.+?)\s*[-–]\s*.+$",       # "CompanyName - topic"
    r"^(.+?)\s*<>\s*.+$",         # "CompanyName <> ennabl"
    r"^(.+?)\s*/\s*ennabl",       # "CompanyName / ennabl"
    r"^(.+?)\s*\\+\s*.+$",        # "CompanyName + something"
]

def extract_meeting_company(name):
    if not name:
        return None
    for pat in MEETING_PATTERNS:
        m = re.match(pat, name.strip(), re.IGNORECASE)
        if m:
            candidate = m.group(1).strip()
            if len(candidate) > 3:
                return candidate
    return name.strip()

for r in rows:
    name        = clean(r.get("Meeting name")) or "Meeting"
    start_dt    = to_dt(r.get("Meeting start time")) or to_dt(r.get("Activity date")) or datetime.now()
    end_dt      = to_dt(r.get("Meeting end time"))
    description = clean(r.get("Meeting description"))

    # Try to extract company from meeting name
    company_id  = None
    contact_id  = None

    candidate = extract_meeting_company(name)
    if candidate:
        # Try company first
        company_id = find_in_text(company_index, candidate)
        if company_id:
            linked_meetings += 1
        else:
            # Try contact name
            contact_id = find_in_text(contact_index, candidate)
            if contact_id:
                linked_meetings += 1

    # Also try description for company match if still unlinked
    if not company_id and not contact_id and description:
        company_id = find_in_text(company_index, description[:200])
        if company_id:
            linked_meetings += 1

    try:
        cur.execute("""
            INSERT INTO activities (
                id, type, title, description, end_date,
                contact_id, company_id, created_at
            ) VALUES (%s,'MEETING',%s,%s,%s,%s,%s,%s)
            ON CONFLICT DO NOTHING
        """, (gen_id(), name, description, end_dt, contact_id, company_id, start_dt))
        inserted_meetings += 1
    except Exception as e:
        skipped_meetings += 1
        if skipped_meetings <= 5:
            print(f"  ! Meeting skip ({name}): {e}")
        conn.rollback()

    if inserted_meetings % 1000 == 0:
        conn.commit()
        print(f"  ... {inserted_meetings} meetings inserted")

conn.commit()
print(f"  ✓ Meetings: {inserted_meetings} inserted, {skipped_meetings} skipped, {linked_meetings} linked\n")

# ─── FINAL SUMMARY ───────────────────────────────────────────────────────────
print("═" * 60)
print("IMPORT COMPLETE")
print("═" * 60)

cur.execute("SELECT COUNT(*) FROM companies")
print(f"  Companies : {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM contacts")
print(f"  Contacts  : {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM deals")
print(f"  Deals     : {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM tasks")
print(f"  Tasks     : {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM activities WHERE type='CALL'")
print(f"  Calls     : {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM activities WHERE type='MEETING'")
print(f"  Meetings  : {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM users")
print(f"  Users     : {cur.fetchone()[0]}")
print()

cur.close()
conn.close()
print("Done.")
