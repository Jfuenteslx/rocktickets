import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { auditLog } from '../db/index.js';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Nunca debe hacer fallar la operación que audita — si loguear falla,
  // se registra el error y se sigue. Perder una auditoría es malo; que
  // por eso se caiga la cancelación real de un evento sería peor.
  async log(
    performedBy: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.insert(auditLog).values({ performedBy, action, entityType, entityId, metadata });
    } catch (err) {
      this.logger.error(`No se pudo escribir AuditLog (${action} ${entityType}/${entityId}): ${err}`);
    }
  }
}
