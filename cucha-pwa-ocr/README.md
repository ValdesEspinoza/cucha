# Cucha — PWA con OCR y links Fintoc

- **Escanear boleta:** Usa Tesseract.js para reconocer texto de una foto y extraer ítems (cantidad + precio). 
  - Captura desde móvil: input con `capture="environment"`.
  - Filtro automático de líneas de encabezado/subtotal/propina/total.
  - Editor previo a agregar a la lista.
- **Links de pago Fintoc:** Si eliges pagador, pones su usuario Fintoc (ej: `javierv`) y la moneda es **CLP**, en “Transferencias sugeridas” aparece un botón **Transferir** a `https://fintoc.me/<usuario>/<monto>`.

## Desarrollo local
```bash
npm install
npm run dev
```

## Build / Deploy
```bash
npm run build
```
Súbelo a Vercel (framework **Vite**, output `dist`) o arrastra `dist/` a Netlify.

> Nota: La primera vez que uses OCR puede requerir internet para descargar el modelo. Luego el navegador lo cachea.
