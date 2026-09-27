import { adminUserSummary } from "../../../backend/src/admin/admin.schema";
import { toAdminUser } from "../../src/features/admin/users/admin-user.adapter";

// Synthetic API records, checked against the backend contract before adaptation.
// AccountInfo has no creation or activity timestamps; the adapter leaves them blank.
export const ADMIN_USER_RESPONSES = [
  adminUserSummary
    .strict()
    .parse({
      id: 1001,
      studentId: "6410501234",
      firstName: "ณัฐวุฒิ",
      lastName: "ศรีสุวรรณ",
      email: "natthawut.s@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1002,
      studentId: "6410502211",
      firstName: "ปิยะดา",
      lastName: "วัฒนกุล",
      email: "piyada.w@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1003,
      studentId: "EMP20481",
      firstName: "สมชาย",
      lastName: "พร้อมเจริญ",
      email: "somchai.p@ku.th",
      role: "staff",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 3, name: "วิศวกรรมคอมพิวเตอร์", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1004,
      studentId: "EMP10233",
      firstName: "ผศ.ดร.",
      lastName: "อรวรรณ ภักดี",
      email: "orawan.p@ku.th",
      role: "supervisor",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 3, name: "วิศวกรรมคอมพิวเตอร์", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1005,
      studentId: "EMP00012",
      firstName: "ธนพล",
      lastName: "เจ้าหน้าที่ IT",
      email: "thanapon.it@ku.th",
      role: "admin",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 7, name: "สำนักงาน IT / สารสนเทศ", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1006,
      studentId: "6410503980",
      firstName: "กิตติพงษ์",
      lastName: "แซ่ลิ้ม",
      email: "kittipong.s@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1007,
      studentId: "CLUB0031",
      firstName: "ชมรมหุ่นยนต์",
      lastName: "วิศวฯ",
      email: "robotics.club@ku.th",
      role: "staff",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 1007, name: "ชมรมหุ่นยนต์ วิศวฯ", type: "Club" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1008,
      studentId: "EMP10871",
      firstName: "รศ.ดร.",
      lastName: "วิชัย ตั้งมั่น",
      email: "wichai.t@ku.th",
      role: "supervisor",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 1, name: "วิศวกรรมไฟฟ้า", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1009,
      studentId: "EMP20997",
      firstName: "สุนิสา",
      lastName: "แก้วประเสริฐ",
      email: "sunisa.k@ku.th",
      role: "staff",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 2, name: "วิศวกรรมเครื่องกล", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1010,
      studentId: "6410504455",
      firstName: "อนุชา",
      lastName: "ไกรทอง",
      email: "anucha.k@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1011,
      studentId: "6410505566",
      firstName: "พรทิพย์",
      lastName: "ชัยมงคล",
      email: "pornthip.c@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1012,
      studentId: "EMP21044",
      firstName: "เจษฎา",
      lastName: "รุ่งเรือง",
      email: "jessada.r@ku.th",
      role: "staff",
      status: "disabled",
      creditScore: 100,
      managementGroup: { id: 4, name: "วิศวกรรมโยธา", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1013,
      studentId: "6410506677",
      firstName: "มานพ",
      lastName: "สุขสวัสดิ์",
      email: "manop.s@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1014,
      studentId: "EMP10555",
      firstName: "ผศ.",
      lastName: "ดารณี พงษ์ไพบูลย์",
      email: "daranee.p@ku.th",
      role: "supervisor",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 2, name: "วิศวกรรมเครื่องกล", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1015,
      studentId: "CLUB0042",
      firstName: "ชมรมอิเล็กทรอนิกส์",
      lastName: "",
      email: "electron.club@ku.th",
      role: "staff",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 1015, name: "ชมรมอิเล็กทรอนิกส์", type: "Club" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1016,
      studentId: "6410507788",
      firstName: "วรรณพร",
      lastName: "ทองดี",
      email: "wannaporn.t@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1017,
      studentId: "6410508899",
      firstName: "ภาคภูมิ",
      lastName: "เลิศวิไล",
      email: "pakpoom.l@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1018,
      studentId: "EMP21188",
      firstName: "สิริพร",
      lastName: "ศรีมงคล",
      email: "siriporn.s@ku.th",
      role: "staff",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 5, name: "วิศวกรรมเคมี", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1019,
      studentId: "6410509900",
      firstName: "ธีรภัทร",
      lastName: "คงทน",
      email: "teerapat.k@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1020,
      studentId: "EMP10099",
      firstName: "ศ.ดร.",
      lastName: "ประสิทธิ์ วงศ์ใหญ่",
      email: "prasit.w@ku.th",
      role: "supervisor",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 4, name: "วิศวกรรมโยธา", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1021,
      studentId: "6410510011",
      firstName: "จิราภา",
      lastName: "แสนสุข",
      email: "jirapa.s@ku.th",
      role: "borrower",
      status: "disabled",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1022,
      studentId: "EMP21290",
      firstName: "นพดล",
      lastName: "ยิ่งยง",
      email: "noppadol.y@ku.th",
      role: "staff",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 6, name: "อุตสาหการ", type: "Faculty" },
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1023,
      studentId: "6410511122",
      firstName: "อารยา",
      lastName: "สถิตย์",
      email: "araya.s@ku.th",
      role: "borrower",
      status: "active",
      creditScore: 100,
      managementGroup: null,
    }),
  adminUserSummary
    .strict()
    .parse({
      id: 1024,
      studentId: "EMP00027",
      firstName: "เอกชัย",
      lastName: "ประเสริฐศรี",
      email: "ekachai.p@ku.th",
      role: "admin",
      status: "active",
      creditScore: 100,
      managementGroup: { id: 7, name: "สำนักงาน IT / สารสนเทศ", type: "Faculty" },
    }),
];

export const ADMIN_USERS = ADMIN_USER_RESPONSES.map(toAdminUser);
