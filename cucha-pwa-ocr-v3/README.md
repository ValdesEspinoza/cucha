# Cucha — OCR v3 (posiciones + preproceso)
- Preprocesa la imagen (grises + contraste + *upscaling*) antes del OCR.
- *Parser* por posiciones: toma el **importe más a la derecha** (≥4 dígitos) como precio; ignora encabezados (Mesa/Fecha/Subtotal/Propina/Total).
- Requisitos: primera ejecución online para descargar modelo de Tesseract; luego queda cacheado.

## Scripts
npm install
npm run dev
npm run build
