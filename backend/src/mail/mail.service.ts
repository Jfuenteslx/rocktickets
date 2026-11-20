import { Injectable, Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}

// Envío de correo. Con RESEND_API_KEY usa Resend (API HTTP, sin dependencias extra);
// sin clave, IMPRIME el correo en la consola del backend (útil en desarrollo).
// Nunca lanza: un correo que falla no debe romper una compra ni una confirmación de pago.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async send(message: MailMessage): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.log(`📧 [sin RESEND_API_KEY: correo solo en consola]\nPara: ${message.to}\nAsunto: ${message.subject}\nAdjuntos: ${message.attachments?.map((a) => `${a.filename} (${a.content.length} bytes)`).join(', ') || 'ninguno'}\n${message.text}`);
      return true;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: process.env.MAIL_FROM ?? 'Rocktickets <onboarding@resend.dev>',
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          attachments: message.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })),
        }),
      });
      if (!res.ok) {
        this.logger.error(`Resend rechazó el correo a ${message.to}: ${res.status} ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`No se pudo enviar el correo a ${message.to}: ${err}`);
      return false;
    }
  }
}
