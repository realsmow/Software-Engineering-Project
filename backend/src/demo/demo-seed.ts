import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type { PrismaService } from '../prisma.service';
import { hashPassword } from '../common/crypto/password';
import { seedReference } from '../seed/reference';
import { BASE_CREDIT } from '../common/credit/recompute-credit';
import {
  extraOpenDays,
  isClosedDay,
  localTimeToUtc,
  setHolidays,
  toLocalDayKey,
  workHours,
} from '../common/schemas/datetime.schema';
import { mapUserRole } from '../common/schemas/status.schema';
import { AuditService } from '../common/audit/audit.service';
import { StaffScopeService } from '../common/authority/staff-scope.service';
import { EligibilityService } from '../common/authority/eligibility.service';
import { CreditTierService } from '../common/credit/credit-tier.service';
import { PenaltyService } from '../common/penalty/penalty.service';
import { NotificationService } from '../notification/notification.service';
import { LoanRequestService } from '../loan/loan.request.service';
import { LoanService } from '../loan/loan.service';
import { LoanExtensionService } from '../loan/loan.extension.service';
import { ApprovalService } from '../approval/approval.service';
import { InspectionService } from '../inspection/inspection.service';
import { AppealService } from '../appeal/appeal.service';
import { CronService } from '../cron/cron.service';
import type { TrpcUser } from '../trpc/context';
import { installClock, realNow, restoreClock, setNow } from './demo-clock';
import { purge } from './purge';

/**
 * Presentation data: demo accounts, two demo departments with their own
 * equipment, and loans in every state, made by driving the real services so
 * penalties, credit, notifications and the audit log come out as if people
 * had used the app.
 *
 * Everything lives in its own departments, run only by the demo staff and
 * supervisor, so real staff never see demo requests and `removeDemo` can take
 * it all out again. What was created is recorded in SystemSetting "demoSeed".
 *
 * Dates are relative to when it runs: run it shortly before presenting.
 */
const MARKER = 'demoSeed';

const FACULTY = 'คณะวิศวกรรมศาสตร์';
const DEPARTMENTS = [
  'ห้องปฏิบัติการไมโครคอนโทรลเลอร์',
  'ศูนย์สื่อการเรียนรู้และมัลติมีเดีย',
] as const;

type Tier = 'T0' | 'T1' | 'T2';
const CATALOGUE: {
  key: string;
  name: string;
  desc: string;
  weight: number;
  tier: Tier;
  dept: 0 | 1;
  prefix: string;
  units: number;
}[] = [
  {
    key: 'arduino',
    name: 'บอร์ด Arduino Uno R3 พร้อมชุดเซ็นเซอร์',
    desc: 'บอร์ดไมโครคอนโทรลเลอร์ สาย USB และเซ็นเซอร์ 12 ชนิด',
    weight: 2,
    tier: 'T1',
    dept: 0,
    prefix: 'MCU-ARD',
    units: 5,
  },
  {
    key: 'meter',
    name: 'มัลติมิเตอร์ดิจิทัล Fluke 117',
    desc: 'วัดแรงดัน กระแส ความต้านทาน พร้อมสายวัด',
    weight: 2,
    tier: 'T1',
    dept: 0,
    prefix: 'MCU-DMM',
    units: 4,
  },
  {
    key: 'scope',
    name: 'ออสซิลโลสโคปดิจิทัล 4 ช่องสัญญาณ',
    desc: '200 MHz พร้อมโพรบ 4 เส้น',
    weight: 4,
    tier: 'T2',
    dept: 0,
    prefix: 'MCU-OSC',
    units: 2,
  },
  {
    key: 'driver',
    name: 'ชุดไขควงอิเล็กทรอนิกส์',
    desc: 'ไขควงหัวเปลี่ยน 24 หัว',
    weight: 1,
    tier: 'T0',
    dept: 0,
    prefix: 'MCU-SDR',
    units: 5,
  },
  {
    key: 'camera',
    name: 'กล้อง Mirrorless Sony a6400 พร้อมเลนส์',
    desc: 'เลนส์ 18-135 มม. แบตเตอรี่ 2 ก้อน การ์ด 64 GB',
    weight: 4,
    tier: 'T2',
    dept: 1,
    prefix: 'MED-CAM',
    units: 2,
  },
  {
    key: 'tripod',
    name: 'ขาตั้งกล้องและไฟสตูดิโอ',
    desc: 'ขาตั้ง 3 ขา และไฟ LED 2 ดวง',
    weight: 1,
    tier: 'T1',
    dept: 1,
    prefix: 'MED-TRI',
    units: 3,
  },
];

