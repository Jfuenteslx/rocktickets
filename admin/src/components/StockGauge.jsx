// Talón del ticket: cuántos tickets hay en cada situación. La barra muestra lo
// ocupado (vendido, cortesía, reservado); el resto de la pista es lo disponible.
export default function StockGauge({ tickets }) {
  const { total, disponible, reservado, vendidos, cortesias, ingresaron } = tickets;

  if (total === 0) {
    return (
      <div>
        <p className="text-[15px] font-medium">Sin tickets generados</p>
        <p className="mt-1 text-[13px] leading-snug text-muted">
          Los tickets se generan según el aforo del local, antes de abrir la venta.
        </p>
      </div>
    );
  }

  const pct = (n) => `${(n / total) * 100}%`;
  const segs = [
    { n: vendidos, cls: "bg-lamp", label: "Vendidos" },
    { n: cortesias, cls: "bg-[#6F93BD]", label: "Cortesías" },
    { n: reservado, cls: "bg-warn", label: "Reservados" },
  ];

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-semibold leading-none">{vendidos}</span>
        <span className="text-sm text-muted">{vendidos === 1 ? "vendido" : "vendidos"} de {total}</span>
      </div>
      <div
        role="img"
        aria-label={`${vendidos} vendidos, ${cortesias} cortesías, ${reservado} reservados, ${disponible} disponibles, ${ingresaron} ya ingresaron, de ${total} tickets`}
        className="mt-3 flex h-2 overflow-hidden rounded-full bg-raised"
      >
        {segs.map((s) =>
          s.n > 0 ? (
            <div key={s.label} className={`gauge-seg h-full ${s.cls}`} style={{ width: pct(s.n) }} />
          ) : null
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
        <div className="flex justify-between gap-2"><dt className="text-muted">Disponibles</dt><dd>{disponible}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted">Ingresaron</dt><dd>{ingresaron}</dd></div>
        {cortesias > 0 && (
          <div className="flex justify-between gap-2"><dt className="text-muted">Cortesías</dt><dd>{cortesias}</dd></div>
        )}
        {reservado > 0 && (
          <div className="flex justify-between gap-2"><dt className="text-muted">Reservados</dt><dd>{reservado}</dd></div>
        )}
      </dl>
    </div>
  );
}
