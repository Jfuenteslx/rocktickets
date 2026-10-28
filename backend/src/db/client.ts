import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './index.js';

// Un solo pool de conexiones para toda la app. postgres-js maneja el pooling
// internamente — no hace falta pgBouncer para el volumen del MVP.
const queryClient = postgres(process.env.DATABASE_URL!);

export const db = drizzle(queryClient, { schema });

// Tipo exportado para poder tipar el token de inyección en NestJS
export type Database = typeof db;
