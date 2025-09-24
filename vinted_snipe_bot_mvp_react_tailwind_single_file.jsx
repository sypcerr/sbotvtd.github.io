import React, { useEffect, useMemo, useState, useRef } from "react";

/*
  Vinted Snipe-Bot MVP (single-file React + Tailwind)
  - Drop into a Vite + React + Tailwind project (e.g. src/App.jsx)
  - Features:
    1. Create multiple Alerts (term, brand, size, maxPrice, condition)
    2. Alerts persisted in localStorage
    3. Dashboard showing matched listings (title, price, alertName, timestamp, country)
    4. Sort by price or newest; search filter over results
    5. Polling simulation (start/stop); uses a best-effort fetch to Vinted, falls back to mock data
    6. Browser push notifications (opt-in)
    7. Clean Tailwind-based UI, responsive
  - IMPORTANT: This app intentionally DOES NOT perform scraping nor any automated purchases.
*/

// --- Helpers -----------------------------------------------------------------
const LS_KEYS = {
  ALERTS: "vinted_snipe_alerts_v1",
  LISTINGS: "vinted_snipe_listings_v1",
  SETTINGS: "vinted_snipe_settings_v1",
};

const nowTs = () => new Date().toISOString();

// simple fuzzy match for strings (case-insensitive, contains)
function matchesText(field = "", query = "") {
  if (!query) return true;
  return field.toLowerCase().includes(query.toLowerCase());
}

// Try to parse number safely
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Mock listing generator for offline/demo
function makeMockListing(id) {
  const brands = ["Zara", "H&M", "Nike", "Adidas", "Vintage"];
  const titles = [
    "Cozy knit sweater",
    "Vintage windbreaker",
    "Denim jacket",
    "Sneakers size 42",
    "Retro dress",
  ];
  const countries = ["DE", "FR", "NL", "BE", "PL"];
  const price = Math.floor(Math.random() * 90) + 10;
  const brand = brands[Math.floor(Math.random() * brands.length)];
  return {
    id: `mock-${id}-${Date.now()}`,
    title: `${titles[Math.floor(Math.random() * titles.length)]} - ${brand}`,
    brand,
    size: ["S", "M", "L", "XL"][Math.floor(Math.random() * 4)],
    price,
    currency: "EUR",
    condition: ["New", "Like New", "Good", "Fair"][Math.floor(Math.random() * 4)],
    createdAt: new Date().toISOString(),
    country: countries[Math.floor(Math.random() * countries.length)],
    url: "#",
  };
}

// Attempt to fetch from Vinted public endpoints. Note: CORS may block direct fetches.
// If it fails, the code falls back to mock data.
async function fetchVintedListings({ query = "jacke", page = 1, perPage = 20 } = {}) {
  // Example attempt to call a Vinted search endpoint; may need a server-side proxy in production.
  const searchUrl = `https://www.vinted.de/api/v2/catalog/items?search_text=${encodeURIComponent(
    query
  )}&per_page=${perPage}&page=${page}`;

  try {
    console.log(`Attempting to fetch Vinted listings from: ${searchUrl}`);
    const res = await fetch(searchUrl);
    if (!res.ok) {
      console.error(`Vinted API fetch failed with status: ${res.status}`);
      throw new Error("network");
    }
    const json = await res.json();
    // transform into our listing shape
    if (json?.items) {
      return json.items.map((it) => ({
        id: it.id ?? `vinted-${Math.random().toString(36).slice(2, 9)}`,
        title: it.title ?? it?.catalog?.title ?? "Listing",
        brand: it.brand?.title ?? it?.attributes?.brand ?? "",
        size: it?.size ?? (it.attributes || []).find((a) => a.name === "Size")?.values?.[0] ?? "",
        price: it.price?.amount ?? (it.price ? Number(it.price) : null) ?? 0,
        currency: it.price?.currency ?? "EUR",
        condition: it.condition ?? "",
        createdAt: it.created_timestamp
          ? new Date(it.created_timestamp * 1000).toISOString()
          : new Date().toISOString(),
        country: it?.location?.country ?? "DE",
        url: it.url ?? "#",
      }));
    }
    throw new Error("no-items");
  } catch (e) {
    console.error("Error fetching Vinted listings:", e);
    // fallback to mock list
    console.log("Falling back to mock data.");
    const fallback = Array.from({ length: perPage }).map((_, i) => makeMockListing(i + page * perPage));
    return fallback;
  }
}

