import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import { fmtBs, fmtDateTime, fmtPct, fmtYmd, plural } from "../lib/format.js";
import Badge from "../components/Badge.jsx";
import Kpi from "../components/Kpi.jsx";

const PAGE = 25;
const ORDER_BADGE = { PAGADA: ["ok", "Pagada"], PENDIENTE_PAGO: ["warn", "Pendiente de pago"], EXPIRADA: ["quiet", "Expirada"] };
const TICKET_BADGE = { VALIDO: ["info", "Válida"], UTILIZADO: ["ok", "Ya ingresó"], ANULADO: ["bad", "Anulada"], RESERVADO: ["quiet", "Reservada"] };
const PAY_BADGE = {
  PENDIENTE: ["warn", "Pendiente"], CONFIRMADO: ["ok", "Confirmado"], EXPIRADO: ["quiet", "Expirado"], ERROR: ["bad", "Con error"],
  CONFIRMADO_SIN_ORDEN: ["bad", "Cobrado sin orden"], REEMBOLSADO: ["quiet", "Reembolsado"],
};
const B = ({ map, k }) => <Badge tone={(map[k] ?? ["quiet", k])[0]}>{(map[k] ?? ["quiet", k])[1]}</Badge>;

function OrderDetail({ evId, orderId, isSuper }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get(`/events/${evId}/orders/${orderId}`).then((r) => setD(r.data)).catch((e) => setErr(errorMessage(e, "No se pudo cargar la orden.")));
  }, [evId, orderId]);
  if (err) return <p role="alert" className="field-error">{err}</p>;
  if (!d) return <p className="text-sm text-muted">Cargando…</p>;
  return (
    <div className="grid gap-6 text-[14px] md:grid-cols-2">
      <div>
        <h4 className="text-[13px] uppercase tracking-wide text-muted">Comprador</h4>
        <p className="mt-1 font-medium">{d.buyerName}</p>
        <p className="break-all text-muted">{d.buyerEmail}</p>
        <p className="text-muted">{d.buyerPhone}</p>
        <h4 className="mt-4 text-[13px] uppercase tracking-wide text-muted">Compra</h4>
        <ul className="mt-1 space-y-1">
          {d.items.map((i) => (
            <li key={i.tierName} className="flex justify-between gap-4">
              <span>{i.quantity} × {i.tierName} <span className="text-muted">a {fmtBs(i.unitPrice)}</span></span>
              <span>{fmtBs(i.subtotal)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-4 border-t border-line pt-1 font-semibold"><span>Total</span><span>{fmtBs(d.total)}</span></li>
        </ul>
        <h4 className="mt-4 text-[13px] uppercase tracking-wide text-muted">Pago</h4>
        {d.payments.length === 0 ? <p className="mt-1 text-muted">Sin intentos de pago.</p> : (
          <ul className="mt-1 space-y-1">
            {d.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <B map={PAY_BADGE} k={p.status} />
                <span className="text-muted">{fmtBs(p.amount)} · {fmtDateTime(p.createdAt)}</span>
                {isSuper && p.providerPaymentId && <span className="break-all text-[12px] text-muted">{p.provider} {p.providerPaymentId}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="text-[13px] uppercase tracking-wide text-muted">Entradas de esta orden</h4>
        {d.tickets.length === 0 ? (
          <p className="mt-1 text-muted">{d.status === "PAGADA" ? "No hay entradas asociadas." : "Todavía no se emitieron entradas (la orden no está pagada)."}</p>
        ) : (
          <ul className="mt-1 divide-y divide-line rounded-md border border-line">
            {d.tickets.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span><span className="font-medium tabular-nums">{t.shortCode}</span> <span className="text-muted">· {t.tierName} · {t.sectorName}</span></span>
                <B map={TICKET_BADGE} k={t.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function EventSales() {
  const { ev } = useOutletContext();
  const isSuper = ev.scope === "SUPERADMIN";
  const [sales, setSales] = useState(null);
  const [salesErr, setSalesErr] = useState("");
  const [status, setStatus] = useState("TODAS");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [list, setList] = useState(null);
  const [listErr, setListErr] = useState("");
  const [open, setOpen] = useState(null);
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    api.get(`/events/${ev.id}/sales`).then((r) => setSales(r.data)).catch((e) => setSalesErr(errorMessage(e, "No se pudieron cargar las ventas.")));
  }, [ev.id]);

  // La búsqueda espera a que se deje de escribir
  useEffect(() => {
    const id = setTimeout(() => { setQ(qInput.trim()); setPage(0); }, 350);
    return () => clearTimeout(id);
  }, [qInput]);

  const loadList = useCallback(() => {
    const my = ++seq.current;
    const params = { limit: PAGE, offset: page * PAGE };
    if (status !== "TODAS") params.status = status;
    if (q.length >= 2) params.q = q;
    api.get(`/events/${ev.id}/orders`, { params })
      .then((r) => { if (my === seq.current) { setList(r.data); setListErr(""); setOpen(null); } })
      .catch((e) => { if (my === seq.current) setListErr(errorMessage(e, "No se pudieron cargar las órdenes.")); });
  }, [ev.id, status, q, page]);
  useEffect(loadList, [loadList]);

  async function exportCsv() {
    setExporting(true);
    try {
      const params = {};
      if (status !== "TODAS") params.status = status;
      if (q.length >= 2) params.q = q;
      const r = await api.get(`/events/${ev.id}/orders/export`, { params, responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ventas-${ev.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "evento"}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setListErr(errorMessage(e, "No se pudo exportar."));
    } finally {
      setExporting(false);
    }
  }

  if (salesErr) return <p role="alert" className="field-error">{salesErr}</p>;
  if (!sales) return <p className="text-muted">Cargando ventas…</p>;
  const t = sales.totals;
  const noPct = sales.commissionPct === null;
  const maxDay = Math.max(1, ...sales.byDay.map((d) => Number(d.gross)));
  const pages = list ? Math.max(1, Math.ceil(list.total / PAGE)) : 1;

  return (
    <div className="space-y-10">
      <section aria-label="Resumen de ventas">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Entradas vendidas" value={t.sold} hint={plural(t.orders, "orden pagada", "órdenes pagadas")} />
          <Kpi label="Ingresos brutos" value={fmtBs(t.gross)} hint="Lo que pagaron los compradores" />
          <Kpi
            label={`Comisión (${fmtPct(sales.commissionPct)})`}
            value={noPct ? "—" : fmtBs(t.commission)}
            hint={noPct ? "Aún no se definió el porcentaje para este evento." : "Se descuenta del organizador"}
          />
          <Kpi label={isSuper ? "Neto del organizador" : "Neto para ti"} value={noPct ? "—" : fmtBs(t.net)} tone="lamp" hint={noPct ? "Se calcula cuando se defina la comisión." : "Bruto menos comisión"} />
        </div>
        {(t.pendingOrders > 0 || t.expiredOrders > 0) && (
          <p className="mt-4 text-[14px] text-muted">
            {t.pendingOrders > 0 && <>En espera de pago: <span className="text-ink">{plural(t.pendingOrders, "orden", "órdenes")} ({fmtBs(t.pendingAmount)})</span>. </>}
            {t.expiredOrders > 0 && <>Expiradas sin pagar: {t.expiredOrders}. </>}
            Solo cuentan como venta las órdenes pagadas.
          </p>
        )}
        {ev.status === "CANCELADO" && t.orders > 0 && (
          <p role="status" className="mt-4 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-[15px] text-warn">
            El evento está cancelado: las entradas vendidas quedaron anuladas. Los reembolsos se gestionan aparte.
          </p>
        )}
      </section>

      <section aria-labelledby="tiers-title">
        <h2 id="tiers-title" className="font-display text-3xl font-semibold leading-none">Por tier</h2>
        {sales.tiers.length === 0 ? (
          <p className="mt-4 text-[15px] text-muted">Este evento no tiene tiers de venta todavía.</p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <thead className="border-b border-line text-[13px] text-muted">
                <tr><th className="px-4 py-3 font-medium">Tier</th><th className="px-4 py-3 text-right font-medium">Precio</th><th className="px-4 py-3 font-medium">Vendidas</th><th className="px-4 py-3 text-right font-medium">Ingresos</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sales.tiers.map((r) => {
                  const pct = r.assigned > 0 ? Math.min(100, (r.sold / r.assigned) * 100) : 0;
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3"><span className="font-medium">{r.name}</span> <span className="text-muted">· {r.sectorName}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtBs(r.price)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-24 tabular-nums">{r.sold} de {r.assigned}</span>
                          <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-raised sm:block" aria-hidden="true"><span className="block h-full bg-lamp" style={{ width: `${pct}%` }} /></span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">{fmtBs(r.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="days-title">
        <h2 id="days-title" className="font-display text-3xl font-semibold leading-none">Por día</h2>
        <p className="field-hint">Según el día en que se hizo la compra (hora de Bolivia).</p>
        {sales.byDay.length === 0 ? (
          <p className="mt-4 text-[15px] text-muted">Todavía no hay ventas.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
            {sales.byDay.map((d) => (
              <li key={d.day} className="flex items-center gap-3 px-4 py-2.5 text-[14px] sm:gap-4">
                <span className="w-24 shrink-0 capitalize text-muted">{fmtYmd(d.day)}</span>
                <span className="hidden h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-raised sm:block" aria-hidden="true"><span className="block h-full bg-lamp/80" style={{ width: `${(Number(d.gross) / maxDay) * 100}%` }} /></span>
                <span className="min-w-0 flex-1 text-right text-muted sm:w-28 sm:flex-none">{plural(d.sold, "entrada", "entradas")}</span>
                <span className="shrink-0 text-right font-medium tabular-nums sm:w-28">{fmtBs(d.gross)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="orders-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="orders-title" className="font-display text-3xl font-semibold leading-none">Órdenes</h2>
          <button type="button" onClick={exportCsv} disabled={exporting || !list || list.total === 0} className="btn btn-quiet text-sm">
            {exporting ? "Exportando…" : "Exportar a Excel (CSV)"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <input
            className="input max-w-xs" placeholder="Buscar por nombre, correo o teléfono" aria-label="Buscar órdenes"
            value={qInput} onChange={(e) => setQInput(e.target.value)}
          />
          <select className="input w-auto" aria-label="Filtrar por estado" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
            <option value="TODAS">Todas</option>
            <option value="PAGADA">Pagadas</option>
            <option value="PENDIENTE_PAGO">Pendientes de pago</option>
            <option value="EXPIRADA">Expiradas</option>
          </select>
        </div>
        {listErr && <p role="alert" className="field-error">{listErr}</p>}
        {!list && !listErr && <p className="mt-4 text-muted">Cargando…</p>}
        {list && list.total === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-line px-6 py-10 text-center text-[15px] text-muted">
            {q || status !== "TODAS" ? "Ninguna orden coincide con ese filtro." : "Aún no hay órdenes en este evento."}
          </p>
        )}
        {list && list.total > 0 && (
          <>
            <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <thead className="border-b border-line text-[13px] text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Orden</th><th className="px-4 py-3 font-medium">Comprador</th>
                    <th className="px-4 py-3 font-medium">Entradas</th><th className="px-4 py-3 text-right font-medium">Total</th><th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.orders.map((o) => (
                    <Fragment key={o.id}>
                      <tr className="cursor-pointer hover:bg-raised/50" onClick={() => setOpen(open === o.id ? null : o.id)}>
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button" aria-expanded={open === o.id} aria-label={`Ver orden ${o.ref}`}
                            onClick={(e) => { e.stopPropagation(); setOpen(open === o.id ? null : o.id); }}
                            className="font-medium tabular-nums text-lamp underline underline-offset-4"
                          >#{o.ref}</button>
                          <p className="text-[12px] text-muted">{fmtDateTime(o.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3 align-top"><p className="font-medium">{o.buyerName}</p><p className="break-all text-[12px] text-muted">{o.buyerEmail}</p></td>
                        <td className="px-4 py-3 align-top"><p>{o.items ?? "—"}</p>{o.status === "PAGADA" && <p className="text-[12px] text-muted">{o.entered} de {o.quantity} ya ingresaron</p>}</td>
                        <td className="px-4 py-3 text-right align-top font-medium tabular-nums">{fmtBs(o.total)}</td>
                        <td className="px-4 py-3 align-top"><B map={ORDER_BADGE} k={o.status} /></td>
                      </tr>
                      {open === o.id && (
                        <tr className="bg-bg/60"><td colSpan={5} className="px-4 py-5"><OrderDetail evId={ev.id} orderId={o.id} isSuper={isSuper} /></td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-[14px] text-muted">
              <span>{plural(list.total, "orden", "órdenes")}</span>
              {pages > 1 && (
                <span className="flex items-center gap-3">
                  <button type="button" className="btn-ghost disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
                  <span>Página {page + 1} de {pages}</span>
                  <button type="button" className="btn-ghost disabled:opacity-40" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente →</button>
                </span>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
