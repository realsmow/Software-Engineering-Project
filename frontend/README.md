# ULMs Frontend

ระบบบริหารจัดการการยืม–คืนอุปกรณ์มหาวิทยาลัย (University Lending Management System) - ฝั่ง Frontend

## Test credentials (dev only)

> ⚠️ **DEV ONLY.** บัญชีเหล่านี้ถูก seed ลงฐานข้อมูลจริงโดย `backend/src/seed.ts`
> รหัสผ่านเป็นที่รู้กันทั่วทีม **ห้าม** seed บัญชีชุดนี้ลงฐานข้อมูลที่ใช้งานจริง

ต้องรัน Postgres และ backend ก่อน ไม่อย่างนั้นจะเข้าสู่ระบบไม่ได้เลย
(ดู [backend/README.md](../backend/README.md))

เข้าสู่ระบบได้ 2 ทาง ใช้บัญชีเดียวกันทั้งคู่ server จะจับคู่สิ่งที่กรอกกับ
`AccountInfo.Email` หรือ `AccountInfo.UserID` ให้เอง และเป็นผู้ตัดสินบทบาท (role)

| บทบาท | แท็บ "อีเมล KU" | แท็บ "บัญชีภายในระบบ" | รหัสผ่าน |
|---|---|---|---|
| ผู้ยืม (borrower) | `borrower@ku.th` | `test_borrower` | `borrower1234` |
| เจ้าหน้าที่ (staff) | `staff@ku.th` | `test_staff` | `staff1234` |
| หัวหน้า (supervisor) | `supervisor@ku.th` | `test_supervisor` | `supervisor1234` |
| แอดมิน (admin) | `admin@ku.th` | `test_admin` | `admin1234` |

แท็บ "อีเมล KU" ตรวจรูปแบบอีเมลฝั่ง client และรับเฉพาะ `@ku.th` / `@ku.ac.th`
ถ้ากรอกชื่อผู้ใช้ (เช่น `test_borrower`) ลงไปจะขึ้น "รูปแบบอีเมลไม่ถูกต้อง"
ตั้งแต่ยังไม่ได้ยิง request ให้ใช้แท็บ "บัญชีภายในระบบ" สำหรับชื่อผู้ใช้แทน

หมายเหตุ: อีเมล `@ku.th` ที่นี่เป็นเพียง identifier ของบัญชีในระบบ
ไม่ได้เชื่อมกับ Google Workspace และไม่มี OAuth เกี่ยวข้อง

## Tech Stack

- **Core**: Vite + React 18 + TypeScript + React Router 6
- **UI**: Tailwind CSS + shadcn/ui + lucide-react
- **Data**: TanStack Query 5 + React Hook Form + Zod
- **State**: React Context + Zustand (global auth)
- **Font**: Sarabun (ไทย/อังกฤษ), JetBrains Mono (code)

## เริ่มต้นใช้งาน

```bash
npm install

# copy .env
cp .env.example .env
# แก้ VITE_API_URL ให้ตรงกับ backend

npm run dev
```

## Scripts

```bash
npm run dev         # start dev server (port 5173)
npm run build       # build production
npm run preview     # preview production build
npm run lint        # ESLint
npm run typecheck   # TypeScript check
npm run format      # Prettier format
```

## File Structure

