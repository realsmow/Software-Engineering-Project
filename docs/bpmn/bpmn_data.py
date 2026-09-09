"""The four ULMs processes, transcribed from the activity diagrams in
docs/resource/ULMs_Software_Project_Presentation_V-2.pdf.

This file is the source of truth for wording and branching; bpmn_builder.py only
turns it into XML.  Every actor is a separate BPMN *participant* (pool), because
in BPMN a sequence flow may never cross a pool boundary -- what the activity
diagram drew as an arrow between swimlanes becomes a message flow here, and the
receiving pool needs something to wait on (a message start event the first time,
an intermediate catch event afterwards).

Thai labels carry deliberate spaces at word boundaries: bpmn-js wraps label text
on whitespace only, and unbroken Thai runs would overflow their shape.
"""

from bpmn_builder import Collaboration

USER = "ผู้ยืม (User)"
SYSTEM = "ระบบ ULMs (System)"
STAFF = "เจ้าหน้าที่ (Staff)"
SUPERVISOR = "อาจารย์ผู้ดูแล (Supervisor)"

REVIEW = "ตรวจสอบรายละเอียดคำขอ & เหตุผลการใช้งาน"
ASSESS = "ประเมินระดับความเสียหาย (B0–B3) & บันทึกผล"
DISCREDIT = "คำนวณการหักเครดิต (Discredit)"
UPDATE = "อัปเดตข้อมูล อุปกรณ์และผู้ยืม"
NOTIFY = "แจ้งเตือนผู้ยืม"


