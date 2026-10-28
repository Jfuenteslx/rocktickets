import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { fmtBs, fmtDateTime, fmtPct, plural } from "../lib/format.js";
import Badge from "../components/Badge.jsx";
import Kpi from "../components/Kpi.jsx";

function ReviewList() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api.get("/sales/review").then((r) => setRows(r.data)).catch((e) => setErr(errorMessage(e, "No se pudo cargar la lista.")));
  }, []);
  if (err) return <p role="alert" className="field-error">{err}</p>;
  if (!rows) return <p className="text-muted">Cargando…</p>;
  return (
    <ul className="divide-y divide-line rounded-lg border border-bad/30 bg-surface">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 px-5 py-4 text-[14px]">
          <div className="min-w-0">
            <p className="font-medium">{r.buyerName} <span className="font-normal text-muted">· #{r.ref}</span></p>
            <p className="break-all text-muted">{r.buyerEmail} · {r.buyerPhone}</p>
            <p className="text-muted">{r.eventName} · {r.organizerName}</p>
            {r.providerPaymentId && <p className="break-all text-[12px] text-muted">{r.provider} {r.providerPaymentId}</p>}
          </div>
          <div className="text-right">
            <p className="font-medium tabular-nums">{fmtBs(r.amount)}</p>
            <Badge tone="bad">{r.status === "ERROR" ? "Con error" : "Cobrado sin orden vigente"}</Badge>
            <p className="mt-1 text-[12px] text-muted">{fmtDateTime(r.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Sales() {
  const { user } = useAuth();
  const isSuper = user.role === "SUPERADMIN";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgId] = useState("");

  useEffect(() => {
    if (isSuper) api.get("/organizers").then((r) => setOrgs(r.data)).catch(() => {});
  }, [isSuper]);

  useEffect(() => {
    setData(null);
    api.get("/sales/summary", { params: orgId ? { organizerId: orgId } : {} })
      .then((r) => { setData(r.data); setErr(""); })
      .catch((e) => setErr(errorMessage(e, "No se pudieron cargar las ventas.")));
  }, [orgId]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold leading-none">Ventas</h1>
          <p className="mt-2 text-[15px] text-muted">Órdenes pagadas, comisión y neto de cada evento.</p>
        </div>
        {isSuper && (
          <div>
            <label htmlFor="org-filter" className="sr-only">Organizador</label>
            <select id="org-filter" className="input w-auto" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">Todos los organizadores</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {err && <p role="alert" className="field-error mt-6">{err}</p>}
      {!data && !err && <p className="mt-6 text-muted">Cargando…</p>}

      {data && (
        <>
          {isSuper && data.reviewCount > 0 && (
            <section className="mt-6" aria-labelledby="review-title">
              <h2 id="review-title" className="font-display text-2xl font-semibold text-bad">Pagos por revisar ({data.reviewCount})</h2>
              <p className="field-hint mb-3">Dinero que el banco confirmó pero que no terminó en una orden vigente, o pagos con error. Requieren que alguien los revise.</p>
              <ReviewList />
            </section>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Entradas vendidas" value={data.totals.sold} hint={plural(data.totals.orders, "orden pagada", "órdenes pagadas")} />
            <Kpi label="Ingresos brutos" value={fmtBs(data.totals.gross)} />
            <Kpi label="Comisión" value={fmtBs(data.totals.commission)} hint={data.totals.eventsWithoutCommission > 0 ? `No incluye ${plural(data.totals.eventsWithoutCommission, "evento", "eventos")} con ventas y sin porcentaje definido.` : undefined} />
            <Kpi label={isSuper ? "Neto de organizadores" : "Neto para ti"} value={fmtBs(data.totals.net)} tone="lamp" />
          </div>
          {Number(data.totals.pendingAmount) > 0 && (
            <p className="mt-3 text-[14px] text-muted">En espera de pago: {fmtBs(data.totals.pendingAmount)}. No cuenta como venta hasta que se confirme.</p>
          )}

          {data.events.length === 0 ? (
            <p className="mt-8 rounded-lg border border-dashed border-line px-6 py-12 text-center text-[15px] text-muted">Todavía no hay eventos.</p>
          ) : (
            <div className="mt-8 overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <thead className="border-b border-line text-[13px] text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Evento</th>
                    <th className="px-4 py-3 text-right font-medium">Entradas</th>
                    <th className="px-4 py-3 text-right font-medium">Bruto</th>
                    <th className="px-4 py-3 text-right font-medium">Comisión</th>
                    <th className="px-4 py-3 text-right font-medium">Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.events.map((e) => (
                    <tr key={e.id} className="hover:bg-raised/50">
                      <td className="px-4 py-3">
                        <Link to={`/eventos/${e.id}/ventas`} className="font-medium text-lamp underline underline-offset-4">{e.name}</Link>
                        <p className="text-[12px] text-muted">
                          {fmtDateTime(e.startsAt)} · {e.venueName}{isSuper ? ` · ${e.organizerName}` : ""}
                          {e.status === "CANCELADO" && <> · <span className="text-bad">Cancelado</span></>}
                        </p>
                        {e.pendingOrders > 0 && <p className="text-[12px] text-warn">{plural(e.pendingOrders, "orden en espera", "órdenes en espera")}</p>}
                      </td>
                      <td className="px-4 py-3 text-right align-top tabular-nums">{e.sold}</td>
                      <td className="px-4 py-3 text-right align-top tabular-nums">{fmtBs(e.gross)}</td>
                      <td className="px-4 py-3 text-right align-top tabular-nums">
                        {e.commission === null ? <span className="text-muted">{fmtPct(e.commissionPct)}</span> : <>{fmtBs(e.commission)}<p className="text-[12px] text-muted">{fmtPct(e.commissionPct)}</p></>}
                      </td>
                      <td className="px-4 py-3 text-right align-top font-medium tabular-nums">{e.net === null ? <span className="text-muted">—</span> : fmtBs(e.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
