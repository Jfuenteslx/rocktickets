import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { courtesy, event, order, orderItem, sector, ticket, tier, venue } from '../db/index.js';

// Estados que el comprador puede descargar: un ticket ANULADO no se entrega.
const DELIVERABLE = ['VALIDO', 'UTILIZADO'] as const;

// Entrega del ticket al comprador. La "llave" de acceso es el accessToken de
// la orden (posesión del link = acceso), igual que la pantalla de la orden.
// El contenido del QR es SOLO el UUID del ticket (decisión de diseño: nada
// sensible dentro del QR; el backend es la autoridad que lo valida al escanear).
@Injectable()
export class TicketDeliveryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Tickets entregables de una orden PAGADA, con el contexto para dibujarlos
  private async loadDeliverable(accessToken: string, onlyTicketId?: string) {
    const [foundOrder] = await this.db
      .select()
      .from(order)
      .where(eq(order.accessToken, accessToken))
      .limit(1);
    if (!foundOrder || foundOrder.status !== 'PAGADA') {
      throw new NotFoundException('No hay tickets disponibles para esta orden');
    }

    const items = await this.db.select().from(orderItem).where(eq(orderItem.orderId, foundOrder.id));
    if (items.length === 0) throw new NotFoundException('La orden no tiene tickets');

    const rows = await this.db
      .select({
        id: ticket.id,
        shortCode: ticket.shortCode,
        status: ticket.status,
        tierName: tier.name,
        sectorName: sector.name,
      })
      .from(ticket)
      .innerJoin(tier, eq(ticket.tierId, tier.id))
      .innerJoin(sector, eq(ticket.sectorId, sector.id))
      .where(
        and(
          inArray(ticket.orderItemId, items.map((i) => i.id)),
          inArray(ticket.status, [...DELIVERABLE]),
        ),
      )
      .orderBy(ticket.shortCode);

    const tickets = onlyTicketId ? rows.filter((r) => r.id === onlyTicketId) : rows;
    if (tickets.length === 0) throw new NotFoundException('Ticket no encontrado');

    const [ev] = await this.db.select().from(event).where(eq(event.id, foundOrder.eventId)).limit(1);
    const [ven] = await this.db.select().from(venue).where(eq(venue.id, ev!.venueId)).limit(1);

    return {
      event: ev!,
      venue: ven!,
      tickets,
      holder: foundOrder.buyerName,
      reference: `Orden ${foundOrder.id.slice(0, 8)}`,
    };
  }

  // Entradas de una cortesía (el invitado entra con el accessToken de la cortesía).
  // Misma forma que loadDeliverable para reutilizar QR y PDF.
  private async loadCourtesyDeliverable(accessToken: string, onlyTicketId?: string) {
    const [c] = await this.db.select().from(courtesy).where(eq(courtesy.accessToken, accessToken)).limit(1);
    if (!c) throw new NotFoundException('No hay entradas disponibles para este enlace');

    const rows = await this.db
      .select({
        id: ticket.id,
        shortCode: ticket.shortCode,
        status: ticket.status,
        tierName: tier.name,
        sectorName: sector.name,
      })
      .from(ticket)
      .innerJoin(tier, eq(ticket.tierId, tier.id))
      .innerJoin(sector, eq(ticket.sectorId, sector.id))
      .where(and(eq(ticket.courtesyId, c.id), inArray(ticket.status, [...DELIVERABLE])))
      .orderBy(ticket.shortCode);

    const tickets = onlyTicketId ? rows.filter((r) => r.id === onlyTicketId) : rows;
    if (tickets.length === 0) throw new NotFoundException('Entrada no encontrada');

    const [ev] = await this.db.select().from(event).where(eq(event.id, c.eventId)).limit(1);
    const [ven] = await this.db.select().from(venue).where(eq(venue.id, ev!.venueId)).limit(1);

    return {
      event: ev!,
      venue: ven!,
      tickets,
      holder: c.recipientName,
      reference: `Cortesía ${c.id.slice(0, 8)}`,
    };
  }

  // Lo que ve el invitado en su página (sin datos internos: ni organizador ni comisión)
  async courtesyView(accessToken: string) {
    const d = await this.loadCourtesyDeliverable(accessToken);
    return {
      recipientName: d.holder,
      event: { name: d.event.name, startsAt: d.event.startsAt, endsAt: d.event.endsAt, venueName: d.venue.name },
      tickets: d.tickets,
    };
  }

  async courtesyQrPng(accessToken: string, ticketId: string): Promise<Buffer> {
    const { tickets } = await this.loadCourtesyDeliverable(accessToken, ticketId);
    return this.qrBuffer(tickets[0].id);
  }

  async courtesyPdf(accessToken: string): Promise<Buffer> {
    return this.buildPdf(await this.loadCourtesyDeliverable(accessToken));
  }

  private qrBuffer(content: string): Promise<Buffer> {
    return QRCode.toBuffer(content, {
      type: 'png',
      width: 640,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
  }

  async ticketQrPng(accessToken: string, ticketId: string): Promise<Buffer> {
    const { tickets } = await this.loadDeliverable(accessToken, ticketId);
    return this.qrBuffer(tickets[0].id);
  }

  // Un PDF por orden: una página por ticket, lista para imprimir
  async orderPdf(accessToken: string): Promise<Buffer> {
    return this.buildPdf(await this.loadDeliverable(accessToken));
  }

  private async buildPdf(d: {
    event: typeof event.$inferSelect;
    venue: typeof venue.$inferSelect;
    tickets: { id: string; shortCode: string; tierName: string; sectorName: string }[];
    holder: string;
    reference: string;
  }): Promise<Buffer> {
    const { event: ev, venue: ven, tickets } = d;

    const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Tickets - ${ev.name}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const when = ev.startsAt.toLocaleString('es-BO', {
      timeZone: 'America/La_Paz',
      dateStyle: 'full',
      timeStyle: 'short',
    });

    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      if (i > 0) doc.addPage();

      const width = doc.page.width - 72;
      doc.fillColor('#dc2626').fontSize(10).font('Helvetica-Bold').text('ROCKTICKETS', { characterSpacing: 2 });
      doc.moveDown(0.6).fillColor('#18181b').fontSize(20).font('Helvetica-Bold').text(ev.name, { width });
      doc.moveDown(0.3).fontSize(10).font('Helvetica').fillColor('#52525b').text(when, { width });
      doc.text(ven.name, { width });

      const qr = await this.qrBuffer(t.id);
      const qrSize = 190;
      doc.image(qr, (doc.page.width - qrSize) / 2, doc.y + 18, { width: qrSize });
      doc.y += qrSize + 30;

      doc.fillColor('#18181b').font('Courier-Bold').fontSize(22).text(t.shortCode, { align: 'center' });
      doc.moveDown(0.2).font('Helvetica').fontSize(11).fillColor('#3f3f46')
        .text(`${t.sectorName} · ${t.tierName}`, { align: 'center' });
      doc.moveDown(0.2).fontSize(9).fillColor('#71717a')
        .text(`Ticket ${i + 1} de ${tickets.length} · ${d.reference} · ${d.holder}`, { align: 'center' });

      doc.fontSize(8).fillColor('#a1a1aa').text(
        'Presenta este QR en la puerta. Cada ticket se puede usar una sola vez.',
        36,
        doc.page.height - 56,
        { width, align: 'center' },
      );
    }

    doc.end();
    return done;
  }
}
