import React, { useState } from "react";
import Tesseract from "tesseract.js";

const stopWords = ["SUBTOTAL", "TOTAL", "PROPINA", "COMPROBANTE", "VÁLIDO", "VALIDO", "BOLETA", "SOFTWARE", "GARZON", "GARZÓN", "MESA", "PERSONAS", "FECHA", "ID", "AQUI", "USAMOS", "FUDO"];

function parseReceiptText(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = [];
  for (let line of lines) {
    const u = line.toUpperCase();
    if (stopWords.some(w => u.includes(w))) continue;
    // Replace common OCR artifacts
    line = line.replace(/[•·]/g, ".").replace(/[,]/g, ".").replace(/\s{2,}/g, " ").trim();
    // Find last number in the line as price
    const matchPrice = line.match(/(\d{1,3}(?:[\.\s]\d{3})+|\d+)(?:\.(\d{2}))?\s*$/);
    if (!matchPrice) continue;
    const priceStr = matchPrice[0].trim();
    const price = Math.round(parseFloat(priceStr.replace(/\./g, "").replace(/\s/g, "")));
    if (!isFinite(price) || price <= 0) continue;
    const left = line.slice(0, line.lastIndexOf(priceStr)).trim();
    // Optional quantity at start
    const mQty = left.match(/^([0-9]+)\s+(.*)$/);
    let qty = 1;
    let name = left;
    if (mQty) {
      qty = parseInt(mQty[1], 10);
      name = mQty[2].trim();
    }
    // Clean name
    name = name.replace(/[\-–—]+/g, " ").replace(/\s{2,}/g, " ").trim();
    if (name.length < 2) continue;

    out.push({ name, qty: isFinite(qty) && qty > 0 ? qty : 1, price });
  }

  // Merge duplicates by same name+price
  const merged = [];
  for (const item of out) {
    const i = merged.findIndex(x => x.name.toUpperCase() === item.name.toUpperCase() && x.price === item.price);
    if (i >= 0) merged[i].qty += item.qty;
    else merged.push(item);
  }
  return merged;
}

export default function ReceiptScanner({ onConfirm, onCancel }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [status, setStatus] = useState("idle"); // idle | ocr | review
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
      const { data } = await Tesseract.recognize(file, "spa+eng", { logger: m => {
        if (m.status === "recognizing text" && m.progress) setProgress(Math.round(m.progress * 100));
      }});
      const parsed = parseReceiptText(data.text || "");
      setItems(parsed.map((it, idx) => ({ id: idx+1, ...it })));
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
          <div className="small">Tip: toma la foto bien iluminada, perpendicular a la boleta.</div>
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
          <div className="small">No incluyo líneas de “Subtotal/Propina/Total”. Edita lo que necesites antes de confirmar.</div>
        </div>
      )}
    </div>
  );
}
