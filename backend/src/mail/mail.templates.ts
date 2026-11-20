import type { MailMessage } from './mail.service.js';

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface MailOrder {
  link: string; // enlace a la orden (contiene el token)
  eventName: string;
  startsAt: Date;
  tickets: number;
  total: string;
}

const when = (d: Date) =>
  new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/La_Paz' }).format(d);

function layout(title: string, intro: string, orders: MailOrder[]): { html: string; text: string } {
  const rows = orders
    .map(
      (o) => `
      <tr><td style="padding:14px 0;border-top:1px solid #27272a">
        <div style="font-weight:700;color:#fff">${esc(o.eventName)}</div>
        <div style="color:#a1a1aa;font-size:14px">${esc(when(o.startsAt))} · ${o.tickets} entrada(s) · Bs ${esc(o.total)}</div>
        <a href="${esc(o.link)}" style="display:inline-block;margin-top:8px;background:#e11d2e;color:#fff;text-decoration:none;padding:8px 14px;border-radius:6px;font-weight:600">Ver mis entradas</a>
      </td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html><body style="margin:0;background:#000;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#09090b;border:1px solid #27272a;border-radius:10px;padding:24px">
      <tr><td><div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:1px">ROCK<span style="color:#e11d2e">TICKETS</span></div>
        <h1 style="color:#fff;font-size:20px;margin:18px 0 6px">${esc(title)}</h1>
        <p style="color:#d4d4d8;font-size:14px;margin:0 0 8px">${esc(intro)}</p></td></tr>
      ${rows}
      <tr><td style="padding-top:16px;color:#71717a;font-size:12px">Guarda este correo: el botón es tu acceso a las entradas. No lo compartas con nadie.</td></tr>
    </table></td></tr></table></body></html>`;
  const text = [title, '', intro, '', ...orders.map((o) => `${o.eventName} — ${when(o.startsAt)} — ${o.tickets} entrada(s) — Bs ${o.total}\n${o.link}\n`)].join('\n');
  return { html, text };
}

export function paymentConfirmedMail(to: string, buyerName: string, order: MailOrder, hasPdf: boolean): MailMessage {
  const { html, text } = layout(
    '¡Pago confirmado!',
    `Hola ${buyerName}, tu pago fue confirmado. ${hasPdf ? 'Adjuntamos tus entradas en PDF y aquí tienes el acceso en línea:' : 'Aquí está el acceso a tus entradas:'}`,
    [order],
  );
  return { to, subject: `Tus entradas para ${order.eventName}`, html, text };
}

export function recoverMail(to: string, orders: MailOrder[], hasPdf: boolean): MailMessage {
  const { html, text } = layout(
    'Tus compras en Rocktickets',
    `Pediste recuperar tus entradas. Estas son las compras pagadas con este correo${hasPdf ? ' (adjuntamos el PDF de las más recientes)' : ''}:`,
    orders,
  );
  return { to, subject: 'Recupera tus entradas de Rocktickets', html, text };
}
