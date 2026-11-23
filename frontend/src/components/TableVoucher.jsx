import { formatMoney } from "../lib/events";

// Voucher de reserva de mesa. Solo se muestra: no lleva QR ni se escanea (cada persona entra con su ticket).
export default function TableVoucher({ order, confirmed }) {
  const tables = order.tables ?? [];
  if (tables.length === 0) return null;
  const until = order.event?.tableValidUntil ?? "23:00";

  return (
    <section className="mt-8" aria-labelledby="voucher-titulo">
      <h2 id="voucher-titulo" className="section-title">{confirmed ? "Tu reserva de mesa" : "Tu mesa (pendiente de pago)"}</h2>
      <div className="mt-3 grid gap-3">
        {tables.map((t) => (
          <div key={t.tableLabel} className="card overflow-hidden">
            <div className="h-1.5 bg-brand" />
            <div className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-3xl font-bold uppercase text-white">Mesa {t.tableLabel}</p>
                <p className="text-sm text-zinc-400">{t.sectorName}</p>
              </div>
              {Number(t.price) > 0 ? (
                <>
                  <p className="mt-1 font-medium text-white">{t.packageName} · {formatMoney(t.price)}</p>
                  <p className="text-sm text-zinc-400">
                    {t.people} personas, con la entrada de cada una incluida{t.bottle ? ` · Botella incluida: ${t.bottle}` : ""}
                  </p>
                  {t.bottle && <p className="mt-1 text-xs text-zinc-500">La botella la eliges en el local.</p>}
                </>
              ) : (
                <>
                  <p className="mt-1 font-medium text-white">{t.packageName} para {t.people} {t.people === 1 ? "persona" : "personas"}</p>
                  <p className="text-sm text-zinc-400">{t.bottle}. Presenta tus entradas al llegar.</p>
                </>
              )}
              <p className="mt-3 rounded-md bg-zinc-800/70 px-3 py-2 text-sm text-zinc-300">
                Tu mesa se guarda hasta las <strong className="text-white">{until}</strong>. Pasada esa hora se libera para el local; tus entradas siguen valiendo.
              </p>
            </div>
          </div>
        ))}
      </div>
      {confirmed && (
        <p className="mt-3 text-xs text-zinc-500">
          Muestra este comprobante en el local. Cada persona entra con su propio ticket con QR, abajo.
        </p>
      )}
    </section>
  );
}
