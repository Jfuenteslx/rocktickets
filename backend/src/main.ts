import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import express from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { setupAdmin } from './admin/admin.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Permite que el frontend (y más adelante las apps móviles) le peguen a la API
  // desde otro origen. En producción esto se restringe a los dominios reales.
  app.enableCors();

  // Valida y sanea automáticamente el body/query de cada request contra los DTOs
  // que vamos a definir por módulo (ver auth/dto, events/dto, etc.). Si falta un
  // campo o viene mal tipado, la request se rechaza antes de llegar al controller.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campos que no están declarados en el DTO
      forbidNonWhitelisted: true, // y rechaza la request si vienen campos extra
      transform: true, // convierte tipos automáticamente (ej: query string -> number)
    }),
  );

  // Imágenes de eventos subidas por el ADMIN (carpeta local del backend)
  app.getHttpAdapter().getInstance().use('/uploads', express.static(join(process.cwd(), 'uploads')));

  await setupAdmin(app);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
