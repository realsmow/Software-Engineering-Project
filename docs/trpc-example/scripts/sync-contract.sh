#!/usr/bin/env bash
#
# วาระ ว-01 · สคริปต์ขนส่งสัญญาข้ามฝั่ง
# ปลายทางจริง: scripts/sync-contract.sh (ที่ราก repo)
#
# สมมติว่าที่ประชุมเลือกทางเลือก ข. - คัดลอกไฟล์ที่ถูก generate
#   เหตุผล: เริ่มได้ทันที ไม่ต้องรื้อโครง repo กลางเทอม
#   เงื่อนไขที่ต้องมาคู่กันเสมอ (ไม่งั้นแย่กว่าไม่มีสัญญา):
#     1. ต้องคัดลอกด้วยสคริปต์ ไม่ใช่ด้วยมือ  <- ไฟล์นี้
#     2. tsc --noEmit ทั้งสองฝั่งต้องเป็นเงื่อนไขก่อน merge
#
# ถ้าที่ประชุมเลือกทางเลือก ก. (npm/pnpm workspaces) ให้ลบไฟล์นี้ทิ้ง
# เพราะ workspaces ทำให้ type ตรงกันอัตโนมัติโดยไม่ต้องคัดลอก
#
# วิธีใช้:  npm run sync:contract        (เพิ่ม script ใน package.json ที่ราก repo)
#          ./scripts/sync-contract.sh --check    ตรวจอย่างเดียว ไม่เขียนทับ (ใช้ใน CI)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/backend-preview/backend/src/@generated"
DEST="$REPO_ROOT/frontend/src/server-types"

CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

if [[ ! -d "$SRC" ]]; then
  echo "ไม่พบไฟล์สัญญาที่ $SRC" >&2
  echo "" >&2
  echo "สาเหตุที่พบบ่อย:" >&2
  echo "  - ยังไม่ได้ตั้ง autoSchemaFile ใน app.module.ts (ดู ว-01)" >&2
  echo "  - ยังไม่เคยรัน backend เลย ลอง: cd backend-preview/backend && npm run start:dev" >&2
  exit 1
fi

if $CHECK_ONLY; then
  # ใช้ใน CI: ถ้าสัญญาฝั่ง frontend ไม่ตรงกับที่ backend สร้างล่าสุด ให้ fail
  # นี่คือด่านที่กันไม่ให้ "สัญญาเก่าได้เงียบ ๆ" ซึ่งเป็นความเสี่ยงหลักของทางเลือก ข.
  if diff -rq "$SRC" "$DEST" >/dev/null 2>&1; then
    echo "สัญญาตรงกัน"
    exit 0
  fi
  echo "สัญญาฝั่ง frontend ไม่ตรงกับที่ backend สร้างล่าสุด" >&2
  echo "แก้โดยรัน: npm run sync:contract แล้ว commit ผลลัพธ์ไปด้วย" >&2
  diff -rq "$SRC" "$DEST" >&2 || true
  exit 1
fi

mkdir -p "$DEST"
rm -rf "${DEST:?}"/*
cp -R "$SRC"/. "$DEST"/

# กันคนเผลอแก้ไฟล์ที่ถูก generate
for f in "$DEST"/*.ts; do
  [[ -e "$f" ]] || continue
  printf '// AUTO-GENERATED - ห้ามแก้ด้วยมือ สร้างใหม่ด้วย: npm run sync:contract\n%s' \
    "$(cat "$f")" > "$f.tmp" && mv "$f.tmp" "$f"
done

echo "คัดลอกสัญญาแล้ว: $SRC -> $DEST"
echo "อย่าลืม commit ไฟล์ใน $DEST ไปพร้อมกับ PR ฝั่ง backend"