```
ulms-frontend/
├── public/                          # static assets (favicon, images)
├── src/
│   ├── main.tsx                     # entry point
│   │
│   ├── app/                         # app-level setup
│   │   ├── app.tsx                  # root component + providers
│   │   ├── router.tsx               # route definitions + code-splitting
│   │   └── globals.css              # global styles + CSS variables (design tokens)
│   │
│   ├── components/                  # reusable components
│   │   ├── ui/                      # shadcn/ui components (button, card, dialog, ...)
│   │   ├── layout/                  # layout components (navbar, sidebar, page-shell)
│   │   └── shared/                  # shared business components (tier-badge, credit-band-badge)
│   │
│   ├── features/                    
│   │   ├── auth/                   
│   │   │   ├── auth.store.ts        
│   │   │   ├── use-me.ts            
│   │   │   ├── protected-route.tsx  
│   │   │   └── login-page.tsx       
│   │   │
│   │   ├── borrower/                
│   │   │   ├── catalog/            
│   │   │   ├── loans/               
│   │   │   ├── credit/            
│   │   │   └── appeals/            
│   │   │
│   │   ├── staff/                   
│   │   │   ├── dashboard/           
│   │   │   ├── handover/           
│   │   │   ├── inspection/          
│   │   │   └── inventory/          
│   │   │
│   │   ├── supervisor/              
│   │   │   ├── approvals/          
│   │   │   └── appeals/            
│   │   │
│   │   ├── admin/                   
│   │   │   ├── users/               
│   │   │   ├── settings/            
│   │   │   └── reports/             # reort/dashboard
│   │   │
│   │   └── notifications/           
│   │
│   ├── lib/                         # utilities
│   │   ├── utils.ts                 # cn(), formatters
│   │   ├── api-client.ts            # fetch wrapper + error handling
│   │   ├── query-client.ts          # TanStack Query config + query keys
│   │   └── error-messages.ts        # error code → ข้อความไทย
│   │
│   ├── hooks/                       # shared custom hooks
│   ├── schemas/                     # Zod schemas (แชร์กับ backend)
│   ├── types/                       # TypeScript types
│   │   ├── env.d.ts                 # env variable types
│   │   └── domain.ts                # domain types (User, Loan, ...)
│   │
│   ├── constants/                   # ค่าคงที่ (polling intervals, tier config, routes)
│   └── mocks/                       # mock data สำหรับ dev
│
├── .env.example                     # env template
├── index.html
├── package.json
├── tailwind.config.ts               # Tailwind + design tokens
├── tsconfig.json
└── vite.config.ts
```

## การแบ่งงาน (Team of 4)

| คน | Ownership | Focus |
|---|---|---|
| **Head** | `app/`, `components/ui/`, `components/layout/`, `features/auth/` | Foundation, RBAC, shared components |
| **Dev 1** | `features/borrower/**` | ทุกอย่างที่นิสิต/อาจารย์เห็น |
| **Dev 2** | `features/staff/**`, `features/supervisor/**` | Workflow ฝั่งดูแลระบบ |
| **API/Integration** | `lib/`, `schemas/`, `hooks/`, `mocks/`, `features/notifications/` | Contract กลาง, mock data, error handling |

## Design Tokens

color/spacing/typography reference from `src/app/globals.css` (CSS variables)
map Tailwind in `tailwind.config.ts`

- **Primary**: `#0e7a46` (KU green)
- **Font**: Sarabun
- **Radius**: 12-14px (ปุ่ม), 18px (การ์ด), 22px (โลโก้)

## Convention

### Import Alias
always use `@/` replace relative path :
```ts
import { Button } from "@/components/ui/button";
import { useMe } from "@/features/auth/use-me";
```

### Component Structure
```tsx
// 1. imports
// 2. types/interfaces
// 3. main component export
// 4. subcomponents 
// 5. helpers
```

### Naming
- Components: `PascalCase.tsx` (`login-page.tsx` → export `LoginPage`)
- Hooks: `use-*.ts` (`use-me.ts`)
- Stores: `*.store.ts` (`auth.store.ts`)
- Schemas: `*.schema.ts` (`loan-request.schema.ts`)

## Backend API Contract

Backend API base path: `/api`
Auth: httpOnly cookie (`ulms_session`, session-based). ไม่มี OAuth
เข้าสู่ระบบผ่าน `auth.login` โดยตรวจรหัสผ่านกับ `AccountInfo.HashedPassword` (scrypt)

Endpoints use tRPC look `lib/api-client.ts` and `types/domain.ts`

### Error Codes 
- `CONFLICT_UNIT_TAKEN` 
- `INSUFFICIENT_CREDIT` 
- `INVALID_DOMAIN` 

ดู mapping  `src/lib/error-messages.ts`

## Polling Config

| Data | Interval | page used |
|---|---|---|
| Equipment availability | 15s | Catalog detail |
| Facility slots (T3) | 15s | Booking |
| Request status | 30s | Track pending request |
| Notifications | 60s | all page |
| Staff queue | 30s | Staff dashboard |
| Supervisor queue | 60s | Supervisor dashboard |

Config `src/constants/index.ts` → `POLLING`
