import { ROW_DEFAULTS, TABLE_DEFAULTS } from "../lib/seatingGeometry.js";

// Valores iniciales del generador (texto vacío = "lo que quepa")
export const initialGen = (kind) => ({
  kind,
  params:
    kind === "MESAS"
      ? { seatsPerTable: String(TABLE_DEFAULTS.seatsPerTable), cols: "", rows: "", gapX: String(TABLE_DEFAULTS.gapX), gapY: String(TABLE_DEFAULTS.gapY) }
      : {
          rows: "", seatsPerRow: "", seatGap: String(ROW_DEFAULTS.seatGap), rowGap: String(ROW_DEFAULTS.rowGap),
          aisleEvery: "0", aisleGap: String(ROW_DEFAULTS.aisleGap), firstRow: "A", rowOrder: "top-down", numbering: "ltr",
        },
});

// Convierte los textos del formulario en números (vacío = null = automático)
export function numericParams(gen) {
  const out = {};
  for (const [k, v] of Object.entries(gen.params)) {
    if (["firstRow", "rowOrder", "numbering"].includes(k)) out[k] = v;
    else out[k] = v === "" || Number.isNaN(Number(v)) ? null : Number(v);
  }
  return out;
}

function NumberField({ id, label, value, onChange, placeholder, min = 0, max = 999 }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <input
        id={id} className="input" type="number" min={min} max={max} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Panel del generador de mesas y butacas de un sector (modo "Mesas y asientos")
export default function SeatingPanel({ sector, savedStats, gen, setGen, stats, saving, error, onGenerate, onSave, onClear, onExit, manual }) {
  const set = (patch) => setGen((g) => ({ ...g, params: { ...g.params, ...patch } }));
  const p = gen?.params;
  const canSwitch = sector.type === "MIXTO";

  return (
    <section className="rounded-lg border border-line bg-surface p-4" aria-label="Mesas y asientos">
      <h2 className="font-display text-xl font-semibold">Mesas y asientos</h2>
      <p className="mt-1 text-[13px] text-muted">
        Sector «{sector.name}»{" "}
        {savedStats.seats > 0
          ? `· hoy tiene ${savedStats.tables > 0 ? `${savedStats.tables} mesas y ` : ""}${savedStats.seats} asientos`
          : "· todavía sin mesas ni asientos"}
        .
      </p>

      {!gen ? (
        <div className="mt-4 space-y-3">
          {canSwitch && (
            <p className="text-[13px] text-muted">Este sector es mixto: elige qué quieres generar.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {(sector.type === "MESAS" || canSwitch) && (
              <button type="button" className="btn btn-primary !py-1.5 !text-sm" onClick={() => onGenerate("MESAS")}>Generar mesas</button>
            )}
            {(sector.type === "BUTACAS" || canSwitch) && (
              <button type="button" className="btn btn-primary !py-1.5 !text-sm" onClick={() => onGenerate("FILAS")}>Generar filas de butacas</button>
            )}
          </div>
          {manual && <ManualEditor m={manual} sector={sector} saving={saving} />}
          {savedStats.seats > 0 && (
            <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={onClear} disabled={saving}>Borrar todas las mesas y asientos</button>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3 text-[14px]">
          <p className="text-[13px] text-muted">
            Vista previa en el plano. Cambia los valores y se actualiza sola; al guardar se reemplaza lo que el sector tiene hoy.
          </p>
          {gen.kind === "MESAS" ? (
            <div className="grid grid-cols-2 gap-3">
              <NumberField id="g-spt" label="Asientos por mesa" value={p.seatsPerTable} onChange={(v) => set({ seatsPerTable: v })} min={1} max={24} />
              <div />
              <NumberField id="g-cols" label="Columnas" value={p.cols} placeholder="Auto" onChange={(v) => set({ cols: v })} min={1} />
              <NumberField id="g-rows" label="Filas" value={p.rows} placeholder="Auto" onChange={(v) => set({ rows: v })} min={1} />
              <NumberField id="g-gx" label="Separación horizontal" value={p.gapX} onChange={(v) => set({ gapX: v })} min={1} max={400} />
              <NumberField id="g-gy" label="Separación vertical" value={p.gapY} onChange={(v) => set({ gapY: v })} min={1} max={400} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <NumberField id="g-rows" label="Filas" value={p.rows} placeholder="Auto" onChange={(v) => set({ rows: v })} min={1} />
              <NumberField id="g-spr" label="Asientos por fila" value={p.seatsPerRow} placeholder="Auto" onChange={(v) => set({ seatsPerRow: v })} min={1} />
              <NumberField id="g-sg" label="Separación asientos" value={p.seatGap} onChange={(v) => set({ seatGap: v })} min={1} max={200} />
              <NumberField id="g-rg" label="Separación filas" value={p.rowGap} onChange={(v) => set({ rowGap: v })} min={1} max={200} />
              <NumberField id="g-ae" label="Pasillo cada N asientos" value={p.aisleEvery} onChange={(v) => set({ aisleEvery: v })} min={0} max={100} />
              <NumberField id="g-ag" label="Ancho del pasillo" value={p.aisleGap} onChange={(v) => set({ aisleGap: v })} min={0} max={200} />
              <div>
                <label htmlFor="g-first" className="field-label">Primera fila</label>
                <input id="g-first" className="input" maxLength={3} value={p.firstRow} onChange={(e) => set({ firstRow: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label htmlFor="g-order" className="field-label">Orden de filas</label>
                <select id="g-order" className="input" value={p.rowOrder} onChange={(e) => set({ rowOrder: e.target.value })}>
                  <option value="top-down">De arriba hacia abajo</option>
                  <option value="bottom-up">De abajo hacia arriba</option>
                </select>
              </div>
              <div className="col-span-2">
                <label htmlFor="g-num" className="field-label">Numeración</label>
                <select id="g-num" className="input" value={p.numbering} onChange={(e) => set({ numbering: e.target.value })}>
                  <option value="ltr">De izquierda a derecha</option>
                  <option value="rtl">De derecha a izquierda</option>
                </select>
              </div>
            </div>
          )}

          <p className="rounded border border-line bg-bg px-3 py-2">
            {stats.tables > 0 && <>{stats.tables} mesas · </>}
            <strong>{stats.seats}</strong> asientos → aforo del sector: <strong>{stats.active}</strong>
          </p>
          {stats.seats === 0 && !stats.problem && <p className="field-error">No cabe nada con estos valores: reduce las separaciones.</p>}
          {stats.problem && <p className="field-error">{stats.problem}</p>}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary !py-1.5 !text-sm" onClick={onSave} disabled={saving || stats.seats === 0 || !!stats.problem}>
              {saving ? "Guardando…" : "Guardar mesas y asientos"}
            </button>
            <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => setGen(null)} disabled={saving}>Descartar vista previa</button>
          </div>
        </div>
      )}

      {error && <p className="field-error mt-3">{error}</p>}
      <button type="button" className="btn btn-ghost mt-4 !py-1.5 !text-sm" onClick={onExit} disabled={saving}>← Volver al plano</button>
    </section>
  );
}

// Edición manual: poner mesas y butacas sueltas, moverlas, renombrarlas, quitarlas o desactivarlas
function ManualEditor({ m, sector, saving }) {
  const canTables = sector.type === "MESAS" || sector.type === "MIXTO";
  const canRows = sector.type === "BUTACAS" || sector.type === "MIXTO";
  const sel = m.sel;
  return (
    <div className="space-y-3 border-t border-line pt-4 text-[14px]">
      <h3 className="font-medium">Ajuste manual</h3>
      <p className="text-[13px] text-muted">
        Toca una mesa o un asiento para elegirlo y arrástralo para moverlo. Con Supr lo quitas y con Esc lo sueltas.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {canTables && (
          <div>
            <label htmlFor="m-nseats" className="field-label">Asientos de la mesa nueva</label>
            <input id="m-nseats" className="input" type="number" min="1" max="24" value={m.addTableSeats} onChange={(e) => m.setAddTableSeats(e.target.value)} />
          </div>
        )}
        {canRows && (
          <div>
            <label htmlFor="m-row" className="field-label">Fila de la butaca nueva</label>
            <input id="m-row" className="input" maxLength={3} value={m.addRow} onChange={(e) => m.setAddRow(e.target.value.toUpperCase())} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {canTables && (
          <button type="button" className={`btn !py-1.5 !text-sm ${m.placing === "table" ? "btn-primary" : "btn-quiet"}`} onClick={() => m.setPlacing(m.placing === "table" ? null : "table")} disabled={saving}>
            + Mesa
          </button>
        )}
        {canRows && (
          <button type="button" className={`btn !py-1.5 !text-sm ${m.placing === "seat" ? "btn-primary" : "btn-quiet"}`} onClick={() => m.setPlacing(m.placing === "seat" ? null : "seat")} disabled={saving}>
            + Butaca
          </button>
        )}
      </div>
      {m.placing && <p className="text-[13px] text-muted">Toca el plano para colocarla (puedes tocar varias veces). Vuelve a pulsar el botón para terminar.</p>}

      {sel?.kind === "table" && (
        <div className="space-y-3 rounded border border-line bg-bg p-3">
          <p className="font-medium">Mesa seleccionada</p>
          <div>
            <label htmlFor="m-tlabel" className="field-label">Nombre</label>
            <input id="m-tlabel" className="input" maxLength={20} value={sel.item.label} onChange={(e) => m.onRenameTable(sel.item.k, e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-tseats" className="field-label">Cantidad de asientos</label>
            <input id="m-tseats" className="input" type="number" min="1" max="24" value={sel.item.seats.length} onChange={(e) => m.onSetTableSeats(sel.item.k, e.target.value)} />
          </div>
          <p className="text-[13px] text-muted">{sel.item.seats.filter((q) => q.active).length} activos de {sel.item.seats.length}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => m.onAddSeatToTable(sel.item.k)} disabled={sel.item.seats.length >= 24}>+ Asiento</button>
            <button type="button" className="btn btn-quiet !py-1.5 !text-sm !text-bad" onClick={() => m.onDeleteTable(sel.item.k)}>Quitar mesa</button>
          </div>
          <p className="text-[12px] text-muted">Al cambiar la cantidad se reparten de nuevo los asientos alrededor de la mesa.</p>
        </div>
      )}
      {sel?.kind === "seat" && (
        <div className="space-y-3 rounded border border-line bg-bg p-3">
          <p className="font-medium">{sel.table ? `Asiento de la mesa ${sel.table.label}` : "Butaca"}</p>
          <div className="grid grid-cols-2 gap-3">
            {!sel.table && (
              <div>
                <label htmlFor="m-srow" className="field-label">Fila</label>
                <input id="m-srow" className="input" maxLength={3} value={sel.item.rowLabel} onChange={(e) => m.onRenameRow(sel.item.k, e.target.value.toUpperCase())} />
              </div>
            )}
            <div>
              <label htmlFor="m-slabel" className="field-label">{sel.table ? "Letra" : "Número"}</label>
              <input id="m-slabel" className="input" maxLength={20} value={sel.item.label} onChange={(e) => m.onRenameSeat(sel.item.k, e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => m.onToggleSeat(sel.item.k)}>
              {sel.item.active ? "Desactivar (no se vende)" : "Activar"}
            </button>
            <button type="button" className="btn btn-quiet !py-1.5 !text-sm !text-bad" onClick={() => m.onDeleteSeat(sel.item.k)}>Quitar asiento</button>
          </div>
        </div>
      )}

      {m.problems.map((p) => <p key={p} className="field-error">{p}</p>)}
      <p className="rounded border border-line bg-bg px-3 py-2">
        {m.stats.tables > 0 && <>{m.stats.tables} mesas · </>}
        <strong>{m.stats.seats}</strong> asientos → aforo del sector: <strong>{m.stats.active}</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary !py-1.5 !text-sm" onClick={m.onSaveDraft} disabled={saving || !m.dirty || m.problems.length > 0}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={m.onDiscard} disabled={saving || !m.dirty}>Descartar cambios</button>
      </div>
    </div>
  );
}
