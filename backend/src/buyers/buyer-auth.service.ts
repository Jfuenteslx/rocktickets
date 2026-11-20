import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { buyerAccount } from '../db/index.js';

export const BUYER_TOKEN_DAYS = 30;
export interface BuyerPayload {
  sub: string; // buyer_account.id
  typ: 'buyer';
}

// Los tokens de comprador se firman con OTRO secreto que los del panel de administración:
// un token de comprador no sirve nunca como sesión de panel, ni al revés.
const buyerSecret = () => process.env.BUYER_JWT_SECRET ?? `${process.env.JWT_SECRET}:buyer`;

@Injectable()
export class BuyerAuthService {
  private google?: OAuth2Client;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  private clientId() {
    const id = process.env.GOOGLE_CLIENT_ID;
    if (!id) throw new ServiceUnavailableException('El inicio de sesión con Google no está configurado');
    return id;
  }

  // Valida el token que entrega Google al navegador (firma, vigencia y que sea para NUESTRA app)
  // y crea o actualiza la cuenta del comprador.
  async loginWithGoogle(idToken: string) {
    const clientId = this.clientId();
    this.google ??= new OAuth2Client(clientId);

    let claims;
    try {
      const ticket = await this.google.verifyIdToken({ idToken, audience: clientId });
      claims = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('No pudimos verificar tu cuenta de Google');
    }
    if (!claims?.sub || !claims.email || claims.email_verified !== true) {
      throw new UnauthorizedException('Tu cuenta de Google debe tener el correo verificado');
    }

    const values = {
      googleSub: claims.sub,
      email: claims.email.toLowerCase(),
      name: claims.name?.trim() || claims.email,
      pictureUrl: claims.picture ?? null,
      lastLoginAt: new Date(),
    };
    const [account] = await this.db
      .insert(buyerAccount)
      .values(values)
      .onConflictDoUpdate({
        target: buyerAccount.googleSub,
        set: { email: values.email, name: values.name, pictureUrl: values.pictureUrl, lastLoginAt: values.lastLoginAt },
      })
      .returning();

    const payload: BuyerPayload = { sub: account.id, typ: 'buyer' };
    const token = this.jwt.sign(payload, { secret: buyerSecret(), expiresIn: `${BUYER_TOKEN_DAYS}d` });
    return { token, buyer: this.publicBuyer(account) };
  }

  publicBuyer(a: typeof buyerAccount.$inferSelect) {
    return { id: a.id, name: a.name, email: a.email, pictureUrl: a.pictureUrl };
  }

  // Cuenta a partir de un "Authorization: Bearer …"; null si no hay token o no es válido
  async fromAuthHeader(header: string | undefined) {
    if (!header?.startsWith('Bearer ')) return null;
    let payload: BuyerPayload;
    try {
      payload = this.jwt.verify<BuyerPayload>(header.slice('Bearer '.length), { secret: buyerSecret() });
    } catch {
      return null;
    }
    if (payload.typ !== 'buyer') return null;
    const [account] = await this.db.select().from(buyerAccount).where(eq(buyerAccount.id, payload.sub)).limit(1);
    return account ?? null;
  }
}
