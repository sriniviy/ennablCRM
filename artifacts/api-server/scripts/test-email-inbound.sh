#!/usr/bin/env bash
# Test script for POST /api/email/inbound — simulates SendGrid Inbound Parse payloads.
# Runs all 5 email scenarios locally without needing SendGrid or ngrok.
#
# Usage:
#   chmod +x scripts/test-email-inbound.sh
#   ./scripts/test-email-inbound.sh [scenario]
#
# Without argument: runs all 5 scenarios.
# With argument: runs a single scenario by number (1–5).
#
# Prerequisites: API server running on http://localhost:4000
# If SENDGRID_INBOUND_TOKEN is set in .env, set TOKEN= below to match.

API="http://localhost:4000/api/email/inbound"
TOKEN=""   # set to match SENDGRID_INBOUND_TOKEN in .env (leave blank if not set)

# Real contact IDs and emails from local DB
CONTACT_BOB_ID="3e3e4060-21f8-4461-92cf-251f2c3cc4ce"
CONTACT_BOB_EMAIL="bob@techflow.io"

CONTACT_CAROL_ID="90d67fd5-b648-4fde-bf97-559453d441d7"
CONTACT_CAROL_EMAIL="carol@novasystems.com"

# CRM team members (internal @ennabl.com)
CRM_USER1="vijay@ennabl.com"
CRM_USER2="sarah@ennabl.com"

MAIL_DOMAIN="mail.ennabl.com"

URL="${API}"
if [ -n "$TOKEN" ]; then
  URL="${API}?token=${TOKEN}"
fi

separator() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─────────────────────────────────────────────────────────
# Scenario 1: CRM user → Contact (outbound, with attachment)
# Expected: EMAIL_SENT activity on Bob Martinez's record, direction=sent, 1 attachment in Files
# ─────────────────────────────────────────────────────────
scenario_1() {
  separator "Scenario 1: CRM user → Contact (outbound + attachment)"

  # Create a tiny test PDF substitute
  TMPFILE=$(mktemp /tmp/test-attachment.XXXXXX.txt)
  echo "Test attachment content for scenario 1" > "$TMPFILE"

  ENVELOPE=$(printf '{"from":"%s","to":["%s","%s@%s"]}' \
    "$CRM_USER1" "$CONTACT_BOB_EMAIL" "$CONTACT_BOB_ID" "$MAIL_DOMAIN")

  curl -s -X POST "$URL" \
    -F "envelope=${ENVELOPE}" \
    -F "from=${CRM_USER1}" \
    -F "to=${CONTACT_BOB_EMAIL}" \
    -F "subject=Following up on our call" \
    -F "text=Hi Bob, great speaking with you today. Please find the proposal attached." \
    -F "attachment1=@${TMPFILE};filename=proposal.txt;type=text/plain" \
    -F "attachments=1" | python3 -m json.tool

  rm -f "$TMPFILE"
  echo "✓ Check Bob Martinez → Email tab (direction: sent) + Files tab (proposal.txt)"
}

# ─────────────────────────────────────────────────────────
# Scenario 2: Contact → CRM user (inbound reply)
# Expected: EMAIL_SENT activity on Bob's record, direction=received
# ─────────────────────────────────────────────────────────
scenario_2() {
  separator "Scenario 2: Contact → CRM user (inbound)"

  ENVELOPE=$(printf '{"from":"%s","to":["%s"]}' "$CONTACT_BOB_EMAIL" "$CRM_USER1")

  curl -s -X POST "$URL" \
    -F "envelope=${ENVELOPE}" \
    -F "from=${CONTACT_BOB_EMAIL}" \
    -F "to=${CRM_USER1}" \
    -F "subject=Re: Following up on our call" \
    -F "text=Thanks Vijay! The proposal looks great. Let's schedule a follow-up." | python3 -m json.tool

  echo "✓ Check Bob Martinez → Email tab (direction: received)"
}

# ─────────────────────────────────────────────────────────
# Scenario 3: Different CRM user → same contact (proves any team member works)
# Expected: EMAIL_SENT activity on Bob's record from sarah, direction=sent
# ─────────────────────────────────────────────────────────
scenario_3() {
  separator "Scenario 3: Different CRM user (sarah) → Contact"

  ENVELOPE=$(printf '{"from":"%s","to":["%s","%s@%s"]}' \
    "$CRM_USER2" "$CONTACT_BOB_EMAIL" "$CONTACT_BOB_ID" "$MAIL_DOMAIN")

  curl -s -X POST "$URL" \
    -F "envelope=${ENVELOPE}" \
    -F "from=${CRM_USER2}" \
    -F "to=${CONTACT_BOB_EMAIL}" \
    -F "subject=Sarah here — quick question about your renewal" \
    -F "text=Hi Bob, Sarah from Ennabl here. Just wanted to check in about your renewal." | python3 -m json.tool

  echo "✓ Check Bob Martinez → Email tab (direction: sent, from: sarah@ennabl.com)"
}

# ─────────────────────────────────────────────────────────
# Scenario 4: Contact → different CRM user's inbox (inbound captured by BCC in thread)
# Expected: EMAIL_SENT activity on Carol's record, direction=received
# ─────────────────────────────────────────────────────────
scenario_4() {
  separator "Scenario 4: Contact replies to sarah (inbound, contact is Carol)"

  ENVELOPE=$(printf '{"from":"%s","to":["%s","%s@%s"]}' \
    "$CONTACT_CAROL_EMAIL" "$CRM_USER2" "$CONTACT_CAROL_ID" "$MAIL_DOMAIN")

  curl -s -X POST "$URL" \
    -F "envelope=${ENVELOPE}" \
    -F "from=${CONTACT_CAROL_EMAIL}" \
    -F "to=${CRM_USER2}" \
    -F "subject=Re: Your renewal — Carol Nova Systems" \
    -F "text=Hi Sarah, thanks for reaching out. Let's talk next Tuesday." | python3 -m json.tool

  echo "✓ Check Carol Williams → Email tab (direction: received)"
}

# ─────────────────────────────────────────────────────────
# Scenario 5: Email matched by address only (no BCC) — fallback matching
# Expected: EMAIL_SENT activity on Bob's record via email-address match
# ─────────────────────────────────────────────────────────
scenario_5() {
  separator "Scenario 5: Fallback email-address matching (no BCC)"

  ENVELOPE=$(printf '{"from":"%s","to":["%s"]}' "$CRM_USER1" "$CONTACT_BOB_EMAIL")

  curl -s -X POST "$URL" \
    -F "envelope=${ENVELOPE}" \
    -F "from=${CRM_USER1}" \
    -F "to=${CONTACT_BOB_EMAIL}" \
    -F "subject=Quick note (no BCC)" \
    -F "text=Bob, just a quick note without BCC — still should be captured via email match." | python3 -m json.tool

  echo "✓ Check Bob Martinez → Email tab (logged via email-address fallback, not BCC)"
}

# ─────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────
case "${1:-all}" in
  1) scenario_1 ;;
  2) scenario_2 ;;
  3) scenario_3 ;;
  4) scenario_4 ;;
  5) scenario_5 ;;
  all)
    scenario_1
    scenario_2
    scenario_3
    scenario_4
    scenario_5
    separator "All scenarios complete"
    echo "  Open the CRM and check:"
    echo "  • Bob Martinez → Email tab (scenarios 1, 2, 3, 5) + Files tab (scenario 1)"
    echo "  • Carol Williams → Email tab (scenario 4)"
    ;;
  *)
    echo "Usage: $0 [1|2|3|4|5|all]"
    exit 1
    ;;
esac
