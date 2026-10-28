import { useEffect, useRef, useState } from "react";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 5 * 1024 * 1024;

// value: File nuevo (o null). currentUrl: imagen que el evento ya tiene.
export default function ImagePicker({ value, onChange, currentUrl }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  function pick(file) {
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError("Usa una imagen JPG, PNG o WEBP.");
    if (file.size > MAX) return setError("La imagen pesa más de 5 MB. Prueba con una más liviana.");
    setError("");
    onChange(file);
  }

  const shown = preview || currentUrl;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={TYPES.join(",")}
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0]);
        }}
        className="group relative block aspect-[4/5] w-full overflow-hidden rounded-lg border border-dashed border-[#3A4757] bg-bg transition-colors hover:border-lamp"
        aria-label={shown ? "Cambiar imagen del evento" : "Elegir imagen del evento"}
      >
        {shown ? (
          <>
            <img src={shown} alt="Vista previa de la imagen del evento" className="h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10 text-left text-sm font-medium">
              Cambiar imagen
            </span>
          </>
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-muted group-hover:text-lamp" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="1.8" />
              <path d="m4 18 5-5 4 4 3-3 4 4" />
            </svg>
            <span className="text-[15px] font-medium">Elegir imagen</span>
            <span className="text-[13px] text-muted">o arrástrala hasta aquí</span>
          </span>
        )}
      </button>
      <p className="field-hint">JPG, PNG o WEBP, hasta 5 MB. Se ve mejor en vertical.</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      {value && (
        <button type="button" onClick={() => onChange(null)} className="mt-2 text-[13px] text-muted underline underline-offset-2 hover:text-ink">
          Quitar la imagen elegida
        </button>
      )}
    </div>
  );
}
