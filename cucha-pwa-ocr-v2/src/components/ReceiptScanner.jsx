
import React, { useState } from "react";
import Tesseract from "tesseract.js";

const STOP = ["SUBTOTAL","TOTAL","PROPINA","COMPROBANTE","VÁLIDO","VALIDO","BOLETA","SOFTWARE","GARZON","GARZÓN","MESA","PERSONAS","FECHA","ID","AQUI","USAMOS","FUDO","SUB-TOTAL","SUGERIDA"];

// unify digits (e.g., '6 500' -> '6500', '6.500' -> '6500')
function normalizeAmount(s) {
  return s.replace(/[^\d]/g, "");
}

function isLikelyAmount(token) {
  const t = token.replace(/[^\d.,\s]/g, "").trim();
  if (!t) return false;
  // allow 4+ digits or groups like 1.234 / 1 234
  const digits = normalizeAmount(t);
  if (digits.length >= 4) return true;
  // allow 3 digits if clearly price column (handled by position)
  return false;
}

function groupByLine(words) {
  // Group words by y center proximity
  const lines = [];
  const tol = 12; // px tolerance
  words.forEach(w => {
    const y = (w.bbox.y0 + w.bbox.y1) / 2;
    let line = lines.find(L => Math.abs(L.y - y) < tol);
    if (!line) { line = { y, words: [] }; lines.push(line); }
    line.words.push(w);
  });
  // sort lines by y and words by x
  lines.sort((a,b)=>a.y-b.y);
  lines.forEach(L => L.words.sort((a,b)=>a.bbox.x0 - b.bbox.x0));
  return lines;
}

function parseFromWords(words) {
  const lines = groupByLine(words).map(L => ({
    y: L.y,
    tokens: L.words.map(w => ({ text: w.text, x: w.bbox.x0, y: (w.bbox.y0+w.bbox.y1)/2 }))
  }));

  const items = [];
  for (const L of lines) {
    const raw = L.tokens.map(t => t.text).join(" ").trim();
    const rawU = raw.toUpperCase();
    if (!raw || STOP.some(s => rawU.includes(s))) continue;
    // Require at least one letter (to avoid pure dates/times)
    if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(raw)) continue;

    // Identify price chunk from RIGHT by aggregating contiguous numeric-like tokens
    let idx = L.tokens.length - 1;
    let priceTokens = [];
    while (idx >= 0 && /[\d.,\s$]/.test(L.tokens[idx].text)) {
      priceTokens.unshift(L.tokens[idx].text);
      idx--;
    }
    let priceStr = priceTokens.join("").trim();
    // If rightmost token isn't amount-ish, scan back to find a candidate
    if (!isLikelyAmount(priceStr)) {
      for (let j = L.tokens.length - 1; j >= 0; j--) {
        if (isLikelyAmount(L.tokens[j].text)) {
          priceStr = L.tokens.slice(j).map(t => t.text).join("");
          idx = j - 1;
          break;
        }
      }
    }
    const digits = normalizeAmount(priceStr);
    const price = digits ? parseInt(digits, 10) : NaN;
    if (!Number.isFinite(price) || price <= 0) continue;

    // Left side tokens form name (and maybe qty)
    const leftTokens = L.tokens.slice(0, idx + 1).map(t => t.text);
    let nameStr = leftTokens.join(" ").replace(/[–—-]+/g, " ").replace(/\s{2,}/g, " ").trim();
    // Ignore lines with many colons (headers) or very short names
    if ((nameStr.match(/:/g)||[]).length >= 1) continue;
    if (nameStr.length < 3) continue;

    // quantity: leading integer 1-3 digits
    let qty = 1;
    const mQty = nameStr.match(/^\s*(\d{1,3})\s+(.*)$/);
    if (mQty) {
      qty = parseInt(mQty[1], 10);
      nameStr = mQty[2].trim();
    }
    // remove unit-only endings like "500 cc" from name and keep in name (not used)
    if (!nameStr) continue;

    items.push({ name: nameStr, qty: qty, price: price });
  }

  // merge by identical name+price
  const merged = [];
  for (const it of items) {
    const i = merged.findIndex(x => x.name.toUpperCase() === it.name.toUpperCase() && x.price === it.price);
    if (i >= 0) merged[i].qty += it.qty;
    else merged.push(it);
  }
  return merged;
}