const ACCOUNTS = [
  {
    userId: 'demo.admin',
    role: 'Admin',
    first: 'ผู้ดูแลระบบ',
    last: '(สาธิต)',
  },
  { userId: 'demo.staff', role: 'Staff', first: 'สมศักดิ์', last: 'ใจดี' },
  {
    userId: 'demo.supervisor',
    role: 'Supervisor',
    first: 'อ.วิภาวรรณ',
    last: 'ศรีสุข',
  },
  { userId: 'demo.student1', role: 'Student', first: 'ณัฐวุฒิ', last: 'มีสุข' },
  {
    userId: 'demo.student2',
    role: 'Student',
    first: 'ปิยะนุช',
    last: 'แก้วงาม',
  },
  { userId: 'demo.student3', role: 'Student', first: 'ธนกร', last: 'วงศ์ใหญ่' },
  { userId: 'demo.student4', role: 'Student', first: 'กมลชนก', last: 'ทองดี' },
] as const;
type DemoUser = (typeof ACCOUNTS)[number]['userId'];

interface Marker {
  accountKeys: number[];
  groupKeys: number[];
  itemKeys: number[];
  resourceKeys: number[];
  mediaKeys: string[];
  /** Authority roles this run had to create (none if they already existed). */
  authorityRoleKeys: number[];
  facultyKey: number | null;
  openDay: string | null;
  createdAt: string;
}

