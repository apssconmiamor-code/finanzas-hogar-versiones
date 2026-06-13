// =============================================
// SW REGISTER — pegar en app.js al inicio de window.onload
// =============================================

// ---- REGISTRO DEL SERVICE WORKER ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      console.info("SW registrado:", reg.scope);

      // Detecta nueva versión disponible
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            SyncManager.mostrarToast("🔄 Actualización disponible — recarga para aplicar");
          }
        });
      });
    } catch (err) {
      console.warn("SW no se pudo registrar:", err);
    }
  });
}
