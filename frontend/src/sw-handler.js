// Registers service worker and handles updates cleanly
import { registerSW } from "virtual:pwa-register";

const updateSW = registerSW({
  // Check for updates every 60 seconds
  onRegisteredSW(swUrl, r) {
    r && setInterval(async () => {
      if (!(!r.installing && navigator)) return;
      if (("connection" in navigator) && !navigator.onLine) return;
      const resp = await fetch(swUrl, { cache: "no-store", headers: { "cache": "no-store", "cache-control": "no-cache" } });
      if (resp?.status === 200) await r.update();
    }, 60 * 1000);
  },
  // New version available — reload automatically
  onNeedRefresh() {
    updateSW(true); // auto-reload, no prompt
  },
  // App is fully offline-ready
  onOfflineReady() {
    console.log("BusTrack ready to work offline");
  },
  immediate: true,
});
