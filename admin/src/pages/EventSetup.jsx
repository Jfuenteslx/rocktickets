import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import { fmtMoney, plural } from "../lib/format.js";
import Badge from "../components/Badge.jsx";
import MesasFlexiblesAdmin from "../components/MesasFlexiblesAdmin.jsx";

// Asistente: deja el evento listo para vender en tres pasos (tipo → precios → publicar).
// El backend (PUT /events/:id/setup) genera los tickets, crea los tiers y reparte todo de una vez.

const MODES = [
  { id: "NINGUNO", title: "Entradas por sector", text: "Entradas sueltas por sector y precio, sin lugar asignado. Lo de siempre." },
  { id: "BUTACAS", title: "Asientos numerados", text: "Cada entrada es un asiento del plano y el comprador lo elige en el mapa." },
  { id: "MESAS_FIJAS", title: "Mesas fijas", text: "Se venden mesas completas con precio por tamaño (ej. mesa de 6 = Bs 600)." },
  { id: "MESAS_FLEXIBLES", title: "Entradas + reserva de mesa", text: "Compran entradas y, si quieren, piden mesa para su grupo; el sistema la elige. Consumo mínimo en el local." },
];

// Cómo se vende un sector según el modo y cómo está dibujado en el plano (igual que el backend)
function kindOf(mode, s) {
  if (mode === "BUTACAS") return s.seats > 0 ? "asientos" : "cantidad";
  if (mode === "MESAS_FIJAS") return s.tables > 0 ? "mesas" : s.seats > 0 ? "sin_mesa" : "cantidad";
  return "cantidad";
}

const STEPS = ["Tipo de evento", "Precios", "Revisar y publicar"];

