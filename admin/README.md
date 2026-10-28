# Panel de administración de Rocktickets

App React (Vite + Tailwind) para organizadores y superadministradores. Vive aparte del
sitio público (`frontend/`): otro puerto, otro origen, otro build.

## Cómo correrlo

```powershell
cd K:\Rocktickets\admin
npm install
npm run dev        # http://localhost:5174
```

El backend debe estar corriendo (por defecto en http://localhost:3000). Si está en otra
dirección, copia `.env.example` a `.env` y cambia `VITE_API_URL`.

## Acceso

- Superadministrador: el usuario del seed (`admin@rocktickets.local`).
- Organizador: lo crea el superadmin (`POST /organizers/:id/admins` o el panel AdminJS).
- El personal de puerta no entra a este panel.

## Notas de seguridad

- La sesión se guarda en `sessionStorage` (se borra al cerrar la pestaña).
- La seguridad real está en el backend: cada consulta se filtra por organizador. Este panel
  solo oculta lo que no corresponde.
- En producción: servirlo desde su propio dominio y restringir CORS del backend a los
  dominios reales del sitio y del panel.