# --------------------------------------------------------------------------
# 1. กระบวนการยืมอุปกรณ์
# --------------------------------------------------------------------------
def borrow() -> Collaboration:
    c = Collaboration("borrow", "กระบวนการยืมอุปกรณ์")
    u = c.pool("user", USER)
    s = c.pool("system", SYSTEM)
    t = c.pool("staff", STAFF)
    v = c.pool("supervisor", SUPERVISOR)

    # --- ผู้ยืม -----------------------------------------------------------
    u.node("start", "start", "เริ่ม", 0)
    u.node("pick", "user", "เลือกอุปกรณ์ ที่ต้องการยืม", 1)
    u.node("detail", "user", "ระบุจำนวน / วันยืม–คืน (เลือก Serial กรณี T2)", 2)
    u.node("submit", "send", "ส่งคำขอยืมอุปกรณ์", 3)
    u.node("wait_result", "catch", "รอผลพิจารณาคำขอ", 15)
    u.node("gw_result", "xor", "คำขอผ่านหรือไม่?", 16)
    u.node("end_reject", "end", "คำขอถูกปฏิเสธ", 17, row=1)
    u.node("wait_ready", "catch", "อุปกรณ์พร้อมรับ", 18)
    u.node("pickup", "manual", "เดินทางมารับอุปกรณ์ ที่จุดบริการ", 19)
    u.node("photo", "user", "ถ่ายรูปอุปกรณ์ตอนรับ + อัปโหลดเข้าระบบ", 20)
    u.node("end_ok", "end", "รับอุปกรณ์เรียบร้อย", 21)
    u.chain("start", "pick", "detail", "submit")
    u.flow("submit", "wait_result")
    u.flow("wait_result", "gw_result")
    u.flow("gw_result", "end_reject", "ไม่ผ่าน")
    u.flow("gw_result", "wait_ready", "ผ่าน")
    u.chain("wait_ready", "pickup", "photo", "end_ok")

    # --- ระบบ -------------------------------------------------------------
    # row 0 = เส้นทางหลัก, row 1 = รอ Supervisor, row 2 = เส้นทางที่อนุมัติแล้ว,
    # row 3 = สาขาขนานที่สอง, row 4 = เส้นทางปฏิเสธ
    s.node("recv", "msgstart", "รับคำขอยืม", 3)
    s.node("check", "service", "ตรวจสอบสิทธิ์ / Credit / ของคงเหลือ", 4)
    s.node("gw_pass", "xor", "ผ่านเกณฑ์?", 5)
    s.node("gw_appr", "xor", "ต้องขออนุมัติ?", 6)
    s.node("ask_sup", "send", "ส่งคำขอ ให้อาจารย์พิจารณา", 7, row=1)
    s.node("wait_dec", "catch", "รอผลพิจารณา", 10, row=1)
    s.node("gw_dec", "xor", "ผลพิจารณา?", 11, row=1)
    s.node("merge_ok", "xor", "", 12, row=2)
    s.node("fork", "and", "", 13, row=2)
    s.node("notify_ok", "send", "แจ้งเตือนผู้ยืม (อนุมัติ)", 14, row=2)
    s.node("update_status", "service", 'อัปเดตสถานะคำขอ เป็น "อนุมัติ"', 14, row=3)
    s.node("join", "and", "", 15, row=2)
    s.node("ask_staff", "send", "แจ้งเจ้าหน้าที่ จัดเตรียมอุปกรณ์", 16, row=2)
    s.node("wait_photo", "catch", "รอรูปถ่ายตอนรับ", 21, row=2)
    s.node("set_inuse", "service", "เปลี่ยนสถานะอุปกรณ์ เป็น IN USE", 22, row=2)
    s.node("end_ok", "end", "คำขอสมบูรณ์", 23, row=2)
    s.node("merge_rej", "xor", "", 12, row=4)
    s.node("notify_rej", "send", "แจ้งผลปฏิเสธ ให้ผู้ยืม", 13, row=4)
    s.node("end_rej", "end", "ปิดคำขอ", 14, row=4)
    s.chain("recv", "check", "gw_pass")
    s.flow("gw_pass", "gw_appr", "ผ่านเกณฑ์")
    s.flow("gw_pass", "merge_rej", "ไม่ผ่านเกณฑ์")
    s.flow("gw_appr", "ask_sup", "ใช่")
    s.flow("gw_appr", "merge_ok", "ไม่")
    s.chain("ask_sup", "wait_dec", "gw_dec")
    s.flow("gw_dec", "merge_ok", "อนุมัติ")
    s.flow("gw_dec", "merge_rej", "ไม่อนุมัติ")
    s.chain("merge_rej", "notify_rej", "end_rej")
    s.flow("merge_ok", "fork")
    s.flow("fork", "notify_ok")
    s.flow("fork", "update_status")
    s.flow("notify_ok", "join")
    s.flow("update_status", "join")
    s.chain("join", "ask_staff", "wait_photo", "set_inuse", "end_ok")

    # --- เจ้าหน้าที่ ------------------------------------------------------
    t.node("recv", "msgstart", "รับแจ้งให้จัดเตรียม", 16)
    t.node("prepare", "manual", "จัดเตรียมอุปกรณ์ ตาม Serial/รายการ", 17)
    t.node("end", "end", "อุปกรณ์พร้อมส่งมอบ", 18)
    t.chain("recv", "prepare", "end")

    # --- อาจารย์ผู้ดูแล ---------------------------------------------------
    v.node("recv", "msgstart", "รับคำขออนุมัติ", 7)
    v.node("review", "user", REVIEW, 8)
    v.node("gw_dec", "xor", "ผลพิจารณา?", 9)
    v.node("send_ok", "send", "แจ้งผลอนุมัติ", 10)
    v.node("end_ok", "end", "จบการพิจารณา", 11)
    v.node("send_no", "send", "แจ้งผลไม่อนุมัติ", 10, row=1)
    v.node("end_no", "end", "จบการพิจารณา", 11, row=1)
    v.chain("recv", "review", "gw_dec")
    v.flow("gw_dec", "send_ok", "อนุมัติ")
    v.flow("gw_dec", "send_no", "ไม่อนุมัติ")
    v.flow("send_ok", "end_ok")
    v.flow("send_no", "end_no")

    s.note(
        "rule_appr",
        "ต้องขออนุมัติเมื่อ: อุปกรณ์ระดับ T2 "
        "หรือ อุปกรณ์ระดับ T1 ที่ระดับการยืม อยู่ใน D2/D3",
        "gw_appr", 8, row=0,
    )

    c.message("user.submit", "system.recv", "คำขอยืมอุปกรณ์")
    c.message("system.ask_sup", "supervisor.recv", "คำขอรออนุมัติ")
    c.message("supervisor.send_ok", "system.wait_dec", "ผลพิจารณา: อนุมัติ")
    c.message("supervisor.send_no", "system.wait_dec", "ผลพิจารณา: ไม่อนุมัติ")
    c.message("system.notify_rej", "user.wait_result", "แจ้งผล: คำขอถูกปฏิเสธ")
    c.message("system.notify_ok", "user.wait_result", "แจ้งผล: อนุมัติ")
    c.message("system.ask_staff", "staff.recv", "ใบจัดเตรียมอุปกรณ์")
    c.message("staff.prepare", "user.wait_ready", "แจ้งว่าอุปกรณ์พร้อมรับ")
    c.message("user.photo", "system.wait_photo", "รูปถ่ายตอนรับอุปกรณ์")
    return c