export interface DemoOptions {
  password: string;
  /** Optional `YYYY-MM-DD`: open that weekend day for the demo departments. */
  openDay?: string;
  log?: (line: string) => void;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export async function seedDemo(prisma: PrismaService, options: DemoOptions) {
  const log = options.log ?? console.log;
  if (await prisma.systemSetting.findUnique({ where: { Key: MARKER } })) {
    throw new Error(
      'Demo data is already in this database. Run with --remove first to replace it.',
    );
  }
  if (options.password.length < 8) {
    throw new Error('DEMO_PASSWORD must be at least 8 characters.');
  }

  await seedReference(prisma);
  await loadCounterSettings(prisma);

  const marker: Marker = {
    accountKeys: [],
    groupKeys: [],
    itemKeys: [],
    resourceKeys: [],
    mediaKeys: [],
    authorityRoleKeys: [],
    facultyKey: null,
    openDay: null,
    createdAt: new Date().toISOString(),
  };
  // Saved first and updated as rows are made, so a run that fails halfway can
  // still be removed.
  await saveMarker(prisma, marker);

  let faculty = await prisma.facultyInfo.findFirst({
    where: { FacultyName: FACULTY },
  });
  if (!faculty) {
    faculty = await prisma.facultyInfo.create({
      data: { FacultyName: FACULTY },
    });
    marker.facultyKey = faculty.FacultyKey;
  }

  for (const name of DEPARTMENTS) {
    const group = await prisma.managementGroup.create({
      data: {
        GroupType: 'Faculty',
        Branch: {
          create: { BranchName: name, FacultyKey: faculty.FacultyKey },
        },
      },
    });
    marker.groupKeys.push(group.ManageGroupKey);
  }
  await saveMarker(prisma, marker);

  const roleKey = async (name: string) =>
    (await prisma.roleInfo.findFirstOrThrow({ where: { RoleName: name } }))
      .RoleKey;
  const hashed = await hashPassword(options.password);
  const keys = {} as Record<DemoUser, number>;
  for (const a of ACCOUNTS) {
    const account = await prisma.accountInfo.create({
      data: {
        UserID: a.userId,
        Email: `${a.userId}@demo.ulms.test`,
        HashedPassword: hashed,
        UserFName: a.first,
        UserLName: a.last,
        UserCredit: BASE_CREDIT,
        RoleKey: await roleKey(a.role),
        FacultyKey: faculty.FacultyKey,
      },
    });
    keys[a.userId] = account.AccountKey;
    marker.accountKeys.push(account.AccountKey);
  }
  await saveMarker(prisma, marker);

  // Who may do what in the demo departments.
  const studentRole = await authorityRole(prisma, marker, 'Student', 0);
  const staffRole = await authorityRole(prisma, marker, 'Lab staff', 2);
  for (const a of ACCOUNTS) {
    for (const groupKey of marker.groupKeys) {
      await prisma.authority.create({
        data: {
          AccountKey: keys[a.userId],
          ManageGroupKey: groupKey,
          AuthorityRoleKey:
            a.role === 'Student'
              ? studentRole.AuthorityRoleKey
              : staffRole.AuthorityRoleKey,
        },
      });
    }
  }

  const ruleKey = async (tier: Tier) =>
    (await prisma.borrowRule.findFirstOrThrow({ where: { RuleName: tier } }))
      .BorrowRuleKey;
  const units = {} as Record<string, number[]>;
  for (const c of CATALOGUE) {
    const item = await prisma.itemInfo.create({
      data: { ItemName: c.name, ItemDesc: c.desc, CreditWeight: c.weight },
    });
    marker.itemKeys.push(item.ItemKey);
    units[c.key] = [];
    for (let i = 1; i <= c.units; i++) {
      const resource = await prisma.resourceInfo.create({
        data: {
          ManagedBy: marker.groupKeys[c.dept],
          BorrowRule: await ruleKey(c.tier),
          ResourceStatus: 'InStorage',
          ResourceType: 'Item',
          BufferTime: 0,
          AllowBorrow: true,
          Item: {
            create: {
              ItemKey: item.ItemKey,
              ItemID: `${c.prefix}-${String(i).padStart(3, '0')}`,
            },
          },
          Eligibilities: {
            create: [studentRole, staffRole].map((r) => ({
              GroupKey: marker.groupKeys[c.dept],
              RoleKey: r.AuthorityRoleKey,
            })),
          },
        },
      });
      units[c.key].push(resource.ResourceKey);
      marker.resourceKeys.push(resource.ResourceKey);
    }
  }
  await saveMarker(prisma, marker);
  log(
    `  ${ACCOUNTS.length} accounts, ${DEPARTMENTS.length} departments, ${marker.resourceKeys.length} units`,
  );

  if (options.openDay) {
    const days = extraOpenDays;
    days.set(options.openDay, [...marker.groupKeys]);
    const value = {
      days: [...days].map(([date, groupKeys]) => ({ date, groupKeys })),
    };
    await prisma.systemSetting.upsert({
      where: { Key: 'openDays' },
      create: { Key: 'openDays', Value: value },
      update: { Value: value },
    });
    marker.openDay = options.openDay;
    await saveMarker(prisma, marker);
    log(`  ${options.openDay} opened for the demo departments`);
  }

  installClock();
  try {
    await runScenarios(prisma, keys, units, marker, log);
  } finally {
    restoreClock();
    await saveMarker(prisma, marker);
  }
}

/**
 * The stories the screens will tell. Each is independent: one that the rules
 * refuse is reported and skipped, so the rest still lands.
 */
async function runScenarios(
  prisma: PrismaService,
  keys: Record<DemoUser, number>,
  units: Record<string, number[]>,
  marker: Marker,
  log: (line: string) => void,
) {
  const s = services(prisma);
  const user = async (id: DemoUser): Promise<TrpcUser> => {
    const row = await prisma.accountInfo.findUniqueOrThrow({
      where: { AccountKey: keys[id] },
      select: { UserCredit: true, Role: { select: { RoleName: true } } },
    });
    return {
      accountKey: keys[id],
      role: mapUserRole(row.Role.RoleName),
      facultyKey: null,
      creditScore: row.UserCredit,
    };
  };
  const dept0 = marker.groupKeys[0];
  const day = (offset: number) => openDay(offset, dept0);
  const at = (dayKey: string, hour: number, minute = 0) =>
    localTimeToUtc(
      dayKey,
      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    );
  const open = workHours.start;
  const close = workHours.end;

  const photo = async (
    usageKey: number,
    resourceKey: number,
    by: number,
    type: 'BeforePicture' | 'AfterPicture',
    when: Date,
  ) => {
    const url = await storePhoto(
      prisma,
      marker,
      type === 'BeforePicture' ? 0 : 1,
    );
    await prisma.images.create({
      data: {
        UsageKey: usageKey,
        ResourceKey: resourceKey,
        SubmittedBy: by,
        SubmissionType: type,
        ImageURL: url,
        ActionTime: when,
      },
    });
  };

  /** Request one unit, created at `createdAt`; returns the reservation. */
  const request = async (
    who: DemoUser,
    resourceKey: number,
    start: Date,
    end: Date,
    createdAt: Date,
    reason: string,
  ) => {
    setNow(createdAt);
    const result = await s.requests.create(await user(who), {
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      lines: [{ resourceKey, reason }],
    });
    if (result.created.length === 0) {
      throw new Error(`request refused: ${JSON.stringify(result.rejected)}`);
    }
    return result.created[0];
  };
  const prepare = async (reservationKey: number, when: Date) => {
    setNow(when);
    return s.loan.allocate(await user('demo.staff'), {
      reservationKey,
      condition: 'Normal',
    });
  };
  const handOver = async (
    who: DemoUser,
    usageKey: number,
    resourceKey: number,
    when: Date,
  ) => {
    setNow(when);
    await photo(usageKey, resourceKey, keys[who], 'BeforePicture', when);
    await s.loan.confirmPickup(await user('demo.staff'), { usageKey });
  };
  const takeBack = async (
    usageKey: number,
    resourceKey: number,
    when: Date,
  ) => {
    setNow(when);
    await photo(
      usageKey,
      resourceKey,
      keys['demo.staff'],
      'AfterPicture',
      when,
    );
    return s.loan.recordReturn(await user('demo.staff'), { usageKey });
  };
  const grade = async (
    usageKey: number,
    level: 'B0' | 'B1' | 'B2',
    when: Date,
    note: string,
  ) => {
    setNow(when);
    const imageUrls =
      level === 'B0' ? [] : [await storePhoto(prisma, marker, 2)];
    return s.inspections.createInspection(await user('demo.staff'), {
      usageKey,
      level,
      note,
      imageUrls,
    });
  };

  const scenarios: [string, () => Promise<void>][] = [
    [
      'returned on time and inspected (history)',
      async () => {
        const d1 = day(-12);
        const d2 = day(-9);
        const unit = units.arduino[0];
        const r = await request(
          'demo.student1',
          unit,
          at(d1, open + 1),
          at(d2, close),
          at(d1, open),
          'โปรเจกต์วิชา IoT',
        );
        const loan = await prepare(r.reservationKey, at(d1, open, 30));
        await handOver(
          'demo.student1',
          loan.usageKey,
          loan.resourceKey,
          at(d1, open + 1),
        );
        await takeBack(loan.usageKey, loan.resourceKey, at(d2, 14));
        await grade(loan.usageKey, 'B0', at(d2, 15), 'สภาพปกติ ครบชุด');
      },
    ],
    [
      'on loan, due tomorrow',
      async () => {
        const d1 = day(-2);
        const d2 = day(1);
        const unit = units.arduino[1];
        const r = await request(
          'demo.student1',
          unit,
          at(d1, open + 1),
          at(d2, close),
          at(d1, open),
          'ทดลองเซ็นเซอร์อุณหภูมิ',
        );
        const loan = await prepare(r.reservationKey, at(d1, open, 30));
        await handOver(
          'demo.student1',
          loan.usageKey,
          loan.resourceKey,
          at(d1, open + 1),
        );
      },
    ],
    [
      'overdue for 3 days',
      async () => {
        const d1 = day(-6);
        const d2 = day(-3);
        const unit = units.meter[0];
        const r = await request(
          'demo.student2',
          unit,
          at(d1, open + 1),
          at(d2, close),
          at(d1, open),
          'วัดวงจรแหล่งจ่ายไฟ',
        );
        const loan = await prepare(r.reservationKey, at(d1, open, 30));
        await handOver(
          'demo.student2',
          loan.usageKey,
          loan.resourceKey,
          at(d1, open + 1),
        );
      },
    ],
    [
      'returned late and damaged, appeal waiting',
      async () => {
        const d1 = day(-10);
        const d2 = day(-7);
        const back = day(-5);
        const unit = units.meter[1];
        const r = await request(
          'demo.student3',
          unit,
          at(d1, open + 1),
          at(d2, close),
          at(d1, open),
          'แล็บวงจรไฟฟ้า',
        );
        const loan = await prepare(r.reservationKey, at(d1, open, 30));
        await handOver(
          'demo.student3',
          loan.usageKey,
          loan.resourceKey,
          at(d1, open + 1),
        );
        await takeBack(loan.usageKey, loan.resourceKey, at(back, 11));
        const graded = await grade(
          loan.usageKey,
          'B2',
          at(back, 14),
          'หน้าจอแตก สายวัดขาดหนึ่งเส้น',
        );
        if (graded.penalty) {
          setNow(at(day(-4), 10));
          await s.appeals.create(await user('demo.student3'), {
            penaltyKey: graded.penalty.penaltyKey,
            appealReason:
              'หน้าจอมีรอยร้าวตั้งแต่ตอนรับ ดูได้จากรูปตอนรับของ ขอให้พิจารณาใหม่',
          });
        }
      },
    ],
    [
      'returned today, waiting for inspection',
      async () => {
        const d1 = day(-3);
        const d2 = day(2);
        const backDay = day(0);
        const unit = units.tripod[0];
        const r = await request(
          'demo.student4',
          unit,
          at(d1, open + 1),
          at(d2, close),
          at(d1, open),
          'ถ่ายวิดีโอนำเสนองาน',
        );
        const loan = await prepare(r.reservationKey, at(d1, open, 30));
        await handOver(
          'demo.student4',
          loan.usageKey,
          loan.resourceKey,
          at(d1, open + 1),
        );
        const wanted = at(backDay, 11);
        const now = realNow();
        // Never in the future: before 11:00 it is an hour ago instead.
        const back =
          wanted < now ? wanted : new Date(now.getTime() - 3_600_000);
        await takeBack(loan.usageKey, loan.resourceKey, back);
      },
    ],
    [
      'camera approved by the supervisor, on loan, extension waiting',
      async () => {
        const asked = day(-6);
        const d1 = day(-4);
        const d2 = day(1);
        const unit = units.camera[0];
        const r = await request(
          'demo.student2',
          unit,
          at(d1, open + 1),
          at(d2, close),
          at(asked, open),
          'ถ่ายภาพประกอบรายงาน',
        );
        setNow(at(asked, 13));
        await s.approvals.decide(await user('demo.supervisor'), {
          reservationKey: r.reservationKey,
          decision: 'approve',
        });
        const loan = await prepare(r.reservationKey, at(d1, open, 30));
        await handOver(
          'demo.student2',
          loan.usageKey,
          loan.resourceKey,
          at(d1, open + 1),
        );
        setNow(at(day(-1), 10));
        await s.extensions.request(await user('demo.student2'), {
          usageKey: loan.usageKey,
          requestedDueAt: at(day(3), close).toISOString(),
          reason: 'งานถ่ายทำยังไม่เสร็จ ขอเพิ่มอีก 2 วัน',
        });
      },
    ],
    [
      'prepared, ready to pick up',
      async () => {
        const d1 = day(1);
        const d2 = day(3);
        const unit = units.arduino[2];
        const r = await request(
          'demo.student2',
          unit,
          at(d1, open + 1),
          at(d2, close),
          at(day(0), open),
          'สอบปฏิบัติไมโครคอนโทรลเลอร์',
        );
        await prepare(r.reservationKey, at(day(0), open, 30));
      },
    ],
    [
      'approved, waiting to be prepared',
      async () => {
        const d1 = day(1);
        const d2 = day(2);
        const unit = units.meter[2];
        await request(
          'demo.student4',
          unit,
          at(d1, open + 4),
          at(d2, close),
          at(day(0), open),
          'ทดสอบบอร์ดวงจรพิมพ์',
        );
      },
    ],
    [
      'oscilloscope waiting for the supervisor',
      async () => {
        const d1 = day(2);
        const d2 = day(4);
        const unit = units.scope[0];
        await request(
          'demo.student3',
          unit,
          at(d1, open + 1),
          at(d2, close),
          at(day(0), open),
          'วิเคราะห์สัญญาณ PWM สำหรับโปรเจกต์จบ',
        );
      },
    ],
  ];

  for (const [name, run] of scenarios) {
    try {
      await run();
      log(`  ok   ${name}`);
    } catch (error) {
      log(
        `  skip ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // The overnight job charges the overdue loan its first late day.
  setNow(realNow());
  await s.cron.run('markOverdue');
}

/** The services, built the way the tests build them; no email is sent. */
function services(prisma: PrismaService) {
  const audit = new AuditService(prisma);
  const scope = new StaffScopeService(prisma);
  const penalties = new PenaltyService(prisma);
  const notifications = new NotificationService(prisma);
  const creditTiers = new CreditTierService(prisma);
  const eligibility = new EligibilityService(prisma);
  // Demo photos are stored under /media/inspection already.
  const images = {
    toStoredUrl: (url: string) => url,
    toStoredEvidenceUrl: (url: string) => url,
    toPublicUrl: (url: string | null) => url,
  } as never;
  const requests = new LoanRequestService(
    prisma,
    creditTiers,
    eligibility,
    notifications,
    audit,
  );
  return {
    requests,
    loan: new LoanService(
      prisma,
      scope,
      penalties,
      notifications,
      audit,
      creditTiers,
    ),
    extensions: new LoanExtensionService(
      prisma,
      scope,
      creditTiers,
      eligibility,
      notifications,
      audit,
      penalties,
      images,
    ),
    approvals: new ApprovalService(
      prisma,
      scope,
      creditTiers,
      requests,
      notifications,
      audit,
      {} as never,
    ),
    inspections: new InspectionService(
      prisma,
      scope,
      penalties,
      images,
      audit,
      notifications,
    ),
    appeals: new AppealService(prisma, scope, notifications, audit, penalties),
    cron: new CronService(prisma, penalties, notifications),
  };
}

/**
 * The open day `offset` days from today (negative is the past), skipping days
 * the counter is shut for department `groupKey`. Offset 0 is today, or the
 * last open day before it.
 */
function openDay(offset: number, groupKey: number): string {
  const step = offset > 0 ? 1 : -1;
  let at = realNow();
  const isOpen = (d: Date) =>
    !isClosedDay(localTimeToUtc(toLocalDayKey(d), '12:00'), groupKey);
  if (offset === 0) {
    while (!isOpen(at)) at = new Date(at.getTime() - 86_400_000);
    return toLocalDayKey(at);
  }
  let left = Math.abs(offset);
  while (left > 0) {
    at = new Date(at.getTime() + step * 86_400_000);
    if (isOpen(at)) left--;
  }
  return toLocalDayKey(at);
}

/** Puts the saved counter hours, holidays and open days in force, as boot does. */
async function loadCounterSettings(prisma: PrismaService) {
  const read = async (key: string) =>
    (await prisma.systemSetting.findUnique({ where: { Key: key } }))?.Value as
      Record<string, unknown> | undefined;
  const hours = await read('workHours');
  if (typeof hours?.start === 'number' && typeof hours?.end === 'number') {
    Object.assign(workHours, { start: hours.start, end: hours.end });
  }
  const holidays = await read('holidays');
  if (Array.isArray(holidays?.dates)) setHolidays(holidays.dates as string[]);
  const days = await read('openDays');
  extraOpenDays.clear();
  if (Array.isArray(days?.days)) {
    for (const d of days.days as { date: string; groupKeys: number[] }[]) {
      extraOpenDays.set(d.date, d.groupKeys);
    }
  }
}

async function authorityRole(
  prisma: PrismaService,
  marker: Marker,
  name: string,
  level: number,
) {
  const existing = await prisma.authorityRole.findFirst({
    where: { AuthorityName: name },
  });
  if (existing) return existing;
  const created = await prisma.authorityRole.create({
    data: { AuthorityName: name, AuthorityLevel: level },
  });
  marker.authorityRoleKeys.push(created.AuthorityRoleKey);
  return created;
}

async function saveMarker(prisma: PrismaService, marker: Marker) {
  const value = JSON.parse(JSON.stringify(marker)) as object;
  await prisma.systemSetting.upsert({
    where: { Key: MARKER },
    create: { Key: MARKER, Value: value },
    update: { Value: value },
  });
}

/** A small picture for a demo photo, stored like an upload; returns its URL. */
async function storePhoto(
  prisma: PrismaService,
  marker: Marker,
  variant: number,
): Promise<string> {
  const key = `inspection/demo/${randomUUID()}.png`;
  await prisma.mediaFile.create({
    data: {
      Key: key,
      ContentType: 'image/png',
      Bytes: new Uint8Array(placeholderPng(variant)),
    },
  });
  marker.mediaKeys.push(key);
  return `/media/${key}`;
}

/** A plain 320x240 PNG: a soft gradient, green for pickup, blue for return, amber for damage. */
function placeholderPng(variant: number): Buffer {
  const [r, g, b] = [
    [46, 125, 80],
    [52, 101, 164],
    [196, 125, 30],
  ][variant % 3];
  const width = 320;
  const height = 240;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const shade = 0.55 + 0.45 * ((x + y) / (width + height));
      const i = row + 1 + x * 3;
      raw[i] = Math.round(r * shade + 255 * (1 - shade) * 0.6);
      raw[i + 1] = Math.round(g * shade + 255 * (1 - shade) * 0.6);
      raw[i + 2] = Math.round(b * shade + 255 * (1 - shade) * 0.6);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function crc32(data: Buffer): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

// ---------------------------------------------------------------------------
// Removal
// ---------------------------------------------------------------------------

/** Takes out everything `seedDemo` made, in one transaction. */
export async function removeDemo(prisma: PrismaService, log = console.log) {
  const row = await prisma.systemSetting.findUnique({ where: { Key: MARKER } });
  if (!row) {
    log('  no demo data found');
    return;
  }
  const m = row.Value as unknown as Marker;
  const A = m.accountKeys;
  const R = m.resourceKeys;
  const G = m.groupKeys;

  await prisma.$transaction(
    async (tx) => {
      await purge(tx, {
        accountKeys: A,
        resourceKeys: R,
        itemKeys: m.itemKeys,
        groupKeys: G,
        mediaKeys: m.mediaKeys,
      });
      await tx.authorityRole.deleteMany({
        where: {
          AuthorityRoleKey: { in: m.authorityRoleKeys ?? [] },
          Authorities: { none: {} },
          Eligibilities: { none: {} },
        },
      });
      if (m.facultyKey !== null) {
        await tx.facultyInfo.deleteMany({
          where: {
            FacultyKey: m.facultyKey,
            Accounts: { none: {} },
            Branches: { none: {} },
          },
        });
      }
      if (m.openDay) {
        const open = await tx.systemSetting.findUnique({
          where: { Key: 'openDays' },
        });
        const days = (
          (open?.Value as { days?: { date: string }[] } | null)?.days ?? []
        ).filter((d) => d.date !== m.openDay);
        if (open && days.length === 0) {
          await tx.systemSetting.delete({ where: { Key: 'openDays' } });
        } else if (open) {
          await tx.systemSetting.update({
            where: { Key: 'openDays' },
            data: { Value: { days } },
          });
        }
      }
      await tx.systemSetting.delete({ where: { Key: MARKER } });
    },
    { timeout: 60_000 },
  );
  log(
    `  removed ${A.length} accounts, ${R.length} units, ${G.length} departments and everything made with them`,
  );
}
