// Vinted-Snipebot-Mockup.jsx
// Achtung: Dies ist eine **Mock/Prototype React-Datei**.
// Sie greift **nicht** auf Vinted zu und führt keine Scraping-/Automatisierungsaktionen aus.
// Zweck: UI + Logik-Simulation eines Snipe-Bots zur Produktplanung und Testing.

import React, { useEffect, useState, useRef } from "react";

// Simple demo items (Simulierte eingehende Listings)
const SIM_ITEMS = [
  { id: 1, title: "Levi's 501 Jeans - W32 L34", brand: "Levi's", size: "32", price: 35, condition: "gut", country: "DE", createdAt: Date.now() - 1000*60 },
  { id: 2, title: "Nike Air Max 90 - 42", brand: "Nike", size: "42", price: 50, condition: "neuwertig", country: "DE", createdAt: Date.now() - 1000*120 },
  { id: 3, title: "Zara Kleid S", brand: "Zara", size: "S", price: 15, condition: "gebraucht", country: "PL", createdAt: Date.now() - 1000*200 },
  { id: 4, title: "Vintage Lederjacke M", brand: "Vintage", size: "M", price: 120, condition: "sehr gut", country: "FR", createdAt: Date.now() - 1000*300 },
];

function uid() { return Math.random().toString(36).slice(2,9); }