# --------------------------------------------------------------------------
# 2. กระบวนการคืนอุปกรณ์
# --------------------------------------------------------------------------
def ret() -> Collaboration:
    c = Collaboration("return", "กระบวนการคืนอุปกรณ์")
    u = c.pool("user", USER)
    s = c.pool("system", SYSTEM)
    t = c.pool("staff", STAFF)

    u.node("start", "start", "เริ่ม", 0)
    u.node("bring", "manual", "นำอุปกรณ์มาคืน ณ จุดบริการ", 1)
    u.node("wait", "catch", "รับแจ้งผลการคืน", 16)
    u.node("end", "end", "จบการคืน", 17)
    u.chain("start", "bring")
    u.flow("bring", "wait")
    u.flow("wait", "end")

    t.node("recv", "msgstart", "รับคืนอุปกรณ์", 1)
    t.node("photo", "user", "ถ่ายรูปอุปกรณ์ตอนคืน + อัปโหลดเข้าระบบ", 2)
    t.node("confirm", "user", "กดยืนยัน การส่งคืนในแอป", 3)
    t.node("inspect", "manual", "ตรวจรับอุปกรณ์ & จำนวน", 4)
    t.node("compare", "user", 'เปรียบเทียบรูปถ่าย "ก่อนยืม vs หลังคืน"', 5)
    t.node("gw_dmg", "xor", "พบความเสียหาย?", 6)
    t.node("assess", "user", ASSESS, 7, row=1)
    t.node("merge", "xor", "", 8)
    t.node("send", "send", "ส่งผลการตรวจรับ ให้ระบบ", 9)
    t.node("end", "end", "จบงานรับคืน", 10)
    t.chain("recv", "photo", "confirm", "inspect", "compare", "gw_dmg")
    t.flow("gw_dmg", "assess", "ใช่")
    t.flow("gw_dmg", "merge", "ไม่")
    t.flow("assess", "merge")
    t.chain("merge", "send", "end")

    s.node("recv", "msgstart", "รับผลการตรวจรับคืน", 10)
    s.node("gw_dmg", "xor", "มีความเสียหาย?", 11)
    s.node("discredit", "service", DISCREDIT, 12, row=1)
    s.node("merge", "xor", "", 13)
    s.node("fork", "and", "", 14)
    s.node("notify", "send", NOTIFY, 15)
    s.node("update", "service", UPDATE, 15, row=1)
    s.node("join", "and", "", 16)
    s.node("end", "end", "ปิดรายการคืน", 17)
    s.chain("recv", "gw_dmg")
    s.flow("gw_dmg", "discredit", "พบความเสียหาย")
    s.flow("gw_dmg", "merge", "ไม่พบ")
    s.flow("discredit", "merge")
    s.flow("merge", "fork")
    s.flow("fork", "notify")
    s.flow("fork", "update")
    s.flow("notify", "join")
    s.flow("update", "join")
    s.flow("join", "end")

    c.message("user.bring", "staff.recv", "อุปกรณ์ที่นำมาคืน")
    c.message("staff.send", "system.recv", "ผลการตรวจรับคืน")
    c.message("system.notify", "user.wait", "ผลการคืนและเครดิตที่ถูกหัก")
    return c


