import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// In development: de-registra ogni Service Worker e pulisce le cache CacheStorage.
// Motivo: se l'utente ha installato la PWA in produzione (o da un vecchio build)
// il Service Worker resta registrato e continua a servire l'app dalla cache
// anche quando il dev server è spento. In sviluppo vogliamo sempre vedere
// lo stato reale del backend — nessuna cache che maschera errori o sessioni.
if (import.meta.env.DEV && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) reg.unregister();
  });
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

createRoot(document.getElementById("root")!).render(<App />);
