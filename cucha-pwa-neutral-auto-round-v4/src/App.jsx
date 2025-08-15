import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Receipt, Plus, Trash2, Users, Download, Upload, Wallet, Calculator, CheckCircle2, Share2, Copy, ExternalLink, Send } from "lucide-react";

// Service worker registration
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(isFinite(n) ? n : 0);

// Automatic rounding to integer for payment suggestions (e.g., 122.9 -> 123)
const roundInt = (x) => Math.round(Number(x) || 0);

const DEFAULT_STATE = {
  currency: "CLP",
  people: [
    { id: uid(), name: "Javi" },
    { id: uid(), name: "Amiga 1" },
  ],
  items: [
    { id: uid(), name: "Pizza", qty: 1, price: 12000, assigned: [] },
    { id: uid(), name: "Bebidas", qty: 2, price: 2500, assigned: [] },
  ],
  taxPct: 0,
  tipPct: 10,
  otherFees: 0,
  paidBy: "",
  notes: "",
  fintocUser: ""
};

const STORAGE_KEY = "cucha:neutral:auto-round:v1";

function usePersistentState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);
  return [state, setState];
}

export default function App() {
  // PWA install prompt
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installAvailable, setInstallAvailable] = useState(false);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); setInstallAvailable(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstallAvailable(false);
  };

  const [data, setData] = usePersistentState(STORAGE_KEY, DEFAULT_STATE);
  const { people, items, currency, taxPct, tipPct, otherFees, paidBy, notes, fintocUser } = data;

  const subtotal = useMemo(() => items.reduce((acc, it) => acc + Number(it.price || 0) * Number(it.qty || 0), 0), [items]);
  const tax = useMemo(() => (subtotal * Number(taxPct || 0)) / 100, [subtotal, taxPct]);
  const tip = useMemo(() => (subtotal * Number(tipPct || 0)) / 100, [subtotal, tipPct]);
  const total = useMemo(() => subtotal + tax + tip + Number(otherFees || 0), [subtotal, tax, tip, otherFees]);

  const perPersonPreFees = useMemo(() => {
    const base = Object.fromEntries(people.map((p) => [p.id, 0]));
    items.forEach((it) => {
      const price = Number(it.price || 0) * Number(it.qty || 0);
      const assigned = it.assigned && it.assigned.length ? it.assigned : people.map((p) => p.id);
      const perHead = assigned.length ? price / assigned.length : 0;
      assigned.forEach((pid) => (base[pid] += perHead));
    });
    return base;
  }, [items, people]);

  const sumPreFees = Object.values(perPersonPreFees).reduce((a, b) => a + b, 0) || 1;

  const perPersonTotals = useMemo(() => {
    const result = {};
    people.forEach((p) => {
      const share = perPersonPreFees[p.id] || 0;
      const proportion = share / sumPreFees;
      const extra = total - subtotal;
      result[p.id] = share + extra * proportion;
    });
    return result;
  }, [people, perPersonPreFees, sumPreFees, subtotal, total]);

  const settlements = useMemo(() => {
    if (!paidBy) return [];
    const payer = paidBy;
    return people
      .filter((p) => p.id !== payer)
      .map((p) => ({ from: p.id, to: payer, amount: perPersonTotals[p.id] }));
  }, [paidBy, people, perPersonTotals]);

  // CRUD
  const addPerson = () => setData({ ...data, people: [...people, { id: uid(), name: `Amig@ ${people.length + 1}` }] });
  const removePerson = (id) => setData({ ...data, people: people.filter((p) => p.id !== id), items: items.map((it) => ({ ...it, assigned: (it.assigned || []).filter((x) => x !== id) })) });
  const renamePerson = (id, name) => setData({ ...data, people: people.map((p) => (p.id === id ? { ...p, name } : p)) });

  const addItem = () => setData({ ...data, items: [...items, { id: uid(), name: "Nuevo ítem", qty: 1, price: 0, assigned: [] }] });
  const updateItem = (id, patch) => setData({ ...data, items: items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const removeItem = (id) => setData({ ...data, items: items.filter((it) => it.id !== id) });

  const resetAll = () => setData(DEFAULT_STATE);

  const exportJson = () => {
    try {
      const filename = `cucha-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    } catch (e) {
      const dataStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      window.open(dataStr, "_blank");
    }
  };

  const importJson = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        setData({ ...DEFAULT_STATE, ...obj });
      } catch {
        alert("Archivo inválido");
      }
    };
    reader.readAsText(file);
  };

  // Helpers
  const payer = people.find(p => p.id === paidBy);
  const canFintoc = currency === "CLP" && paidBy && (fintocUser || "").trim().length > 0;
  const buildFintoc = (amount) => `https://fintoc.me/${encodeURIComponent(fintocUser)}/${roundInt(amount)}`;
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); alert("Copiado al portapapeles"); } catch { prompt("Copia el link:", text); } };
  const waMsg = (fromName, amount) => {
    const amt = roundInt(amount);
    const base = `Hola ${fromName}! Tu parte en Cucha es ${fmt(amt, currency)}.` + (canFintoc ? `\nPaga acá: ${buildFintoc(amount)}` : "");
    return encodeURIComponent(base);
  };

  return (
    <div className="container">
      <div className="header">
        <div>
          <div className="h1"><Receipt size={28}/> Cucha</div>
          <div className="sub">Reparte la cuenta con tus amig@s fácil y justo ✨</div>
        </div>
        <div className="flex">
          <select value={currency} onChange={(e) => setData({ ...data, currency: e.target.value })} className="input" style={{width:140}}>
            <option value="CLP">CLP</option><option value="USD">USD</option><option value="EUR">EUR</option>
            <option value="BRL">BRL</option><option value="ARS">ARS</option><option value="PEN">PEN</option>
            <option value="COP">COP</option><option value="MXN">MXN</option>
          </select>
          <button className="btn" onClick={exportJson}><Download size={16}/>Exportar</button>
          <label className="btn"><Upload size={16}/>Importar
            <input type="file" accept="application/json" style={{display:"none"}} onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}/>
          </label>
          <button className="btn danger" onClick={resetAll}><Trash2 size={16}/>Reiniciar</button>
          {installAvailable && <button className="btn primary" onClick={triggerInstall}><Share2 size={16}/>Instalar app</button>}
        </div>
      </div>

      <div className="row">
        <div className="card">
          <h3><Users size={16}/> Personas</h3>
          <div className="list">
            {people.map((p) => (
              <div key={p.id} className="flex">
                <input className="input" value={p.name} onChange={(e) => renamePerson(p.id, e.target.value)} />
                <button className="btn ghost" onClick={() => removePerson(p.id)}><Trash2 size={16}/></button>
              </div>
            ))}
            <button className="btn primary" onClick={addPerson}><Plus size={16}/>Agregar persona</button>

            <div className="hr"></div>
            <div className="small">¿Quién pagó la cuenta?</div>
            <select className="input" value={paidBy} onChange={(e) => setData({ ...data, paidBy: e.target.value })}>
              <option value="">Seleccionar</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            {paidBy && (
              <div style={{marginTop:8}}>
                <div className="small">Usuario Fintoc del pagador (solo CLP)</div>
                <input className="input" placeholder="ej: javierv" value={fintocUser} autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text" onChange={(e)=>setData({...data, fintocUser: e.target.value})}/>
                <div className="small">Fintoc distingue mayúsculas/minúsculas. Algunos teclados ponen mayúscula al inicio; escríbelo en minúsculas.</div>
                {/[A-Z]/.test(fintocUser) && <div className="small" style={{color:"#b91c1c"}}>Detecté mayúsculas en el usuario; Fintoc es sensible a mayúsculas/minúsculas.</div>}
</div>
            ))}
          </div>

          {paidBy && settlements.length > 0 && (
            <div>
              <div className="hr"></div>
              <div className="badge" style={{marginBottom:8}}>Transferencias sugeridas</div>
              <div className="list">
                {settlements.map((s,idx)=>{ 
  const from = people.find(p=>p.id===s.from)?.name||""; 
  const payerName = people.find(p=>p.id===s.to)?.name || "Pagador";
  const rounded = roundInt(s.amount);
  const link = canFintoc ? buildFintoc(s.amount) : null;
  return (
    <div key={idx} className="transfer">
      <div className="info">{from} → {payerName}</div>
      <div className="amount">{fmt(rounded, currency)}</div>
      <div className="actions">
        {link && <a className="btn" href={link} target="_blank" rel="noopener">Transferir</a>}
        {link && <button className="btn" onClick={()=>copy(link)}>Copiar</button>}
        <a className="btn" href={`https://wa.me/?text=${waMsg(from, s.amount)}`} target="_blank" rel="noopener">WhatsApp</a>
      </div>
    </div>
  );
})}</div>
              {paidBy && !canFintoc && (
                <div className="small" style={{marginTop:8}}>
                  Para links Fintoc usa **CLP** y completa el usuario Fintoc del pagador.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="footer">Hecho con 💙 por Javi. Tus datos se guardan localmente en este navegador.</div>
    </div>
  );
}
