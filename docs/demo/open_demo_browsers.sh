#!/usr/bin/env bash
# Open one Firefox window per role, each with its own cookie jar.
#
# The session cookie is per origin and per profile, so two windows of the same
# profile are the same logged-in user — logging in as staff in one would sign
# the borrower out of the other. Separate profiles keep four roles logged in at
# once, which is what a demo needs when it crosses desks every other step.
#
# Profiles are created on first run and remembered afterwards, so the passwords
# can be saved in each one and the whole thing is two clicks on stage.
#
#   bash docs/demo/open_demo_browsers.sh
set -uo pipefail

URL="${DEMO_URL:-http://localhost:5173}"

for profile in ulms-staff ulms-supervisor ulms-admin; do
  if ! grep -q "Name=${profile}$" ~/snap/firefox/common/.mozilla/firefox/profiles.ini 2>/dev/null \
     && ! grep -q "Name=${profile}$" ~/.mozilla/firefox/profiles.ini 2>/dev/null; then
    echo "creating profile ${profile}"
    firefox -CreateProfile "$profile" >/dev/null 2>&1
  fi
done

echo "opening ${URL}"
# The default profile takes the borrower: it is the one already running, and a
# plain `firefox <url>` lands in it as a new tab instead of a fourth window.
firefox "$URL" >/dev/null 2>&1 &
sleep 2
for profile in ulms-staff ulms-supervisor ulms-admin; do
  firefox -P "$profile" --no-remote "$URL" >/dev/null 2>&1 &
  sleep 2
done

cat <<'TXT'

หน้าต่างไหนล็อกอินด้วยบัญชีไหน
  default (ที่เปิดอยู่เดิม)  ผู้ยืม        test_borrower   / borrower1234
  ulms-staff                เจ้าหน้าที่    test_staff      / staff1234
  ulms-supervisor           อาจารย์       test_supervisor / supervisor1234
  ulms-admin                ผู้ดูแลระบบ    test_admin      / admin1234

TXT
