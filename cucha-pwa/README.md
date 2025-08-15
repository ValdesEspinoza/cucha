# Cucha — PWA para repartir cuentas

App web progresiva (PWA) hecha con React + Vite. Instalable y con soporte offline.

## Desarrollo local
```bash
npm install
npm run dev
```
Abrir `http://localhost:5173`.

## Build y despliegue
```bash
npm run build
```
La carpeta `dist/` se puede subir a Netlify (arrastrando) o desplegar con Vercel (si usas el repo completo).

### Configuración Vercel sugerida
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

## PWA
- Manifest: `public/manifest.webmanifest`
- Service Worker: `public/sw.js` (caché app shell + offline básico)
- Registro SW y botón “Instalar app” están en `src/App.jsx`.

## Datos
Los datos se guardan en `localStorage` con la clave `cucha:v1`.
