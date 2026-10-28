import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// El panel vive en su propio puerto/origen (5174), separado del sitio público (5173):
// así el código y la sesión de administración no comparten origen con la web de compra.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
})