export default function VintedSnipeMock() {
  // Alerts sind Filter-Objekte
  const [alerts, setAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("vs_alerts")||"[]"); } catch { return []; }
  });
  const [results, setResults] = useState([]); // timeline von gefundenen Matches
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [size, setSize] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [condition, setCondition] = useState("");
  const [pollInterval, setPollInterval] = useState(30); // sekunden, nur simulation
  const [running, setRunning] = useState(false);
  const workerRef = useRef(null);

  // persist alerts
  useEffect(()=>{ localStorage.setItem("vs_alerts", JSON.stringify(alerts)); }, [alerts]);

  // simulated incoming feed worker
  useEffect(()=>{
    if (!running) { if (workerRef.current) { clearInterval(workerRef.current); workerRef.current = null; } return; }
    // create interval
    workerRef.current = setInterval(()=>{
      // simulate a new listing occasionally
      if (Math.random() < 0.6) {
        const base = SIM_ITEMS[Math.floor(Math.random()*SIM_ITEMS.length)];
        const newItem = { ...base, id: Date.now()+Math.floor(Math.random()*1000), createdAt: Date.now() };
        checkMatches(newItem);
      }
    }, pollInterval*1000);

    return ()=>{ if (workerRef.current) { clearInterval(workerRef.current); workerRef.current = null; } }
  }, [running, pollInterval, alerts]);

  // Matching function: vergleicht ein Item mit allen Alerts
  function checkMatches(item){
    const matchedAlerts = alerts.filter(a => {
      // keyword match
      if (a.query && !item.title.toLowerCase().includes(a.query.toLowerCase())) return false;
      if (a.brand && a.brand !== "" && item.brand && item.brand.toLowerCase() !== a.brand.toLowerCase()) return false;
      if (a.size && a.size !== "" && String(item.size) !== String(a.size)) return false;
      if (a.priceMax && Number(a.priceMax) > 0 && item.price > Number(a.priceMax)) return false;
      if (a.condition && a.condition !== "" && item.condition.toLowerCase() !== a.condition.toLowerCase()) return false;
      // country filter: if set, only allow same country or 'any'
      if (a.country && a.country !== "any" && item.country !== a.country) return false;
      return true;
    });

    if (matchedAlerts.length > 0){
      const matchRecord = { item, matchedAlerts: matchedAlerts.map(m=>m.name), ts: Date.now() };
      setResults(prev => [matchRecord, ...prev].slice(0,200));
      // browser notification (falls erlaubt)
      try { if (Notification && Notification.permission === "granted") {
        new Notification(`Match: ${item.title}`, { body: `Preis: €${item.price} — Alerts: ${matchedAlerts.map(m=>m.name).join(", ")}` });
      } }
      catch(e){}
    }
  }

  // create alert
  function createAlert(e){
    e?.preventDefault();
    const a = { id: uid(), name: (query||brand||size||priceMax||condition||'Alert') + ' - ' + new Date().toLocaleTimeString(), query, brand, size, priceMax, condition, country: 'DE', interval: pollInterval };
    setAlerts(prev => [a, ...prev]);
    // clear quick form
    setQuery(""); setBrand(""); setSize(""); setPriceMax(""); setCondition("");
  }

  function removeAlert(id){ setAlerts(prev => prev.filter(a=>a.id!==id)); }
  function toggleRunning(){ setRunning(r=>!r); }

  function requestNotif(){ if (!("Notification" in window)) return alert("Browser unterstützt Notifications nicht.");
    Notification.requestPermission().then(p=>{ if (p==='granted') alert('Notifications erlaubt.'); else alert('Notifications nicht erlaubt.'); }); }

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Vinted Snipe - Mockup (Sichere Demo)</h1>
          <p className="text-sm text-gray-600">Dieses Demo simuliert Alerts & Treffer. Es greift NICHT auf Vinted zu.</p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left: Alert Editor */}
          <form onSubmit={createAlert} className="col-span-1 bg-white p-4 rounded shadow">
            <h2 className="font-semibold mb-2">Neuen Alert erstellen</h2>
            <label className="block text-xs">Suchbegriffe</label>
            <input value={query} onChange={e=>setQuery(e.target.value)} className="w-full p-2 border rounded mb-2" placeholder="z.B. Levi's 501" />
            <label className="block text-xs">Marke</label>
            <input value={brand} onChange={e=>setBrand(e.target.value)} className="w-full p-2 border rounded mb-2" placeholder="z.B. Nike" />
            <label className="block text-xs">Größe</label>
            <input value={size} onChange={e=>setSize(e.target.value)} className="w-full p-2 border rounded mb-2" placeholder="z.B. 42 oder M" />
            <label className="block text-xs">Max Preis (€)</label>
            <input value={priceMax} onChange={e=>setPriceMax(e.target.value)} className="w-full p-2 border rounded mb-2" placeholder="z.B. 50" type="number" />
            <label className="block text-xs">Zustand</label>
            <select value={condition} onChange={e=>setCondition(e.target.value)} className="w-full p-2 border rounded mb-3">
              <option value="">Beliebig</option>
              <option value="neuwertig">neuwertig</option>
              <option value="sehr gut">sehr gut</option>
              <option value="gut">gut</option>
              <option value="gebraucht">gebraucht</option>
            </select>

            <label className="block text-xs">Polling-Interval (Sek) — nur Simulation</label>
            <input value={pollInterval} onChange={e=>setPollInterval(Number(e.target.value)||30)} className="w-full p-2 border rounded mb-3" type="number" min={5} />

            <div className="flex gap-2">
              <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded">Alert speichern</button>
              <button type="button" onClick={()=>{ setQuery(''); setBrand(''); setSize(''); setPriceMax(''); setCondition(''); }} className="px-3 py-2 border rounded">Zurücksetzen</button>
            </div>

            <hr className="my-3" />
            <div className="text-xs text-gray-500">
              Hinweis: Diese Demo führt keine automatischen Käufe durch und ist nur zur Produktentwicklung gedacht.
            </div>
          </form>

          {/* Middle: Controls & Active Alerts */}
          <div className="col-span-1 md:col-span-2 bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between mb-3">
              <div>
                <button onClick={toggleRunning} className={`px-3 py-2 rounded ${running ? 'bg-red-500 text-white' : 'bg-green-600 text-white'}`}>{running ? 'Stop' : 'Start'} Simulation</button>
                <button onClick={requestNotif} className="ml-2 px-3 py-2 border rounded">Browser-Notifications</button>
              </div>
              <div className="text-sm text-gray-600">Aktive Alerts: {alerts.length} — Gefundene Matches: {results.length}</div>
            </div>

            <div className="mb-4">
              <h3 className="font-semibold mb-2">Active Alerts</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {alerts.length===0 && <div className="text-sm text-gray-500">Keine Alerts angelegt.</div>}
                {alerts.map(a=> (
                  <div key={a.id} className="p-2 border rounded flex justify-between items-start">
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-gray-600">{[a.query && `"${a.query}"`, a.brand && `Marke: ${a.brand}`, a.size && `Größe: ${a.size}`, a.priceMax && `≤€${a.priceMax}`].filter(Boolean).join(' • ')}</div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button onClick={()=>removeAlert(a.id)} className="text-xs px-2 py-1 border rounded">Löschen</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Treffer-Timeline</h3>
              <div className="max-h-80 overflow-auto">
                {results.length===0 && <div className="text-sm text-gray-500">Noch keine Treffer. Starte die Simulation.</div>}
                {results.map((r, idx)=> (
                  <div key={r.item.id+"-"+idx} className="p-2 border-b flex justify-between items-center">
                    <div>
                      <div className="font-medium">{r.item.title} <span className="text-xs text-gray-500">(€{r.item.price})</span></div>
                      <div className="text-xs text-gray-600">Alerts: {r.matchedAlerts.join(', ')} • Land: {r.item.country} • {new Date(r.ts).toLocaleTimeString()}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>window.open('#','_blank')} className="text-xs px-2 py-1 border rounded">Öffnen</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        <footer className="mt-6 text-xs text-gray-500">
          Diese Datei ist eine sichere, nicht-operationale Demo. Wenn du möchtest, erstelle ich dir als nächsten Schritt:
          <ul className="list-disc ml-5 mt-1">
            <li>Produkt-Spec (User-Stories + Acceptance Criteria) für ein legales Monitoring-Tool</li>
            <li>Backend-Architektur (rechtlich konform) mit Queueing & Rate-Limits</li>
            <li>Oder: Anleitung, wie man mit offiziellen APIs (falls vorhanden) arbeitet</li>
          </ul>
        </footer>
      </div>
    </div>
  );
}
