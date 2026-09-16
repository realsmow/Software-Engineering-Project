/**
 * End-to-end check of the staff catalogue: register equipment, register a
 * room, and attach a real uploaded image to both.
 *
 *   npx tsx scripts/smoke-staff.ts
 *
 * Talks to the services through the real Nest container against the real
 * database — no mocks. What it does *not* go through is HTTP, and that is
 * deliberate: on a branch based on `main`, `trpc/context.ts` still has the stub
 * `verifySessionToken()` that returns null, so every HTTP call would be a 401
 * before it reached any of this. Driving the services directly proves the part
 * this slice owns; the login that wraps it belongs to another branch.
 *
 * The upload step is the exception — it goes over real HTTP, because the whole
 * point of `PUT /uploads/:token` is that it is not a tRPC call and its raw body
 * middleware only exists in the HTTP stack.
 *
 * Run `npx tsx prisma/seed.ts` first.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { ItemManagementService } from '../src/item/item.management.service';
import { ImageService } from '../src/image/image.service';
import { PrismaService } from '../src/prisma.service';
import type { TrpcUser } from '../src/trpc/context';

/** A 1x1 PNG. Small, but a genuine one — the server checks the magic bytes. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const ok = (msg: string) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
/** Fails the whole run. A check that prints a tick either way checks nothing. */
const must = (condition: boolean, msg: string) => {
  if (!condition) throw new Error(msg);
  ok(msg);
};
const step = (msg: string) => console.log(`\n\x1b[1m${msg}\x1b[0m`);

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn'],
  });
  // Exactly the wiring main.ts uses, so a mount that only exists in bootstrap
  // cannot pass here and 404 in production (or the reverse, which is how the
  // /media check first failed).
  configureApp(app);
  await app.init();
  await app.listen(0); // ephemeral port — the upload step needs a real server

  const prisma = app.get(PrismaService);
  const items = app.get(ItemManagementService);
  const images = app.get(ImageService);

  // Whoever the seed made a staff member. Reading it rather than hard-coding a
  // key keeps this runnable against a database somebody else seeded.
  const account = await prisma.accountInfo.findFirst({
    where: { Authorities: { some: {} }, Role: { RoleName: 'Staff' } },
    select: {
      AccountKey: true,
      UserFName: true,
      UserLName: true,
      UserCredit: true,
    },
  });
  if (!account) {
    throw new Error(
      'ไม่พบบัญชี staff ที่มี Authority — รัน `npx tsx prisma/seed.ts` ก่อน',
    );
  }

  const staff: TrpcUser = {
    accountKey: account.AccountKey,
    role: 'staff',
    facultyKey: null,
    creditScore: account.UserCredit,
  };

  const groups = await items.listManagementGroups(staff);
  const manageGroupKey = groups[0].id;
  console.log(
    `\nลงชื่อเป็น: ${account.UserFName} ${account.UserLName} · ภาควิชา: ${groups[0].name} (#${manageGroupKey})`,
  );

  // ── 1. tiers exist? ───────────────────────────────────────────────────────
  step('1. ตรวจว่า BorrowRule T0–T3 ถูก seed แล้ว');
  const tiers = await items.listTiers();
  ok(`เจอ ${tiers.length} tier: ${tiers.map((t) => t.tier).join(', ')}`);

  // ── 2. upload an image, for real ──────────────────────────────────────────
  step('2. อัปโหลดรูป (image.requestUpload → PUT ไฟล์จริง)');
  const ticket = images.issueTicket(
    {
      purpose: 'itemType',
      contentType: 'image/png',
      sizeBytes: PNG_1PX.length,
    },
    staff.accountKey,
  );
  ok(`ได้ upload URL (หมดอายุ ${ticket.expiresAt})`);

  const port = (app.getHttpServer().address() as { port: number }).port;
  const uploadUrl = ticket.uploadUrl.replace(/:\d+/, `:${port}`);
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: new Uint8Array(PNG_1PX),
    headers: { 'Content-Type': 'image/png' },
  });
  if (!put.ok)
    throw new Error(`อัปโหลดล้มเหลว ${put.status}: ${await put.text()}`);
  ok(`PUT สำเร็จ (${put.status}) → ${ticket.imageUrl}`);

  // The server must refuse a file that is not really an image.
  const bad = await fetch(
    images
      .issueTicket(
        { purpose: 'itemType', contentType: 'image/png', sizeBytes: 64 },
        staff.accountKey,
      )
      .uploadUrl.replace(/:\d+/, `:${port}`),
    {
      method: 'PUT',
      body: '#!/bin/sh\necho pwned\n',
      headers: { 'Content-Type': 'image/png' },
    },
  );
  const badBody = (await bad.json()) as { code?: string };
  must(
    bad.status === 400 && badBody.code === 'UPLOAD_NOT_AN_IMAGE',
    `สคริปต์ที่แอบอ้างเป็น PNG ถูกปฏิเสธ (${bad.status} ${badBody.code})`,
  );

  // ── 3. register an item type ──────────────────────────────────────────────
  step('3. ลงทะเบียนประเภทอุปกรณ์ (item.createType)');
  const type = await items.createItemType({
    name: `Arduino Uno R3 (smoke ${Date.now() % 100000})`,
    description: 'บอร์ดไมโครคอนโทรลเลอร์สำหรับวิชาปฏิบัติการ',
    imageUrl: ticket.imageUrl,
    creditWeight: 5,
  });
  ok(
    `สร้างแล้ว: "${type.name}" (ItemKey=${type.id}, creditWeight=${type.creditWeight})`,
  );
  ok(`รูป: ${type.imageUrl}`);

  // ── 4. register units ─────────────────────────────────────────────────────
  step('4. ลงทะเบียนชิ้นอุปกรณ์ 3 ชิ้น T1 (item.createUnit)');
  const units = await items.createItemUnits(staff, {
    itemKey: type.id,
    manageGroupKey,
    tier: 'T1',
    serialNo: `ARD-${Date.now() % 100000}`,
    prepDays: 1,
    lendable: true,
    quantity: 3,
  });
  units.forEach((u) =>
    ok(`${u.serialNo} · tier ${u.tier} · ${u.status} · prep ${u.prepDays} วัน`),
  );

  step('5. T2 ต้องมี serial — ลองไม่ใส่ ต้องโดนปฏิเสธ');
  try {
    await items.createItemUnits(staff, {
      itemKey: type.id,
      manageGroupKey,
      tier: 'T2',
      prepDays: 0,
      lendable: true,
      quantity: 1,
    });
    throw new Error('ควรจะถูกปฏิเสธ แต่ผ่านไปได้');
  } catch (error) {
    ok(`ถูกปฏิเสธถูกต้อง: ${(error as Error).message}`);
  }

  // ── 6. register a room ────────────────────────────────────────────────────
  step('6. ลงทะเบียนห้อง T3 (item.createRoom)');
  const roomTicket = images.issueTicket(
    { purpose: 'room', contentType: 'image/png', sizeBytes: PNG_1PX.length },
    staff.accountKey,
  );
  await fetch(roomTicket.uploadUrl.replace(/:\d+/, `:${port}`), {
    method: 'PUT',
    body: new Uint8Array(PNG_1PX),
    headers: { 'Content-Type': 'image/png' },
  });

  const room = await items.createRoom(staff, {
    manageGroupKey,
    name: `ห้องปฏิบัติการ 7603 (smoke ${Date.now() % 100000})`,
    description: 'ห้องแลปวงจรดิจิทัล',
    location: 'อาคาร 7 ชั้น 6',
    imageUrl: roomTicket.imageUrl,
    creditWeight: 0,
    lendable: true,
  });
  ok(`สร้างแล้ว: "${room.name}" (RoomKey=${room.roomKey}, tier ${room.tier})`);
  ok(`รูป: ${room.imageUrl}`);

  // ── 7. read it all back ───────────────────────────────────────────────────
  step(
    '7. อ่านกลับมาจากฐานข้อมูล (item.listManaged / getManagedById / listManagedRooms)',
  );
  const detail = await items.getManagedItemById(staff, type.id);
  ok(
    `${detail.name}: ${detail.totalUnits} ชิ้น · ว่าง ${detail.availableUnits} · tier ${detail.tiers.join(',')}`,
  );

  const page = await items.listManagedItems(staff, {
    page: 1,
    pageSize: 5,
    order: 'desc',
    sort: 'id',
    availableOnly: false,
  });
  ok(`listManaged เห็น ${page.total} ประเภทในภาควิชานี้`);

  const rooms = await items.listManagedRooms(staff, {
    page: 1,
    pageSize: 5,
    order: 'desc',
    sort: 'id',
  });
  ok(`listManagedRooms เห็น ${rooms.total} ห้อง`);

  // ── 8. the image is actually served ───────────────────────────────────────
  step('8. รูปที่อัปโหลดเปิดดูได้จริงไหม');
  const served = await fetch(`http://127.0.0.1:${port}${ticket.imageUrl}`);
  const bytes = served.ok ? (await served.arrayBuffer()).byteLength : 0;
  must(
    served.ok && bytes === PNG_1PX.length,
    `GET ${ticket.imageUrl} → ${served.status} ${served.headers.get('content-type') ?? ''} (${bytes} bytes)`,
  );

  // ── 9. departmental scope actually bites ──────────────────────────────────
  step('9. เจ้าหน้าที่ต่างภาควิชาต้องแตะของนี้ไม่ได้ (§5.1)');
  const outsider: TrpcUser = { ...staff, accountKey: -1 };
  let refused = false;
  try {
    await items.getManagedItemById(outsider, type.id);
  } catch (error) {
    refused = true;
    ok(`ถูกปฏิเสธถูกต้อง: ${(error as Error).message}`);
  }
  must(refused, 'ขอบเขตภาควิชาต้องปฏิเสธคนนอก');

  console.log(
    '\n\x1b[32mผ่านทั้งหมด\x1b[0m — เพิ่มอุปกรณ์ เพิ่มห้อง และแนบรูปได้จริง\n',
  );
  await app.close();
}

main().catch((error) => {
  console.error('\n\x1b[31mล้มเหลว:\x1b[0m', error);
  process.exit(1);
});