export default function EventSetup() {
  const { ev, reload, flash } = useOutletContext();
  const cancelled = ev.status === "CANCELADO";
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState("NINGUNO");
  const [rows, setRows] = useState({}); // sectorId -> { sell, price, quantity }
  const [sizes, setSizes] = useState({}); // personas -> precio
  const [until, setUntil] = useState("23:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function load() {
    try {
      const { data } = await api.get(`/events/${ev.id}/setup`);
      setState(data);
      setMode(data.seatingMode);
      setUntil(data.tableValidUntil ?? "23:00");
      setRows(Object.fromEntries(data.sectors.map((s) => [s.id, {
        sell: s.price !== null || data.sectors.every((x) => x.price === null),
        price: s.price !== null ? String(Number(s.price)) : "",
        quantity: s.quantity !== null && s.quantity < s.capacity && s.kind === "cantidad" ? String(s.quantity) : "",
      }])));
      setSizes(Object.fromEntries(data.tableSizes.map((t) => [t.people, t.price !== null ? String(Number(t.price)) : ""])));
      setLoadError("");
    } catch (err) {
      setLoadError(errorMessage(err, "No se pudo cargar la configuración."));
    }
  }
  useEffect(() => { load(); }, [ev.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const kinds = useMemo(() => new Map((state?.sectors ?? []).map((s) => [s.id, kindOf(mode, s)])), [state, mode]);

  if (loadError) return <p role="alert" className="text-bad">{loadError} <button type="button" className="underline" onClick={load}>Reintentar</button></p>;
  if (!state) return <p className="text-muted">Cargando…</p>;

  const locked = state.hasSales || cancelled;
  const setRow = (id, patch) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const hasMesas = state.tableSizes.length > 0;

  // ---- Lo que se enviará y el resumen ----
  const payloadSectors = [];
  const summary = [];
  let totalTickets = 0, totalIncome = 0;
  const problems = [];
  for (const s of state.sectors) {
    const kind = kinds.get(s.id);
    const r = rows[s.id];
    if (kind === "mesas" || kind === "sin_mesa") continue;
    if (!r.sell) { summary.push({ s, text: "No se vende", muted: true }); continue; }
    const price = Number(r.price);
    if (r.price === "" || !Number.isFinite(price) || price < 0) { problems.push(`Pon el precio de «${s.name}» o márcalo como «No se vende».`); continue; }
    if (kind === "asientos") {
      payloadSectors.push({ sectorId: s.id, price });
      totalTickets += s.seats; totalIncome += s.seats * price;
      summary.push({ s, text: `${plural(s.seats, "asiento", "asientos")} a ${fmtMoney(price)}` });
    } else {
      const max = s.capacity;
      const q = r.quantity === "" ? max : Number(r.quantity);
      if (!Number.isInteger(q) || q < 0 || q > max) { problems.push(`La cantidad de «${s.name}» debe estar entre 0 y ${max}.`); continue; }
      payloadSectors.push({ sectorId: s.id, price, ...(r.quantity !== "" && { quantity: q }) });
      totalTickets += q; totalIncome += q * price;
      summary.push({ s, text: `${plural(q, "entrada", "entradas")} a ${fmtMoney(price)}` });
    }
  }
  const payloadSizes = [];
  if (mode === "MESAS_FIJAS") {
    for (const t of state.tableSizes) {
      const raw = sizes[t.people] ?? "";
      if (raw === "") { summary.push({ text: `Mesas de ${t.people}: sin precio, no se venden (${t.tables})`, muted: true }); continue; }
      const price = Number(raw);
      if (!Number.isFinite(price) || price <= 0) { problems.push(`Precio inválido para las mesas de ${t.people}.`); continue; }
      if (Math.round(price * 100) % t.people !== 0) { problems.push(`El precio de la mesa de ${t.people} debe repartirse en partes iguales entre ${t.people} personas (centavos exactos).`); continue; }
      payloadSizes.push({ people: t.people, price });
      totalTickets += t.tables * t.people; totalIncome += t.tables * price;
      summary.push({ text: `${plural(t.tables, "mesa", "mesas")} de ${t.people} a ${fmtMoney(price)} cada una` });
    }
  }
  const nothingToSell = totalTickets === 0 && problems.length === 0;
  const modeChanged = mode !== state.seatingMode;
  const hasTickets = state.sectors.some((s) => s.generated > 0);

  async function publish() {
    setBusy(true); setError("");
    try {
      const body = {
        seatingMode: mode,
        sectors: payloadSectors,
        ...(mode === "MESAS_FIJAS" && { tablePrices: payloadSizes }),
        ...(hasMesas && mode !== "NINGUNO" && mode !== "BUTACAS" && { tableValidUntil: until }),
      };
      const { data } = await api.put(`/events/${ev.id}/setup`, body);
      setResult(data);
      await reload();
      await load();
      flash({ title: "Evento listo para vender", detail: `${plural(totalTickets, "entrada", "entradas")} a la venta.` });
      setStep(3);
    } catch (err) {
      setError(errorMessage(err, "No se pudo aplicar la configuración."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-3xl font-semibold leading-none">Configurar entradas</h3>
        <p className="mt-1.5 max-w-2xl text-[15px] text-muted">Tres pasos y el evento queda listo: el sistema crea los tickets y reparte todo solo. Puedes volver a pasar por aquí mientras no haya ventas.</p>
      </div>

      {locked && (
        <p role="status" className="rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-[15px] text-warn">
          {cancelled ? "El evento está cancelado." : "Este evento ya tiene tickets reservados, vendidos o de cortesía, así que el asistente no puede cambiar su configuración."}{" "}
          {!cancelled && <>Ajusta cantidades en <Link to=".." className="underline">Entradas</Link> y la ubicación en <Link to="../ubicacion" className="underline">Ubicación</Link>.</>}
        </p>
      )}

      {step < 3 && (
        <ol className="flex flex-wrap gap-2" aria-label="Pasos">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button type="button" disabled={i > step} onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${i === step ? "border-lamp bg-lamp/10 text-ink" : i < step ? "border-line text-ink hover:border-[#3A4757]" : "border-line text-muted opacity-60"}`}>
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
      )}

      {step === 0 && (
        <section aria-labelledby="s1">
          <h4 id="s1" className="font-display text-2xl font-semibold">¿Cómo compra el público?</h4>
          <div role="radiogroup" aria-label="Tipo de evento" className="mt-4 grid gap-3 sm:grid-cols-2">
            {MODES.map((m) => {
              const active = mode === m.id;
              const noPlan = (m.id === "BUTACAS" && !state.sectors.some((s) => s.seats > 0)) || ((m.id === "MESAS_FIJAS" || m.id === "MESAS_FLEXIBLES") && !hasMesas);
              return (
                <button key={m.id} type="button" role="radio" aria-checked={active} disabled={locked}
                  onClick={() => setMode(m.id)}
                  className={`rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-lamp bg-lamp/10" : "border-line bg-surface hover:border-[#3A4757]"}`}>
                  <span className="flex items-center gap-2">
                    <span className="font-display text-xl font-semibold">{m.title}</span>
                    {state.seatingMode === m.id && <Badge tone="ok">Actual</Badge>}
                  </span>
                  <span className="mt-1 block text-[14px] leading-snug text-muted">{m.text}</span>
                  {noPlan && <span className="mt-2 block text-[13px] text-warn">El plano del local no tiene {m.id === "BUTACAS" ? "asientos" : "mesas"}: dibújalos en el editor del local.</span>}
                </button>
              );
            })}
          </div>
          {modeChanged && hasTickets && !locked && (
            <p className="mt-4 text-[14px] text-muted">Al publicar se regenerarán los tickets disponibles para el tipo nuevo (nadie los ha comprado).</p>
          )}
          <div className="mt-6"><button type="button" className="btn btn-primary" onClick={() => setStep(1)}>Siguiente: precios</button></div>
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="s2" className="space-y-6">
          <h4 id="s2" className="font-display text-2xl font-semibold">Precios por sector</h4>
          <ul className="space-y-3">
            {state.sectors.map((s) => {
              const kind = kinds.get(s.id);
              const r = rows[s.id];
              return (
                <li key={s.id} className="rounded-md border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-semibold">{s.name}</p>
                      <p className="text-[13px] text-muted">
                        {kind === "asientos" && `${plural(s.seats, "asiento", "asientos")}, un solo precio para todos`}
                        {kind === "cantidad" && `Aforo ${s.capacity}`}
                        {kind === "mesas" && `${plural(s.tables, "mesa", "mesas")}: se venden por tamaño (abajo)`}
                        {kind === "sin_mesa" && `${plural(s.seats, "asiento", "asientos")} sin mesa: no se venden en mesas fijas`}
                      </p>
                    </div>
                    {(kind === "cantidad" || kind === "asientos") && (
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={r.sell} disabled={locked} onChange={(e) => setRow(s.id, { sell: e.target.checked })} /> Se vende
                        </label>
                        <div>
                          <label className="field-label" htmlFor={`p-${s.id}`}>Precio (Bs)</label>
                          <input id={`p-${s.id}`} type="number" min="0" step="0.01" inputMode="decimal" className="input !w-28" value={r.price} disabled={locked || !r.sell} onChange={(e) => setRow(s.id, { price: e.target.value })} />
                        </div>
                        {kind === "cantidad" && (
                          <div>
                            <label className="field-label" htmlFor={`q-${s.id}`}>Cantidad</label>
                            <input id={`q-${s.id}`} type="number" min="0" max={s.capacity} className="input !w-24" placeholder={String(s.capacity)} value={r.quantity} disabled={locked || !r.sell} onChange={(e) => setRow(s.id, { quantity: e.target.value })} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {mode === "MESAS_FIJAS" && (
            <div>
              <h5 className="font-display text-xl font-semibold">Precio de cada mesa según su tamaño</h5>
              <p className="mt-1 max-w-2xl text-[14px] text-muted">El precio incluye la entrada de cada persona. El sistema lo asigna solo a todas las mesas de ese tamaño. Déjalo vacío para no vender ese tamaño.</p>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {state.tableSizes.map((t) => (
                  <li key={t.people} className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-4">
                    <div>
                      <p className="font-display text-xl font-semibold">Mesa de {t.people}</p>
                      <p className="text-[13px] text-muted">{plural(t.tables, "mesa", "mesas")} en el plano</p>
                    </div>
                    <div>
                      <label className="field-label" htmlFor={`m-${t.people}`}>Precio (Bs)</label>
                      <input id={`m-${t.people}`} type="number" min="0" step="0.01" inputMode="decimal" className="input !w-28" value={sizes[t.people] ?? ""} disabled={locked} onChange={(e) => setSizes((x) => ({ ...x, [t.people]: e.target.value }))} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(mode === "MESAS_FIJAS" || mode === "MESAS_FLEXIBLES") && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="field-label" htmlFor="vig-setup">La mesa se guarda hasta las</label>
                <input id="vig-setup" type="time" className="input !w-36" value={until} disabled={locked} onChange={(e) => setUntil(e.target.value)} />
              </div>
              <p className="field-hint max-w-md">Pasada esa hora la mesa se libera para el local; los tickets siguen valiendo.</p>
            </div>
          )}
          {mode === "MESAS_FLEXIBLES" && (
            <p className="text-[14px] text-muted">Las mesas que no se ofrecen al público (por ejemplo la del grupo que toca) las eliges al publicar, en el último paso.</p>
          )}

          {problems.length > 0 && (
            <ul role="alert" className="list-disc space-y-1 pl-5 text-[14px] text-warn">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Atrás</button>
            <button type="button" className="btn btn-primary" disabled={problems.length > 0} onClick={() => setStep(2)}>Siguiente: revisar</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="s3" className="space-y-5">
          <h4 id="s3" className="font-display text-2xl font-semibold">Revisa y publica</h4>
          <div className="rounded-md border border-line bg-surface p-4">
            <p className="text-sm text-muted">Tipo: <strong className="text-ink">{MODES.find((m) => m.id === mode).title}</strong></p>
            <ul className="mt-3 space-y-1.5 text-[15px]">
              {summary.map((x, i) => (
                <li key={i} className={x.muted ? "text-muted" : ""}>{x.s ? <><strong>{x.s.name}:</strong> {x.text}</> : x.text}</li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-[15px]">
              Salen a la venta <strong>{plural(totalTickets, "lugar", "lugares")}</strong>; si se vende todo, ingresarían <strong>{fmtMoney(totalIncome)}</strong>.
            </p>
            {(mode === "MESAS_FIJAS" || mode === "MESAS_FLEXIBLES") && <p className="mt-1 text-[13px] text-muted">Las mesas se guardan hasta las {until}.</p>}
          </div>
          {nothingToSell && <p role="alert" className="text-warn">No hay nada a la venta: vuelve y pon al menos un precio.</p>}
          {error && <p role="alert" className="field-error">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)} disabled={busy}>Atrás</button>
            <button type="button" className="btn btn-primary" onClick={publish} disabled={busy || locked || nothingToSell}>{busy ? "Aplicando…" : "Publicar configuración"}</button>
          </div>
        </section>
      )}

      {step === 3 && result && (
        <section aria-labelledby="s4" className="space-y-4">
          <h4 id="s4" className="font-display text-2xl font-semibold">Listo: el evento está configurado</h4>
          <p className="text-[15px] text-muted">Los tickets ya están creados y repartidos. Cualquier cambio de precio lo haces volviendo a este asistente.</p>
          {result.warnings.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-[14px] text-warn">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-quiet" onClick={() => { setResult(null); setStep(0); }}>Cambiar configuración</button>
            <Link to=".." className="btn btn-ghost">Ver entradas</Link>
          </div>
          {mode === "MESAS_FLEXIBLES" && (
            <div className="pt-4">
              <p className="mb-4 max-w-2xl text-[15px] text-muted">Último detalle: si alguna mesa no debe ofrecerse al público (por ejemplo la del grupo que toca), sácala aquí. Si no, ya terminaste.</p>
              <MesasFlexiblesAdmin ev={{ ...ev, tableValidUntil: state.tableValidUntil }} cancelled={cancelled} onChanged={reload} onlyBlocks />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