// --- Main App ----------------------------------------------------------------
export default function App() {
  // Alerts state
  const [alerts, setAlerts] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.ALERTS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  // Listings that have been seen / matched
  const [listings, setListings] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.LISTINGS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const [query, setQuery] = useState(""); // search bar filter
  const [sortBy, setSortBy] = useState("newest"); // or 'price'
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef(null);
  const [pollIntervalMs, setPollIntervalMs] = useState(10000);
  const [status, setStatus] = useState("idle");

  // settings: notification opt-in
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.SETTINGS);
      const s = raw ? JSON.parse(raw) : {};
      return !!s.notificationsEnabled;
    } catch (e) {
      return false;
    }
  });

  // persist alerts & listings & settings
  useEffect(() => {
    localStorage.setItem(LS_KEYS.ALERTS, JSON.stringify(alerts));
  }, [alerts]);
  useEffect(() => {
    localStorage.setItem(LS_KEYS.LISTINGS, JSON.stringify(listings));
  }, [listings]);
  useEffect(() => {
    localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify({ notificationsEnabled }));
  }, [notificationsEnabled]);

  // Add or remove alerts
  function addAlert(newAlert) {
    setAlerts((prev) => {
      const next = [...prev, { id: `a_${Date.now()}`, createdAt: nowTs(), ...newAlert }];
      return next;
    });
  }
  function removeAlert(id) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  // Matching logic: given alerts, determine which listings match
  function matchListingToAlerts(listing, alertsList) {
    const matches = [];
    for (const alert of alertsList) {
      const termOk = matchesText(listing.title ?? "", alert.term ?? "") || matchesText(listing.brand ?? "", alert.term ?? "");
      const brandOk = !alert.brand || matchesText(listing.brand ?? "", alert.brand);
      const sizeOk = !alert.size || (listing.size && matchesText(String(listing.size), alert.size));
      const priceOk = !safeNum(alert.maxPrice) || (safeNum(listing.price) !== null && listing.price <= Number(alert.maxPrice));
      const conditionOk = !alert.condition || matchesText(listing.condition ?? "", alert.condition);

      if (termOk && brandOk && sizeOk && priceOk && conditionOk) {
        matches.push(alert);
      }
    }
    return matches; // array of matching alerts
  }

  // handle notifications
  async function maybeNotify(listing, matchedAlerts) {
    if (!notificationsEnabled) return;
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission === "granted") {
      const title = `Match: ${listing.title}`;
      const body = `${listing.price} ${listing.currency} — Alerts: ${matchedAlerts.map((a) => a.name).join(", ")}`;
      new Notification(title, { body, tag: listing.id });
    }
  }

  // Polling: fetch new listings, match to alerts, store matches
  async function pollOnce() {
    setStatus("fetching");
    try {
      // naive: fetch using the first alert term if exists, else 'jacke' fallback
      const anyTerm = alerts[0]?.term || "jacke";
      const fetched = await fetchVintedListings({ query: anyTerm, perPage: 12 });

      // For each fetched listing, see if it matches any alert
      const newlyMatched = [];
      for (const l of fetched) {
        const matches = matchListingToAlerts(l, alerts);
        if (matches.length > 0) {
          // attach metadata
          newlyMatched.push({
            ...l,
            matchedAlertIds: matches.map((m) => m.id),
            matchedAlertNames: matches.map((m) => m.name || m.term || "Unnamed"),
            seenAt: nowTs(),
          });
        }
      }

      if (newlyMatched.length > 0) {
        // merge into listings, avoid duplicates by id
        setListings((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          for (const n of newlyMatched) map.set(n.id, n);
          const merged = Array.from(map.values()).sort((a, b) => new Date(b.seenAt) - new Date(a.seenAt));
          return merged;
        });

        // notify user per match (opt-in)
        for (const lm of newlyMatched) {
          const matched = alerts.filter((a) => lm.matchedAlertIds.includes(a.id));
          maybeNotify(lm, matched);
        }
      }

      setStatus("idle");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  // start/stop polling
  useEffect(() => {
    if (isPolling) {
      // immediate poll and then interval
      pollOnce();
      pollingRef.current = setInterval(() => {
        pollOnce();
      }, pollIntervalMs);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPolling, alerts, pollIntervalMs]);

  // Derived: filtered + sorted matches
  const filteredListings = useMemo(() => {
    const q = query.trim();
    let arr = listings.filter((l) => {
      if (!q) return true;
      return (
        matchesText(l.title ?? "", q) ||
        matchesText(l.brand ?? "", q) ||
        matchesText(l.country ?? "", q) ||
        matchesText((l.matchedAlertNames || []).join(", "), q)
      );
    });
    if (sortBy === "price") {
      arr = arr.slice().sort((a, b) => (a.price || 0) - (b.price || 0));
    } else {
      arr = arr.slice().sort((a, b) => new Date(b.seenAt) - new Date(a.seenAt));
    }
    return arr;
  }, [listings, query, sortBy]);

  // Quick helpers to update settings
  async function toggleNotifications() {
    if (!("Notification" in window)) return alert("Browser does not support notifications.");
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    const enabled = Notification.permission === "granted";
    setNotificationsEnabled(enabled);
  }

  // small form for adding an alert
  function AlertForm({ onAdd }) {
    const [term, setTerm] = useState("");
    const [name, setName] = useState("");
    const [brand, setBrand] = useState("");
    const [size, setSize] = useState("");
    const [maxPrice, setMaxPrice] = useState("");
    const [condition, setCondition] = useState("");

    const submit = (e) => {
      e.preventDefault();
      if (!term && !brand) return alert("Bitte mindestens Suchbegriff oder Marke angeben.");
      onAdd({ name: name || term || brand, term, brand, size, maxPrice: maxPrice || null, condition });
      setTerm("");
      setName("");
      setBrand("");
      setSize("");
      setMaxPrice("");
      setCondition("");
    };

    return (
      <form onSubmit={submit} className="space-y-2 p-3 bg-white/60 backdrop-blur rounded-lg shadow-sm">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alert-Name (optional)" className="flex-1 input" />
          <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Max-Preis" className="w-28 input" />
        </div>
        <div className="flex gap-2">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Suchbegriff (z. B. &quot;jeans&quot;)" className="flex-1 input" />
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Marke" className="w-36 input" />
        </div>
        <div className="flex gap-2">
          <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="Größe" className="w-28 input" />
          <input value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Zustand (z.B. Good)" className="flex-1 input" />
        </div>
        <div className="flex justify-end">
          <button type="submit" className="btn">Alert erstellen</button>
        </div>
      </form>
    );
  }

  // UI small components
  function IconBell({ className = "w-5 h-5" }) {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    );
  }

  // render
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Vinted Snipe-Bot — MVP</h1>
            <p className="text-sm text-slate-600">Alerts erstellen, speichern & Treffer live anzeigen. Keine Käufe, kein Scraping.</p>
          </div>

          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg shadow-sm">
              <IconBell />
              <label className="text-sm">Benachrichtigungen</label>
              <input type="checkbox" checked={notificationsEnabled} onChange={toggleNotifications} className="ml-2" />
            </div>

            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg shadow-sm">
              <label className="text-sm">Auto-Update</label>
              <button
                onClick={() => setIsPolling((s) => !s)}
                className={`px-3 py-1 rounded-md text-sm ${isPolling ? "bg-red-500 text-white" : "bg-green-600 text-white"}`}>
                {isPolling ? "Stop" : "Start"}
              </button>
            </div>
          </div>
        </header>

        <main className="grid md:grid-cols-3 gap-6">
          {/* Left: Alert creation & list */}
          <aside className="md:col-span-1 space-y-4">
            <section>
              <h2 className="font-medium mb-2">Neuen Alert erstellen</h2>
              <AlertForm
                onAdd={(a) => {
                  addAlert(a);
                }}
              />
            </section>

            <section className="bg-white rounded-lg shadow-sm p-3">
              <h3 className="font-medium mb-2">Gespeicherte Alerts</h3>
              {alerts.length === 0 ? (
                <p className="text-sm text-slate-500">Keine Alerts. Erstelle einen, um Treffer zu erhalten.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-slate-500">{a.term || "(kein Begriff)"} • {a.brand || "(alle Marken)"} • {a.size || "(alle Größen)"}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => removeAlert(a.id)} className="text-xs text-red-500">Löschen</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white rounded-lg shadow-sm p-3">
              <h3 className="font-medium mb-2">Einstellungen</h3>
              <div className="text-sm text-slate-600 space-y-2">
                <div>
                  <label className="block text-xs">Poll-Interval (ms)</label>
                  <input value={pollIntervalMs} onChange={(e) => setPollIntervalMs(Number(e.target.value) || 5000)} className="input w-full" />
                </div>
                <div>
                  <label className="block text-xs">Status</label>
                  <div className="text-sm text-slate-700">{status}</div>
                </div>
              </div>
            </section>
          </aside>

          {/* Right: Dashboard */}
          <section className="md:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex gap-3 w-full">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter Treffer (Titel, Marke, Land, Alert-Name)" className="flex-1 input" />

                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="input w-44">
                  <option value="newest">Neueste Treffer</option>
                  <option value="price">Günstigster Preis</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-3">
              <h3 className="font-medium mb-2">Trefferliste ({filteredListings.length})</h3>

              {filteredListings.length === 0 ? (
                <p className="text-sm text-slate-500">Keine Treffer — starte Auto-Update oder erstelle Alerts.</p>
              ) : (
                <div className="space-y-2">
                  {filteredListings.map((l) => (
                    <article key={l.id} className="p-3 rounded-md border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <a href={l.url} target="_blank" rel="noreferrer" className="font-semibold">{l.title}</a>
                          <div className="text-xs text-slate-500">{l.brand ? `${l.brand} • ` : ""}{l.size ? `Größe ${l.size} • ` : ""}{l.condition ? `${l.condition} • ` : ""}{l.country}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium text-lg">{l.price} {l.currency}</div>
                          <div className="text-xs text-slate-500">{new Date(l.seenAt).toLocaleString()}</div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                        <div>Alert(s): {l.matchedAlertNames?.join(", ")}</div>
                        <div className="flex gap-2 items-center">
                          <span className="px-2 py-1 text-[11px] bg-slate-100 rounded">{l.country}</span>
                          <a href={l.url} className="underline" target="_blank" rel="noreferrer">Ansehen</a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm p-3">
              <h3 className="font-medium mb-2">Kurzinfo</h3>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>Diese MVP ruft versucht, Live-Daten von Vinted zu verwenden. Lokale CORS-Beschränkungen können jedoch direkten Abruf verhindern; in diesem Fall verwendet die App Demo-Daten.</li>
                <li>Keine automatischen Käufe oder Bot-Aktionen — nur Alerts & Notifications.</li>
                <li>Die App speichert Alerts und Treffer im localStorage deines Browsers.</li>
              </ul>
            </div>
          </section>
        </main>

        <footer className="mt-6 text-center text-sm text-slate-500">
          <div>Made with ❤️ — minimal, responsiv & testbar. Drop this file into <code>src/App.jsx</code> of a Vite React + Tailwind project.</div>
        </footer>
      </div>

      {/* Tiny styles for inputs & buttons to keep Tailwind classes readable */}
      <style>{`
        .input{ padding:0.5rem 0.6rem; border-radius:0.5rem; border:1px solid rgba(148,163,184,0.2); background:white }
        .input:focus{ outline:none; box-shadow:0 0 0 3px rgba(99,102,241,0.12); }
        .btn{ background:#6366f1; color:white; padding:0.45rem 0.8rem; border-radius:0.5rem }
      `}</style>
    </div>
  );
}
