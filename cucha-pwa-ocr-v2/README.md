# Cucha — OCR mejorado (v2)
- Parser por **posición de palabras**: toma la **palabra más a la derecha** como precio (admite `6.500`, `6 500` o `6500`), y reconstruye el nombre a la izquierda. Ignora encabezados como `Mesa/Fecha/Subtotal/Propina/Total` y líneas con `:`.
- Editor previo y merge de duplicados.
- Links Fintoc por deudor (CLP).

## Uso
```bash
npm install
npm run dev
```
Deploy con Vercel (Vite) o Netlify (sube `dist/`).