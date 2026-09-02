import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Cookies, CORS and the /media mount — shared with the smoke test so both
  // exercise the same server. See bootstrap.ts.
  configureApp(app);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();