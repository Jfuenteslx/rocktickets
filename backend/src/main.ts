import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import express from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module.js';
import { assertProductionEnv, corsOrigins, isProduction } from './common/env.js';

async function bootstrap() {
  // En producción, no arranca con una configuración incompleta o insegura
  assertProductionEnv();

  // rawBody: el webhook de pagos se firma sobre el cuerpo EXACTO recibido
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Detrás de un proxy (nginx, Caddy) hay que confiar en él para ver la IP real del visitante
  // (límite de peticiones) y saber si la conexión original era https.
  if (process.env.TRUST_PROXY) {
    app.getHttpAdapter().getInstance().set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  }

  // Solo los dominios de CORS_ORIGINS pueden llamar a la API desde un navegador.
  // (En desarrollo, sin CORS_ORIGINS, se permite cualquiera.)
  app.enableCors({ origin: corsOrigins() });

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

  // AdminJS (panel viejo) pesa en memoria y corre dentro del mismo proceso que la API:
  // por defecto solo se activa en desarrollo. En producción, ENABLE_ADMINJS=true lo enciende.
  const adminJsOn = process.env.ENABLE_ADMINJS ? process.env.ENABLE_ADMINJS === 'true' : !isProduction();
  if (adminJsOn) {
    const { setupAdmin } = await import('./admin/admin.setup.js');
    await setupAdmin(app);
  }

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
