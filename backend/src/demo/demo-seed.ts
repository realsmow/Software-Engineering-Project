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
  const {
    s,
    user,
    day,
    at,
    open,
    close,
    request,
    prepare,
    handOver,
    takeBack,
    grade,
  } = actions(prisma, keys, marker);

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

/**
 * The steps every demo loan is made of, each through the real service with
 * the clock set to when it happened. Staff work is done as demo.staff.
 */
function actions(
  prisma: PrismaService,
  keys: Record<string, number>,
  marker: Marker,
) {
  const s = services(prisma);
  const user = async (id: string): Promise<TrpcUser> => {
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
    who: string,
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
    who: string,
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

  return {
    s,
    user,
    day,
    at,
    open,
    close,
    request,
    prepare,
    handOver,
    takeBack,
    grade,
  };
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
// More data on top of an existing demo
// ---------------------------------------------------------------------------

const FIRST = [
  'อนันต์',
  'กิตติพงษ์',
  'ศิริพร',
  'ภัทรา',
  'วรเมธ',
  'ชนิดา',
  'ธีรวัฒน์',
  'พิมพ์ชนก',
  'ณัฐธิดา',
  'ปกรณ์',
  'สุภาวดี',
  'จิรายุ',
  'ธนวัฒน์',
  'อรอุมา',
  'เกียรติศักดิ์',
  'วริศรา',
  'ศุภกร',
  'ปวีณา',
  'อภิสิทธิ์',
  'กัญญาณัฐ',
];
const LAST = [
  'สุขสวัสดิ์',
  'บุญมา',
  'แสงทอง',
  'จันทร์เพ็ญ',
  'ศรีวงศ์',
  'พรหมมา',
  'ทองคำ',
  'วัฒนากุล',
  'อินทร์แก้ว',
  'ปัญญาดี',
  'เรืองศรี',
  'มณีรัตน์',
  'สมบูรณ์',
  'ชัยมงคล',
  'รักษาวงศ์',
  'นาคประเสริฐ',
  'ใจงาม',
  'พึ่งบุญ',
  'สายสุวรรณ',
  'คงเจริญ',
];

const MORE_CATALOGUE: typeof CATALOGUE = [
  {
    key: 'pi',
    name: 'ชุด Raspberry Pi 4 พร้อมจอสัมผัส',
    desc: 'บอร์ด 4 GB การ์ด 32 GB จอ 7 นิ้ว และพาวเวอร์ซัพพลาย',
    weight: 2,
    tier: 'T1',
    dept: 0,
    prefix: 'MCU-RPI',
    units: 4,
  },
  {
    key: 'logic',
    name: 'ลอจิกแอนะไลเซอร์ 16 ช่อง',
    desc: 'วิเคราะห์สัญญาณดิจิทัล I2C SPI UART',
    weight: 2,
    tier: 'T1',
    dept: 0,
    prefix: 'MCU-LGA',
    units: 3,
  },
  {
    key: 'solder',
    name: 'สถานีบัดกรีควบคุมอุณหภูมิ',
    desc: 'หัวแร้ง ปรับ 200-480 °C พร้อมขาตั้งและฟองน้ำ',
    weight: 1,
    tier: 'T0',
    dept: 0,
    prefix: 'MCU-SLD',
    units: 4,
  },
  {
    key: 'projector',
    name: 'โปรเจกเตอร์พกพา Full HD',
    desc: 'ความสว่าง 3,000 ลูเมน สาย HDMI และรีโมต',
    weight: 3,
    tier: 'T1',
    dept: 1,
    prefix: 'MED-PRJ',
    units: 3,
  },
];

const REASONS = [
  'โปรเจกต์วิชาปฏิบัติการ',
  'ทำการบ้านแล็บ',
  'เตรียมนำเสนองานกลุ่ม',
  'ทดลองต้นแบบโปรเจกต์จบ',
  'ถ่ายทำวิดีโอประกอบรายวิชา',
  'ใช้ในกิจกรรมชมรม',
  'ฝึกใช้งานก่อนสอบปฏิบัติ',
];

export interface MoreOptions {
  password: string;
  students?: number;
  loans?: number;
  log?: (line: string) => void;
}

/**
 * Adds students, equipment, rooms and a month of finished loans to the demo
 * already in the database. Everything goes into the same marker, so
 * `removeDemo` still takes it all out. Safe to run more than once.
 */
export async function addMoreDemo(prisma: PrismaService, options: MoreOptions) {
  const log = options.log ?? console.log;
  const row = await prisma.systemSetting.findUnique({ where: { Key: MARKER } });
  if (!row) throw new Error('No demo data yet. Run seed:demo first.');
  const marker = row.Value as unknown as Marker;
  marker.authorityRoleKeys ??= [];
  await loadCounterSettings(prisma);

  const studentRole = await authorityRole(prisma, marker, 'Student', 0);
  const staffRole = await authorityRole(prisma, marker, 'Lab staff', 2);
  const roleKey = (
    await prisma.roleInfo.findFirstOrThrow({ where: { RoleName: 'Student' } })
  ).RoleKey;
  const facultyKey =
    (await prisma.facultyInfo.findFirst({ where: { FacultyName: FACULTY } }))
      ?.FacultyKey ?? null;
  const hashed = await hashPassword(options.password);

  // Students demo.s01, demo.s02, ... continuing after any already made.
  const existing = await prisma.accountInfo.count({
    where: {
      UserID: { startsWith: 'demo.s' },
      NOT: { UserID: { startsWith: 'demo.student' } },
    },
  });
  const wanted = options.students ?? 20;
  for (let i = 0; i < wanted; i++) {
    const n = existing + i + 1;
    const account = await prisma.accountInfo.create({
      data: {
        UserID: `demo.s${String(n).padStart(2, '0')}`,
        Email: `demo.s${String(n).padStart(2, '0')}@demo.ulms.test`,
        HashedPassword: hashed,
        UserFName: FIRST[(n * 7) % FIRST.length],
        UserLName: LAST[(n * 11) % LAST.length],
        UserCredit: BASE_CREDIT,
        RoleKey: roleKey,
        FacultyKey: facultyKey,
        Authorities: {
          create: marker.groupKeys.map((g) => ({
            ManageGroupKey: g,
            AuthorityRoleKey: studentRole.AuthorityRoleKey,
          })),
        },
      },
    });
    marker.accountKeys.push(account.AccountKey);
  }
  await saveMarker(prisma, marker);

  // Equipment and rooms, once.
  const haveItems = await prisma.itemInfo.findMany({
    where: { ItemKey: { in: marker.itemKeys } },
    select: { ItemName: true },
  });
  for (const c of MORE_CATALOGUE) {
    if (haveItems.some((i) => i.ItemName === c.name)) continue;
    const rule = await prisma.borrowRule.findFirstOrThrow({
      where: { RuleName: c.tier },
    });
    const item = await prisma.itemInfo.create({
      data: { ItemName: c.name, ItemDesc: c.desc, CreditWeight: c.weight },
    });
    marker.itemKeys.push(item.ItemKey);
    for (let i = 1; i <= c.units; i++) {
      const r = await prisma.resourceInfo.create({
        data: {
          ManagedBy: marker.groupKeys[c.dept],
          BorrowRule: rule.BorrowRuleKey,
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
            create: [studentRole, staffRole].map((x) => ({
              GroupKey: marker.groupKeys[c.dept],
              RoleKey: x.AuthorityRoleKey,
            })),
          },
        },
      });
      marker.resourceKeys.push(r.ResourceKey);
    }
  }
  const roomNames = [
    'ห้องประชุมกลุ่มย่อย 301',
    'ห้องปฏิบัติการคอมพิวเตอร์ 402',
  ];
  const rooms: number[] = [];
  const t3 = await prisma.borrowRule.findFirstOrThrow({
    where: { RuleName: 'T3' },
  });
  for (const [i, name] of roomNames.entries()) {
    const found = await prisma.roomInfo.findFirst({
      where: { RoomName: name, ResourceKey: { in: marker.resourceKeys } },
    });
    if (found) {
      rooms.push(found.RoomKey);
      continue;
    }
    const room = await prisma.roomInfo.create({
      data: {
        RoomName: name,
        CreditWeight: 0,
        Capacity: i === 0 ? 8 : 40,
        OpenTime: workHours.start * 60,
        CloseTime: workHours.end * 60,
        BreakStart: 720,
        BreakEnd: 780,
        Resource: {
          create: {
            ManagedBy: marker.groupKeys[i],
            BorrowRule: t3.BorrowRuleKey,
            ResourceType: 'Room',
            ResourceStatus: 'InStorage',
            AllowBorrow: true,
            BufferTime: 0,
            Eligibilities: {
              create: [studentRole, staffRole].map((x) => ({
                GroupKey: marker.groupKeys[i],
                RoleKey: x.AuthorityRoleKey,
              })),
            },
          },
        },
      },
    });
    marker.resourceKeys.push(room.ResourceKey);
    rooms.push(room.RoomKey);
  }
  await saveMarker(prisma, marker);

  const accounts = await prisma.accountInfo.findMany({
    where: { AccountKey: { in: marker.accountKeys } },
    select: { AccountKey: true, UserID: true },
  });
  const keys = Object.fromEntries(
    accounts.map((a) => [a.UserID, a.AccountKey]),
  );
  // The nine stories keep their own students; the history uses the rest.
  const borrowers = accounts
    .map((a) => a.UserID)
    .filter((id) => id.startsWith('demo.s') && !id.startsWith('demo.student'));
  if (borrowers.length === 0) throw new Error('No students for the history.');

  const units = await prisma.itemIndiv.findMany({
    where: { ResourceKey: { in: marker.resourceKeys } },
    select: { ResourceKey: true },
    orderBy: { ResourceKey: 'asc' },
  });
  const busy = new Set(
    (
      await prisma.usageLog.findMany({
        where: {
          ResourceKey: { in: units.map((u) => u.ResourceKey) },
          CurrentStatus: { not: 'Inspected' },
        },
        select: { ResourceKey: true },
      })
    ).map((u) => u.ResourceKey),
  );

  let seed = marker.accountKeys.length * 7919 + marker.mediaKeys.length;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  installClock();
  let ok = 0;
  let skipped = 0;
  try {
    const a = actions(prisma, keys, marker);
    // Each unit gets loans back to back through the last month, ending
    // before the stories begin for units the stories use.
    const cursor = new Map<number, number>();
    const target = options.loans ?? 60;
    for (let i = 0; ok + skipped < target && i < target * 4; i++) {
      const unit = units[i % units.length].ResourceKey;
      const from = cursor.get(unit) ?? -22 + Math.floor(random() * 3);
      const length = 1 + Math.floor(random() * 3);
      const late = random() < 0.12;
      const lastDay = busy.has(unit) ? -13 : -1;
      if (from + length + (late ? 2 : 0) > lastDay) continue;
      cursor.set(
        unit,
        from + length + (late ? 2 : 0) + 1 + Math.floor(random() * 2),
      );

      const who = borrowers[Math.floor(random() * borrowers.length)];
      const d1 = a.day(from);
      const d2 = a.day(from + length);
      const startHour = a.open + 1 + Math.floor(random() * 3);
      try {
        const r = await a.request(
          who,
          unit,
          a.at(d1, startHour),
          a.at(d2, a.close),
          a.at(d1, a.open),
          REASONS[Math.floor(random() * REASONS.length)],
        );
        if (r.status === 'pending') {
          setNow(a.at(d1, a.open, 15));
          await a.s.approvals.decide(await a.user('demo.supervisor'), {
            reservationKey: r.reservationKey,
            decision: 'approve',
          });
        }
        const loan = await a.prepare(r.reservationKey, a.at(d1, a.open, 30));
        await a.handOver(
          who,
          loan.usageKey,
          loan.resourceKey,
          a.at(d1, startHour),
        );
        const backDay = late
          ? a.day(from + length + 1 + Math.floor(random() * 2))
          : d2;
        const backHour = late
          ? a.open + 2
          : a.open + 1 + Math.floor(random() * (a.close - a.open - 2));
        await a.takeBack(
          loan.usageKey,
          loan.resourceKey,
          a.at(backDay, backHour),
        );
        const roll = random();
        const level = roll < 0.85 ? 'B0' : roll < 0.97 ? 'B1' : 'B2';
        await a.grade(
          loan.usageKey,
          level,
          a.at(backDay, backHour + 1),
          level === 'B0'
            ? 'สภาพปกติ'
            : level === 'B1'
              ? 'มีรอยขีดข่วนเล็กน้อย'
              : 'ชิ้นส่วนชำรุด ต้องส่งซ่อม',
        );
        ok++;
      } catch {
        skipped++;
      }
    }

    // A few room bookings in the coming days, so the slot grid shows use.
    for (const [i, roomKey] of rooms.entries()) {
      for (let k = 0; k < 3; k++) {
        try {
          setNow(realNow());
          const who = borrowers[(i * 3 + k) % borrowers.length];
          await a.s.requests.createRoomBooking(await a.user(who), {
            roomKey,
            date: a.day(1 + k),
            slots: [2 + i * 2, 3 + i * 2],
          });
        } catch {
          // A slot already taken by an earlier run is fine.
        }
      }
    }
  } finally {
    restoreClock();
    await saveMarker(prisma, marker);
  }
  log(
    `  added ${wanted} students, ${ok} finished loans${skipped ? ` (${skipped} skipped by the rules)` : ''}, rooms and bookings`,
  );
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
