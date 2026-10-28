import { Global, Module } from '@nestjs/common';
import { db } from './client.js';

export const DRIZZLE = Symbol('DRIZZLE_CONNECTION');

// @Global(): cualquier módulo de la app puede inyectar DRIZZLE sin tener que
// importar explícitamente DatabaseModule en cada uno — la conexión a Postgres
// es infraestructura transversal, no un dominio de negocio propio.
@Global()
@Module({
  providers: [{ provide: DRIZZLE, useValue: db }],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
