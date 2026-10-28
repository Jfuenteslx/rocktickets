import { useState } from "react";
import api from "../lib/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function fmtWhen(iso) {
  return new Date(iso).toLocaleString("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Dibuja el ticket en un <canvas> y lo descarga como PNG. Se hace en el
// navegador (sin librerías ni dependencias nativas): el QR viene del backend,
// que es quien lo genera; acá solo se compone la imagen para guardar/compartir.
async function downloadTicketPng({ qrPath, ticket, event }) {
  const { data: blob } = await api.get(qrPath, { responseType: "blob" });
  const url = URL.createObjectURL(blob);
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });

  const W = 800;
  const H = 1100;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");

  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#dc2626";
  g.fillRect(0, 0, W, 14);

  g.textAlign = "center";
  g.fillStyle = "#dc2626";
  g.font = "bold 26px sans-serif";
  g.fillText("ROCKTICKETS", W / 2, 84);

  g.fillStyle = "#18181b";
  g.font = "bold 46px sans-serif";
  g.fillText(event.name, W / 2, 160, W - 80);

  g.fillStyle = "#52525b";
  g.font = "26px sans-serif";
  g.fillText(fmtWhen(event.startsAt), W / 2, 208, W - 80);
  if (event.venueName) g.fillText(event.venueName, W / 2, 246, W - 80);

  const qr = 560;
  g.drawImage(img, (W - qr) / 2, 290, qr, qr);

  g.fillStyle = "#18181b";
  g.font = "bold 64px monospace";
  g.fillText(ticket.shortCode, W / 2, 960);

  g.fillStyle = "#3f3f46";
  g.font = "28px sans-serif";
  g.fillText(`${ticket.sectorName} · ${ticket.tierName}`, W / 2, 1010, W - 80);

  g.fillStyle = "#a1a1aa";
  g.font = "20px sans-serif";
  g.fillText("Presenta este QR en la puerta. Un solo uso.", W / 2, 1060);

  URL.revokeObjectURL(url);
  const out = await new Promise((r) => c.toBlob(r, "image/png"));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(out);
  a.download = `ticket-${ticket.shortCode}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// basePath: de dónde sale el QR (compras: /orders/token, cortesías: /courtesies/token)
export default function TicketCard({ token, ticket, event, basePath = "/orders/token" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const qrPath = `${basePath}/${token}/tickets/${ticket.id}/qr.png`;
  const used = ticket.status === "UTILIZADO";

  async function handleDownload() {
    setBusy(true);
    setErr("");
    try {
      await downloadTicketPng({ qrPath, ticket, event });
    } catch {
      setErr("No se pudo generar la imagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden">
      <div className="bg-red-600 h-1.5" />
      <div className="p-4 flex gap-4 items-center">
        <img
          src={`${API_URL}${qrPath}`}
          alt={`QR del ticket ${ticket.shortCode}`}
          className={`w-32 h-32 shrink-0 ${used ? "opacity-30" : ""}`}
        />
        <div className="min-w-0">
          <p className="font-mono text-2xl font-bold">{ticket.shortCode}</p>
          <p className="text-sm text-zinc-600">
            {ticket.sectorName} · {ticket.tierName}
          </p>
          <span
            className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
              used ? "bg-zinc-200 text-zinc-600" : "bg-green-100 text-green-700"
            }`}
          >
            {used ? "YA UTILIZADO" : "VÁLIDO"}
          </span>
          <div>
            <button
              onClick={handleDownload}
              disabled={busy || used}
              className="mt-3 text-sm border border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 px-3 py-1.5 rounded-md"
            >
              {busy ? "Generando..." : "Descargar PNG"}
            </button>
            {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
