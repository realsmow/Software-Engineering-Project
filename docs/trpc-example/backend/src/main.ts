/**
 * วาระ ว-03 · เปิด CORS พร้อม credentials และอ่าน cookie
 * ปลายทางจริง: backend/src/main.ts (แทนที่ของเดิม)
 *
 * ของเดิมในรีโปมีแค่ NestFactory.create กับ app.listen — ไม่มี enableCors
 * ไม่มีการอ่าน cookie ขณะที่ frontend/src/lib/api-client.ts ตั้ง
 * credentials:"include" ไว้ทุก request ไปแล้ว
 *
 * วันแรกที่เอาสองฝั่งมาต่อกัน อาการที่จะเจอคือเบราว์เซอร์บล็อก request
 * พร้อมข้อความ CORS — และมักถูกแก้แบบผิด ๆ ด้วย origin:'*'
 */

import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/**
 * รายชื่อ origin ที่อนุญาต
 *
 * ห้ามใช้ '*' คู่กับ credentials:true — เบราว์เซอร์ปฏิเสธการส่ง cookie ไปยัง
 * origin แบบ wildcard อยู่แล้ว และถึงบังคับได้ก็ไม่ควรทำ เพราะระบบนี้ใช้ cookie
 * เป็นตัวยืนยันตัวตน การเปิด origin กว้างคือเปิดช่องให้เว็บอื่นยิง request
 * ในนามผู้ใช้ที่ล็อกอินอยู่ (CSRF)
 */
const ALLOWED_ORIGINS = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:4173', // vite preview
  // TODO(ว-03): เติม origin ของ production เมื่อรู้โดเมนจริง
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ต้องมี ไม่งั้น req.cookies เป็น undefined แล้ว context หา session ไม่เจอ
  app.use(cookieParser());

  app.enableCors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