# --------------------------------------------------------------------------
# 3. กระบวนการอุทธรณ์
# --------------------------------------------------------------------------
def appeal() -> Collaboration:
    c = Collaboration("appeal", "กระบวนการอุทธรณ์")
    u = c.pool("user", USER)
    s = c.pool("system", SYSTEM)
    v = c.pool("supervisor", SUPERVISOR)

    s.node("start", "start", "มีผลประเมิน", 0)
    s.node("send_result", "send", "ส่งผลการประเมิน และการหักคะแนน ให้ผู้ยืม", 1)
    s.node("gw_ev", "eventgw", "", 2)
    s.node("catch_appeal", "catch", "รับคำอุทธรณ์", 3)
    s.node("notify_sup", "send", "แจ้งเตือน อาจารย์ผู้ดูแล", 4)
    s.node("wait_dec", "catch", "รอผลพิจารณา", 9)
    s.node("gw_dec", "xor", "ผลพิจารณา?", 10)
    s.node("timer", "timer", "พ้นกำหนดยื่นอุทธรณ์", 3, row=1)
    s.node("end_none", "end", "ไม่มีการอุทธรณ์", 4, row=1)
    s.node("notify_keep", "send", "แจ้งผู้ยืม: ยืนผลเดิม", 11, row=1)
    s.node("end_keep", "end", "ปิดคำอุทธรณ์ (ยืนผลเดิม)", 12, row=1)
    s.node("fork", "and", "", 11, row=2)
    s.node("notify_user", "send", NOTIFY, 12, row=2)
    s.node("update", "service", UPDATE, 12, row=3)
    s.node("join", "and", "", 13, row=2)
    s.node("end_ok", "end", "ปิดคำอุทธรณ์ (แก้ไขผลแล้ว)", 14, row=2)
    s.chain("start", "send_result", "gw_ev")
    s.flow("gw_ev", "catch_appeal")
    s.flow("gw_ev", "timer")
    s.flow("timer", "end_none")
    s.chain("catch_appeal", "notify_sup")
    s.flow("notify_sup", "wait_dec")
    s.flow("wait_dec", "gw_dec")
    s.flow("gw_dec", "notify_keep", "ไม่เห็นชอบ")
    s.flow("notify_keep", "end_keep")
    s.flow("gw_dec", "fork", "เห็นชอบ")
    s.flow("fork", "notify_user")
    s.flow("fork", "update")
    s.flow("notify_user", "join")
    s.flow("update", "join")
    s.flow("join", "end_ok")

    u.node("recv", "msgstart", "รับผลการประเมิน", 1)
    u.node("gw_appeal", "xor", "ยื่นอุทธรณ์?", 2)
    u.node("submit", "user", "ส่งคำอุทธรณ์ และระบุเหตุผล", 3)
    u.node("end_accept", "end", "ยอมรับผลประเมิน", 4, row=1)
    u.node("wait", "catch", "รับผลพิจารณาอุทธรณ์", 13)
    u.node("end", "end", "จบกระบวนการอุทธรณ์", 14)
    u.chain("recv", "gw_appeal")
    u.flow("gw_appeal", "submit", "ใช่")
    u.flow("gw_appeal", "end_accept", "ไม่")
    u.flow("submit", "wait")
    u.flow("wait", "end")

    v.node("recv", "msgstart", "รับแจ้งคำอุทธรณ์", 4)
    v.node("review", "user", REVIEW, 5)
    v.node("gw_dec", "xor", "ผลพิจารณา?", 6)
    v.node("fix", "user", "แก้ไขผลประเมินเครดิต ให้ถูกต้อง ตามที่พิจารณา", 7)
    v.node("send_agree", "send", "ส่งผล: เห็นชอบ", 8)
    v.node("end_agree", "end", "จบการพิจารณา", 9)
    v.node("send_disagree", "send", "ส่งผล: ไม่เห็นชอบ", 7, row=1)
    v.node("end_disagree", "end", "จบการพิจารณา", 8, row=1)
    v.chain("recv", "review", "gw_dec")
    v.flow("gw_dec", "fix", "เห็นชอบ")
    v.flow("gw_dec", "send_disagree", "ไม่เห็นชอบ")
    v.chain("fix", "send_agree", "end_agree")
    v.flow("send_disagree", "end_disagree")

    s.note(
        "rule_window",
        "กรอบเวลายื่นอุทธรณ์ — ไม่ได้ระบุไว้ใน activity diagram เดิม "
        "ใส่ไว้เพื่อให้ฝั่งระบบ ไม่ค้างรอตลอดไป ทีมต้องยืนยันจำนวนวันอีกครั้ง",
        "timer", 3, row=2, h=96,
    )

    c.message("system.send_result", "user.recv", "ผลการประเมินและการหักคะแนน")
    c.message("user.submit", "system.catch_appeal", "คำอุทธรณ์")
    c.message("system.notify_sup", "supervisor.recv", "แจ้งคำอุทธรณ์รอพิจารณา")
    c.message("supervisor.send_agree", "system.wait_dec", "ผลพิจารณา: เห็นชอบ")
    c.message("supervisor.send_disagree", "system.wait_dec", "ผลพิจารณา: ไม่เห็นชอบ")
    c.message("system.notify_keep", "user.wait", "แจ้งผล: ยืนผลเดิม")
    c.message("system.notify_user", "user.wait", "แจ้งผล: แก้ไขเครดิตแล้ว")
    return c


