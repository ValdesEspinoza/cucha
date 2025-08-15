import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Receipt, Plus, Trash2, Users, Download, Upload, Wallet, Calculator, CheckCircle2, Share2, ScanEye, ExternalLink } from "lucide-react";
import ReceiptScanner from "./components/ReceiptScanner.jsx";

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (n, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(isFinite(n) ? n : 0);

const DEFAULT_STATE = {
  currency: "CLP",
  people: [{ id: uid(), name: "Javi" }, { id: uid(), name: "Amiga 1" }],
  items: [],
  taxPct: 0, tipPct: 10, otherFees: 0, paidBy: "", fintocUser: "", notes: "",
};
const STORAGE_KEY = "cucha:v4";

function usePersistentState(key, initial) {
  const [state, setState] = useState(() => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

export default function App() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installAvailable, setInstallAvailable] = useState(false);
  useEffect(() => { const h = (e)=>{ e.preventDefault(); setDeferredPrompt(e); setInstallAvailable(true); }; window.addEventListener("beforeinstallprompt", h); return ()=>window.removeEventListener("beforeinstallprompt", h); }, []);
  const triggerInstall = async ()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); setInstallAvailable(false); };

  const [data, setData] = usePersistentState(STORAGE_KEY, DEFAULT_STATE);
  const { people, items, currency, taxPct, tipPct, otherFees, paidBy, notes, fintocUser } = data;

  const subtotal = useMemo(()=> items.reduce((a,it)=>a + Number(it.price||0)*Number(it.qty||0),0), [items]);
  const tax = useMemo(()=> (subtotal*Number(taxPct||0))/100, [subtotal,taxPct]);
  const tip = useMemo(()=> (subtotal*Number(tipPct||0))/100, [subtotal,tipPct]);
  const total = useMemo(()=> subtotal + tax + tip + Number(otherFees||0), [subtotal,tax,tip,otherFees]);

  const perPersonPreFees = useMemo(() => {
    const base = Object.fromEntries(people.map(p=>[p.id,0]));
    items.forEach(it=>{
      const price = Number(it.price||0)*Number(it.qty||0);
      const assigned = it.assigned && it.assigned.length ? it.assigned : people.map(p=>p.id);
      const perHead = assigned.length ? price/assigned.length : 0;
      assigned.forEach(pid => base[pid]+=perHead);
    });
    return base;
  }, [items, people]);

  const sumPreFees = Object.values(perPersonPreFees).reduce((a,b)=>a+b,0) || 1;
  const perPersonTotals = useMemo(()=>{
    const res={}; people.forEach(p=>{const share = perPersonPreFees[p.id]||0; const prop = share/sumPreFees; const extra = total - subtotal; res[p.id]=share + extra*prop;}); return res;
  },[people,perPersonPreFees,sumPreFees,subtotal,total]);

  const settlements = useMemo(()=>{
    if(!paidBy) return []; const payer=paidBy;
    return people.filter(p=>p.id!==payer).map(p=>({from:p.id,to:payer,amount:perPersonTotals[p.id]}));
  },[paidBy,people,perPersonTotals]);

  const addPerson = ()=> setData({...data, people:[...people,{id:uid(), name:`Amig@ ${people.length+1}`}] });
  const removePerson = (id)=> setData({...data, people: people.filter(p=>p.id!==id), items: items.map(it=>({...it, assigned:(it.assigned||[]).filter(x=>x!==id)})) });
  const renamePerson = (id,name)=> setData({...data, people: people.map(p=>p.id===id?{...p,name}:p)});

  const addItem = ()=> setData({...data, items:[...items, {id:uid(), name:"Nuevo ítem", qty:1, price:0, assigned:[]}] });
  const updateItem = (id,patch)=> setData({...data, items: items.map(it=>it.id===id?{...it,...patch}:it)});
  const removeItem = (id)=> setData({...data, items: items.filter(it=>it.id!==id)});

  const resetAll = ()=> setData(DEFAULT_STATE);

  const exportJson = ()=>{ try{ const fn=`cucha-${new Date().toISOString().slice(0,10)}.json`; const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=fn; a.rel="noopener"; a.style.display="none"; document.body.appendChild(a); a.click(); setTimeout(()=>{document.body.removeChild(a); URL.revokeObjectURL(url);},0);}catch(e){ const dataStr="data:application/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(data,null,2)); window.open(dataStr,"_blank"); } };
  const importJson = (file)=>{ const r=new FileReader(); r.onload=()=>{ try{ const obj=JSON.parse(r.result); setData({...DEFAULT_STATE, ...obj}); }catch{ alert("Archivo inválido"); } }; r.readAsText(file); };

  const [showScanner, setShowScanner] = useState(false);
  const onScannerConfirm = (parsed)=>{ const newItems = parsed.map(it=>({id:uid(), name:it.name, qty:it.qty, price:it.price, assigned:[]})); setData({...data, items:[...items, ...newItems]}); setShowScanner(false); };

  const canFintoc = currency==="CLP" && paidBy && (fintocUser||"").trim().length>0;
  const fintocLink = (amount)=> `https://fintoc.me/${encodeURIComponent(fintocUser)}/${Math.round(amount)}`;

  return (<div className="container">
    <div className="header">
      <div><div className="h1"><Receipt size={28}/> Cucha</div><div className="sub">Reparte la cuenta con tus amig@s fácil y justo ✨</div></div>
      <div className="flex">
        <select value={currency} onChange={e=>setData({...data, currency:e.target.value})} className="input" style={{width:140}}>
          <option value="CLP">CLP</option><option value="USD">USD</option><option value="EUR">EUR</option>
          <option value="BRL">BRL</option><option value="ARS">ARS</option><option value="PEN">PEN</option>
          <option value="COP">COP</option><option value="MXN">MXN</option>
        </select>
        <button className="btn" onClick={exportJson}><Download size={16}/>Exportar</button>
        <label className="btn"><Upload size={16}/>Importar
          <input type="file" accept="application/json" style={{display:"none"}} onChange={(e)=> e.target.files?.[0] && importJson(e.target.files[0]) }/>
        </label>
        <button className="btn danger" onClick={resetAll}><Trash2 size={16}/>Reiniciar</button>
        {installAvailable && <button className="btn primary" onClick={triggerInstall}><Share2 size={16}/>Instalar app</button>}
      </div>
    </div>

    <div className="row">
      <div className="card">
        <h3><Users size={16}/> Personas</h3>
        <div className="list">
          {people.map(p=>(<div key={p.id} className="flex"><input className="input" value={p.name} onChange={e=>renamePerson(p.id,e.target.value)}/><button className="btn ghost" onClick={()=>removePerson(p.id)}><Trash2 size={16}/></button></div>))}
          <button className="btn primary" onClick={addPerson}><Plus size={16}/>Agregar persona</button>
          <div className="hr"></div>
          <div className="small">¿Quién pagó la cuenta?</div>
          <select className="input" value={paidBy} onChange={e=>setData({...data, paidBy:e.target.value})}>
            <option value="">Seleccionar</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {paidBy && (<div style={{marginTop:8}}><div className="small">Usuario Fintoc del pagador (solo CLP)</div><input className="input" placeholder="ej: javierv" value={fintocUser} onChange={e=>setData({...data, fintocUser:e.target.value})}/></div>)}
        </div>
      </div>

      <div className="card" style={{gridColumn:"span 2"}}>
        <h3><Calculator size={16}/> Ítems consumidos</h3>
        <div className="grid-head"><div>Nombre</div><div style={{textAlign:"right"}}>Cantidad</div><div style={{textAlign:"right"}}>Precio unit.</div><div style={{textAlign:"right"}}>Total</div></div>
        <div className="list">
          {items.map(it=>(
            <motion.div key={it.id} initial={{opacity:0,y:4}} animate={{opacity:1,y:0}} className="card">
              <div className="grid-item">
                <input className="input" value={it.name} onChange={e=>updateItem(it.id,{name:e.target.value})}/>
                <input type="number" min="0" step="1" className="input" value={it.qty} onChange={e=>updateItem(it.id,{qty:Number(e.target.value)})}/>
                <input type="number" min="0" step="1" className="input" value={it.price} onChange={e=>updateItem(it.id,{price:Number(e.target.value)})}/>
                <div style={{textAlign:"right",fontWeight:600}}>{fmt((it.qty||0)*(it.price||0),currency)}</div>
              </div>
              <div className="small" style={{marginTop:8}}>¿Quiénes comparten este ítem? <span className="small">(si no eliges a nadie, se reparte entre todos)</span></div>
              <div className="list" style={{gridTemplateColumns:"repeat(2,1fr)"}}>
                {people.map(p=>(<label key={p.id} className="flex"><input className="checkbox" type="checkbox" checked={(it.assigned||[]).includes(p.id)} onChange={e=>{ const set = new Set(it.assigned||[]); e.target.checked?set.add(p.id):set.delete(p.id); updateItem(it.id,{assigned:Array.from(set)}); }}/><span>{p.name}</span></label>))}
              </div>
              <div className="flex right"><button className="btn ghost" onClick={()=>removeItem(it.id)}><Trash2 size={16}/>Eliminar ítem</button></div>
            </motion.div>
          ))}
          <div className="flex">
            <button className="btn primary" onClick={addItem}><Plus size={16}/>Agregar ítem</button>
            <button className="btn" onClick={()=>setShowScanner(true)}><ScanEye size={16}/>Escanear boleta</button>
          </div>
          {showScanner && <ReceiptScanner onConfirm={onScannerConfirm} onCancel={()=>setShowScanner(false)} />}
        </div>
      </div>

      <div className="card" style={{gridColumn:"span 2"}}>
        <h3><Wallet size={16}/> Ajustes y totales</h3>
        <div className="flex" style={{flexWrap:'wrap'}}>
          <div style={{flex:'1 1 200px'}}><div className="small">Impuesto %</div><input className="input" type="number" min="0" step="0.01" value={taxPct} onChange={e=>setData({...data, taxPct:Number(e.target.value)})}/></div>
          <div style={{flex:'1 1 200px'}}><div className="small">Propina %</div><input className="input" type="number" min="0" step="0.01" value={tipPct} onChange={e=>setData({...data, tipPct:Number(e.target.value)})}/></div>
          <div style={{flex:'1 1 200px'}}><div className="small">Otros cargos (monto)</div><input className="input" type="number" min="0" step="0.01" value={otherFees} onChange={e=>setData({...data, otherFees:Number(e.target.value)})}/></div>
          <div style={{flex:'1 1 200px'}}><div className="small">Subtotal</div><div className="input" style={{display:'flex',alignItems:'center',fontWeight:600}}>{fmt(subtotal,currency)}</div></div>
        </div>
        <div className="flex" style={{flexWrap:'wrap'}}>
          <div style={{flex:'1 1 200px'}}><div className="small">Impuesto</div><div className="input">{fmt(tax,currency)}</div></div>
          <div style={{flex:'1 1 200px'}}><div className="small">Propina</div><div className="input">{fmt(tip,currency)}</div></div>
          <div style={{flex:'1 1 200px'}}><div className="small">Otros</div><div className="input">{fmt(Number(otherFees||0),currency)}</div></div>
          <div style={{flex:'1 1 200px'}}><div className="small">Total</div><div className="input" style={{fontWeight:700}}>{fmt(total,currency)}</div></div>
        </div>
        <div><div className="small">Notas</div><textarea className="input" value={notes} onChange={e=>setData({...data, notes:e.target.value})} placeholder="Restorán, mesa, etc." /></div>
      </div>

      <div className="card">
        <h3><CheckCircle2 size={16}/> Resumen por persona</h3>
        <div className="list">
          {people.map(p=>(<div key={p.id} className="card"><div className="flex" style={{justifyContent:'space-between'}}><div className="badge">{p.name}</div><div className="badge">{fmt(perPersonTotals[p.id]||0,currency)}</div></div><div className="small">Consumo: {fmt(perPersonPreFees[p.id]||0,currency)}</div></div>))}
        </div>
        {paidBy && settlements.length>0 && (<div><div className="hr"></div><div className="badge" style={{marginBottom:8}}>Transferencias sugeridas</div><div className="list">
          {settlements.map((s,idx)=>{ const from = people.find(p=>p.id===s.from)?.name||""; const to = people.find(p=>p.id===s.to)?.name||""; const amount=s.amount;
            return (<div key={idx} className="transfer"><span>{from} → {to}</span><span className="badge">{fmt(amount,currency)}</span>{currency==="CLP" && paidBy && (fintocUser||"").trim().length>0 && (<a className="btn" href={`https://fintoc.me/${encodeURIComponent(fintocUser)}/${Math.round(amount)}`} target="_blank" rel="noopener">Transferir</a>)}</div>);
          })}
        </div>{!(currency==="CLP" && paidBy && (fintocUser||"").trim().length>0) && paidBy && (<div className="small" style={{marginTop:8}}>Para links de pago Fintoc, usa CLP y completa el usuario Fintoc del pagador.</div>)}</div>)}
      </div>
    </div>

    <div className="footer">Hecho con 💙 para dividir cuentas. Tus datos se guardan localmente en este navegador.</div>
  </div>);
}
