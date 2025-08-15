import React, { useState } from "react";
import Tesseract from "tesseract.js";

const STOP = ["PRE-CUENTA","SUBTOTAL","TOTAL","PROPINA","SUGERIDA","COMPROBANTE","VALIDO","VÁLIDO","BOLETA","SOFTWARE","GARZON","GARZÓN","MESA","PERSONAS","FECHA","ID","AQUI","USAMOS","FUDO","#"];

function toCanvasURL(file, scale=1.2) {
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      // upscale a bit to help OCR on small fonts
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // simple contrast + grayscale
      const imgData = ctx.getImageData(0,0,c.width,c.height);
      const d = imgData.data;
      for (let i=0;i<d.length;i+=4){
        const g = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
        // contrast
        const v = Math.min(255, Math.max(0, (g-128)*1.15 + 128));
        d[i]=d[i+1]=d[i+2]=v;
      }
      ctx.putImageData(imgData,0,0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function normalizeAmount(s) { return s.replace(/[^\d]/g,""); }

function isAmountLike(token) {
  const digits = normalizeAmount(token);
  return digits.length >= 4; // CLP usual
}

function groupByLine(words) {
  const lines = [];
  const tol = 12;
  for (const w of words) {
    const y = (w.bbox.y0 + w.bbox.y1) / 2;
    let L = lines.find(l => Math.abs(l.y - y) < tol);
    if (!L) { L = { y, words: [] }; lines.push(L); }
    L.words.push(w);
  }
  lines.sort((a,b)=>a.y-b.y);
  lines.forEach(L => L.words.sort((a,b)=>a.bbox.x0 - b.bbox.x0));
  return lines;
}

function parseByPositions(words) {
  const lines = groupByLine(words).map(L => ({
    y: L.y,
    tokens: L.words.map(w => ({ text: (w.text||"").trim(), x: w.bbox.x0, xc: (w.bbox.x0+w.bbox.x1)/2 }))
  }));

  const items = [];
  for (const L of lines) {
    const raw = L.tokens.map(t=>t.text).join(" ").trim();
    const rawU = raw.toUpperCase();
    if (!raw || STOP.some(s=>rawU.includes(s))) continue;
    // discard likely headers with many punctuation or time/date patterns
    if (/[/:].*\d/.test(raw)) continue; // e.g., "Fecha: 14/08/25 20:06:30"
    // need letters present to be an item
    if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(raw)) continue;

    // find rightmost amount-like token (highest xc among tokens where isAmountLike true)
    const candidates = L.tokens.filter(t => isAmountLike(t.text));
    if (candidates.length === 0) continue;
    const rightmost = candidates.reduce((a,b)=> a.xc>b.xc ? a : b);
    const idx = L.tokens.lastIndexOf(rightmost);
    const priceDigits = normalizeAmount(L.tokens.slice(idx).map(t=>t.text).join(""));
    const price = parseInt(priceDigits,10);
    if (!Number.isFinite(price) || price <= 0) continue;

    // name & qty
    let nameStr = L.tokens.slice(0, idx).map(t=>t.text).join(" ").replace(/[–—-]+/g," ").replace(/\s{2,}/g," ").trim();
    // drop trailing colons in name fragments
    if (nameStr.endsWith(":")) continue;
    // guard: require at least 2 alpha tokens or 6+ letters
    const alphaTokens = nameStr.split(/\s+/).filter(t=>/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(t));
    if (alphaTokens.length < 2 && nameStr.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g,"").length < 6) continue;

    let qty = 1;
    const mq = nameStr.match(/^\s*(\d{1,3})\s+(.*)$/);
    if (mq) { qty = parseInt(mq[1],10); nameStr = mq[2].trim(); }

    items.push({ name: nameStr, qty, price });
  }

  // merge duplicates by name+price
  const merged = [];
  for (const it of items) {
    const i = merged.findIndex(x => x.name.toUpperCase() === it.name.toUpperCase() && x.price === it.price);
    if (i >= 0) merged[i].qty += it.qty; else merged.push(it);
  }
  return merged;
}

export default function ReceiptScanner({ onConfirm, onCancel }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState([]);

  const handleFile = async (f) => {
    setFile(f);
    const url = await toCanvasURL(f, 1.3); // slight upscale + contrast
    setPreviewUrl(url);
  };

  const runOCR = async () => {
    if (!file) return;
    setStatus("ocr"); setProgress(0);
    try {
      const image = previewUrl || file;
      const { data } = await Tesseract.recognize(image, "spa+eng", {
        logger: m => { if (m.status === "recognizing text" && m.progress) setProgress(Math.round(m.progress * 100)); },
      });
      const words = (data.words || []).filter(w => (w.text||"").trim());
      const parsed = parseByPositions(words);
      setItems(parsed.map((it, i) => ({ id:i+1, ...it })));
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
          <div className="small">Tip: encuadra sobre la lista de ítems y precios; evita la zona superior (Mesa/Fecha).</div>
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
          <div className="small">Ignoro “Subtotal/Propina/Total”. Edita lo que necesites antes de confirmar.</div>
        </div>
      )}
    </div>
  );
}