# --------------------------------------------------------------------------
# 4. กระบวนการยืมต่อ
# --------------------------------------------------------------------------
def renew() -> Collaboration:
    c = Collaboration("renew", "กระบวนการยืมต่อ")
    u = c.pool("user", USER)
    s = c.pool("system", SYSTEM)
    t = c.pool("staff", STAFF)
    v = c.pool("supervisor", SUPERVISOR)

    u.node("start", "start", "เริ่ม", 0)
    u.node("select", "user", "เลือกรายการอุปกรณ์ ที่ต้องการยืมต่อ", 1)
    u.node("wait", "catch", "รับแจ้งผลการยืมต่อ", 16)
    u.node("gw_res", "xor", "ต้องส่งคำขอใหม่?", 17)
    u.node("end_done", "end", "จบการยืมต่อ", 18)
    u.node("resubmit", "user", "ส่งคำขอยืมใหม่ อีกครั้ง", 18, row=1)
    u.node("end_new", "end", "เริ่มคำขอใหม่", 19, row=1)
    u.chain("start", "select")
    u.flow("select", "wait")
    u.flow("wait", "gw_res")
    u.flow("gw_res", "end_done", "ไม่")
    u.flow("gw_res", "resubmit", "ใช่ (T3)")
    u.flow("resubmit", "end_new")

    # row 0 = เส้นทาง T1, row 1 = เส้นทาง T2 (ขออนุมัติ), row 2 = เส้นทาง T0/T3,
    # row 3 = จุดรวมและงานปิดท้าย, row 4 = สาขาขนานที่สอง + เส้นทางไม่อนุมัติ
    s.node("recv", "msgstart", "รับคำขอยืมต่อ", 1)
    s.node("gw_t12", "xor", "เป็น T1 หรือ T2?", 2)
    s.node("gw_t1", "xor", "เป็น T1?", 3)
    s.node("gw_first", "xor", "ต่ออายุครั้งที่ 1?", 4)
    s.node("ask_staff", "send", "แจ้งเจ้าหน้าที่ ตรวจสภาพอุปกรณ์", 5)
    s.node("wait_insp", "catch", "รอผลตรวจสภาพ", 10)
    s.node("gw_dmg", "xor", "พบความเสียหาย?", 11)
    s.node("ask_sup", "send", "ส่งคำขอ ให้อาจารย์พิจารณา", 5, row=1)
    s.node("wait_dec", "catch", "รอผลพิจารณา", 9, row=1)
    s.node("gw_dec", "xor", "ผลพิจารณา?", 10, row=1)
    s.node("discredit", "service", DISCREDIT, 12, row=1)
    s.node("gw_t0", "xor", "เป็น T0?", 3, row=2)
    s.node("notify_t3", "send", "แจ้งผู้ยืม: T3 ต่ออายุไม่ได้", 12, row=2)
    s.node("end_t3", "end", "ปิดคำขอ (T3)", 13, row=2)
    s.node("merge_ok", "xor", "", 13, row=3)
    s.node("fork", "and", "", 14, row=3)
    s.node("notify_user", "send", NOTIFY, 15, row=3)
    s.node("update", "service", UPDATE, 15, row=4)
    s.node("join", "and", "", 16, row=3)
    s.node("end_ok", "end", "ปิดรายการยืมต่อ", 17, row=3)
    s.node("notify_rej", "send", "แจ้งผู้ยืม: ไม่อนุมัติ", 11, row=4)
    s.node("end_rej", "end", "ปิดคำขอ (ไม่อนุมัติ)", 12, row=4)
    s.chain("recv", "gw_t12")
    s.flow("gw_t12", "gw_t1", "ใช่ (T1/T2)")
    s.flow("gw_t12", "gw_t0", "ไม่ (T0/T3)")
    s.flow("gw_t1", "gw_first", "ใช่ (T1)")
    s.flow("gw_t1", "ask_sup", "ไม่ (T2)")
    s.flow("gw_first", "ask_staff", "ไม่")
    s.flow("gw_first", "merge_ok", "ใช่")
    s.chain("ask_staff", "wait_insp", "gw_dmg")
    s.flow("gw_dmg", "discredit", "พบ")
    s.flow("gw_dmg", "merge_ok", "ไม่พบ")
    s.flow("discredit", "merge_ok")
    s.chain("ask_sup", "wait_dec", "gw_dec")
    s.flow("gw_dec", "merge_ok", "อนุมัติ")
    s.flow("gw_dec", "notify_rej", "ไม่อนุมัติ")
    s.flow("notify_rej", "end_rej")
    s.flow("gw_t0", "merge_ok", "ใช่ (T0)")
    s.flow("gw_t0", "notify_t3", "ไม่ (T3)")
    s.flow("notify_t3", "end_t3")
    s.flow("merge_ok", "fork")
    s.flow("fork", "notify_user")
    s.flow("fork", "update")
    s.flow("notify_user", "join")
    s.flow("update", "join")
    s.flow("join", "end_ok")

    t.node("recv", "msgstart", "รับแจ้งให้ตรวจสภาพ", 5)
    t.node("inspect", "manual", "ตรวจสภาพอุปกรณ์", 6)
    t.node("gw_dmg", "xor", "พบความเสียหาย?", 7)
    t.node("assess", "user", ASSESS, 8, row=1)
    t.node("merge", "xor", "", 9)
    t.node("send", "send", "ส่งผลตรวจสภาพ ให้ระบบ", 10)
    t.node("end", "end", "จบงานตรวจสภาพ", 11)
    t.chain("recv", "inspect", "gw_dmg")
    t.flow("gw_dmg", "assess", "พบ")
    t.flow("gw_dmg", "merge", "ไม่พบ")
    t.flow("assess", "merge")
    t.chain("merge", "send", "end")

    v.node("recv", "msgstart", "รับคำขออนุมัติ", 5)
    v.node("review", "user", REVIEW, 6)
    v.node("gw_dec", "xor", "ผลพิจารณา?", 7)
    v.node("send_ok", "send", "แจ้งผลอนุมัติ", 8)
    v.node("end_ok", "end", "จบการพิจารณา", 9)
    v.node("send_no", "send", "แจ้งผลไม่อนุมัติ", 8, row=1)
    v.node("end_no", "end", "จบการพิจารณา", 9, row=1)
    v.chain("recv", "review", "gw_dec")
    v.flow("gw_dec", "send_ok", "อนุมัติ")
    v.flow("gw_dec", "send_no", "ไม่อนุมัติ")
    v.flow("send_ok", "end_ok")
    v.flow("send_no", "end_no")

    s.note(
        "rule_tier",
        "เงื่อนไขตามระดับอุปกรณ์ — "
        "T0: ต่ออายุได้ทันที · "
        "T1: ครั้งที่ 1 ได้ทันที ครั้งถัดไปต้องตรวจสภาพ · "
        "T2: ต้องให้อาจารย์อนุมัติ · "
        "T3: ต่ออายุไม่ได้ ต้องส่งคำขอใหม่",
        "gw_t12", 1, row=1, h=124,
    )

    c.message("user.select", "system.recv", "คำขอยืมต่อ")
    c.message("system.ask_staff", "staff.recv", "ใบตรวจสภาพอุปกรณ์")
    c.message("staff.send", "system.wait_insp", "ผลตรวจสภาพอุปกรณ์")
    c.message("system.ask_sup", "supervisor.recv", "คำขอยืมต่อรออนุมัติ")
    c.message("supervisor.send_ok", "system.wait_dec", "ผลพิจารณา: อนุมัติ")
    c.message("supervisor.send_no", "system.wait_dec", "ผลพิจารณา: ไม่อนุมัติ")
    c.message("system.notify_t3", "user.wait", "แจ้งผล: T3 ต่ออายุไม่ได้")
    c.message("system.notify_rej", "user.wait", "แจ้งผล: ไม่อนุมัติ")
    c.message("system.notify_user", "user.wait", "แจ้งผล: ยืมต่อสำเร็จ")
    return c


DIAGRAMS = {
    "01-borrow": borrow,
    "02-return": ret,
    "03-appeal": appeal,
    "04-renew": renew,
}
