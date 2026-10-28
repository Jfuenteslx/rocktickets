import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { organizer, user } from '../db/index.js';
import type { AuthUser } from './access.js';
import { getPermissionsForRole } from './permissions.js';

// Lo que va firmado en el token. req.user, en cambio, es un AuthUser leído de la base.
export type JwtPayload = AuthUser;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const [found] = await this.db
      .select({ u: user, organizerActive: organizer.isActive })
      .from(user)
      .leftJoin(organizer, eq(organizer.id, user.organizerId))
      .where(eq(user.email, email))
      .limit(1);
    const foundUser = found?.u;

    // Mismo mensaje genérico tanto si el email no existe como si la
    // contraseña es incorrecta — no le damos a un atacante pistas de
    // cuáles emails existen en el sistema.
    if (!foundUser) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!foundUser.isActive) {
      throw new UnauthorizedException('Cuenta desactivada');
    }

    const passwordMatches = await bcrypt.compare(password, foundUser.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Solo se avisa del motivo DESPUÉS de verificar la contraseña: no regalamos
    // información sobre cuentas a quien no la conoce.
    if (foundUser.approvalStatus === 'PENDIENTE') {
      throw new UnauthorizedException('Tu cuenta está pendiente de aprobación');
    }
    if (foundUser.approvalStatus === 'RECHAZADO') {
      throw new UnauthorizedException('Tu cuenta no fue aprobada');
    }
    if (foundUser.organizerId && found.organizerActive === false) {
      throw new UnauthorizedException('La organización está desactivada');
    }

    const payload: JwtPayload = {
      sub: foundUser.id,
      role: foundUser.role,
      organizerId: foundUser.organizerId,
    };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: foundUser.id,
        name: foundUser.name,
        email: foundUser.email,
        role: foundUser.role,
        organizerId: foundUser.organizerId,
      },
    };
  }

  // Quién soy, tal como está ahora en la base (el panel lo usa al abrir para validar la sesión)
  async me(actor: AuthUser) {
    const [row] = await this.db
      .select({ u: user, organizerName: organizer.name })
      .from(user)
      .leftJoin(organizer, eq(organizer.id, user.organizerId))
      .where(eq(user.id, actor.sub))
      .limit(1);
    return {
      id: row.u.id,
      name: row.u.name,
      email: row.u.email,
      role: row.u.role,
      organizerId: row.u.organizerId,
      organizerName: row.organizerName,
      permissions: getPermissionsForRole(row.u.role),
    };
  }
}