export default function ReceiptScanner({ onConfirm, onCancel }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState([]);

  const handleFile = (f) => {
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const runOCR = async () => {
    if (!file) return;
    setStatus("ocr");
    setProgress(0);
    try {
      const { data } = await Tesseract.recognize(file, "spa+eng", {
        logger: m => { if (m.status === "recognizing text" && m.progress) setProgress(Math.round(m.progress * 100)); },
        // improve layout analysis
        // Note: tesseract.js passes config differently, but these hints usually help
        // Keep default PSM; receipts often work well with sparse text.
      });
      const words = (data.words || []).filter(w => (w.text||"").trim().length > 0);
      const parsed = parseFromWords(words);
      if (parsed.length === 0) {
        // fallback to plain text parsing (very defensive)
        const lines = (data.text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const cheap = [];
        for (const line of lines) {
          const up = line.toUpperCase();
          if (STOP.some(s => up.includes(s))) continue;
          const m = line.match(/^(?:(\d{1,3})\s+)?(.+?)\s+(\d{1,3}(?:[.\s]\d{3})+|\d{4,})$/);
          if (!m) continue;
          const qty = m[1] ? parseInt(m[1], 10) : 1;
          const name = m[2].trim();
          const price = parseInt(m[3].replace(/[^\d]/g,""), 10);
          if (name && price) cheap.push({ name, qty, price });
        }
        setItems(cheap.map((it, i) => ({ id:i+1, ...it })));
      } else {
        setItems(parsed.map((it, idx) => ({ id: idx+1, ...it })));
      }
      setStatus("review");
    } catch (e) {
      alert("No pude leer la imagen. ¿Probamos con otra foto más nítida?");
      setStatus("idle");
    }
  };

  const updateItem = (id, patch) => setItems(items.map(it => it.id === id ? { ...it, ...patch } : it));
  const removeItem = (id) => setItems(items.filter(it => it.id !== id));

  return (
    <div className="card">
      <h3>Escanear boleta</h3>
      {status === "idle" && (
        <div className="list">
          <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}/>
          {previewUrl && <img src={previewUrl} alt="preview" style={{maxWidth:"100%", borderRadius:12, border:"1px solid var(--ring)"}}/>}
          <div className="flex">
            <button className="btn primary" onClick={runOCR} disabled={!file}>Leer texto</button>
            <button className="btn" onClick={onCancel}>Cerrar</button>
          </div>
          <div className="small">Tip: toma la foto con buena luz y enfoca la zona donde están los ítems y precios; evita incluir la parte superior con Mesa/Fecha.</div>
        </div>
      )}
      {status === "ocr" && (
        <div>
          <div className="small">Leyendo texto… {progress}%</div>
          <div className="progress"><div style={{width: progress + "%"}}></div></div>
        </div>
      )}
      {status === "review" && (
        <div className="list">
          <table className="preview-table">
            <thead><tr><th>Ítem</th><th>Cant.</th><th>Precio</th><th></th></tr></thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id}>
                  <td><input className="input" value={it.name} onChange={(e)=>updateItem(it.id,{name:e.target.value})}/></td>
                  <td><input className="input" type="number" min="1" step="1" value={it.qty} onChange={(e)=>updateItem(it.id,{qty:Number(e.target.value)})}/></td>
                  <td><input className="input" type="number" min="0" step="1" value={it.price} onChange={(e)=>updateItem(it.id,{price:Number(e.target.value)})}/></td>
                  <td><button className="btn ghost" onClick={()=>removeItem(it.id)}>Eliminar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex">
            <button className="btn primary" onClick={() => onConfirm(items)}>Agregar a ítems</button>
            <button className="btn" onClick={onCancel}>Cancelar</button>
          </div>
          <div className="small">Ignoro líneas de encabezado / subtotal / propina / total. Edita lo que necesites antes de confirmar.</div>
        </div>
      )}
    </div>
  );
}
