export async function setupOffline(version, report) {
  const status = document.querySelector("#offline-status");
  const retry = document.querySelector("#offline-retry");
  const update = document.querySelector("#offline-update");
  const prefix = `pretty-old-pixel:app:${new URL("./", location.href).href}:`;
  const say = (message) => { status.textContent = message; };
  const fail = (error) => {
    console.error(error);
    say(`Offline-Speicherung nicht bereit: ${error.message}`);
    retry.hidden = false;
  };
  if (!("serviceWorker" in navigator)) {
    say("Dieser Browser unterstützt die Offline-Speicherung nicht. Die App ist nur online nutzbar.");
    const unsupported = () => report("Offline-Verwaltung wird von diesem Browser nicht unterstützt.");
    return { check: unsupported, persist: unsupported, clear: unsupported };
  }
  let registration;
  let activating = false;
  let checking = false;
  let updateFailed = false;
  let thumbnailsRequested = false;
  let requestId = 0;
  const statusRequests = new Map();
  async function requestStatus(worker, type = "STATUS") {
    const id = ++requestId;
    try {
      return await bounded(new Promise((resolve) => {
        statusRequests.set(id, resolve);
        worker.postMessage({ type, requestId: id });
      }));
    } finally { statusRequests.delete(id); }
  }
  async function bounded(promise) {
    let timer;
    try {
      return await Promise.race([promise, new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Zeitüberschreitung bei der Offline-Verwaltung. Bitte die Verbindung prüfen.")), 15000);
      })]);
    } finally { clearTimeout(timer); }
  }
  function askStatus() {
    navigator.serviceWorker.controller?.postMessage({ type: "STATUS" });
    navigator.serviceWorker.controller?.postMessage({ type: "CLIENT_VERSION", version });
  }
  function waiting() {
    if (!registration?.waiting) return;
    update.hidden = false;
    say("Ein vollständiges Update ist bereit. Zum Aktivieren neu starten.");
  }
  navigator.serviceWorker.addEventListener("message", ({ data }) => {
    if (data.type === "CLEARED") statusRequests.get(data.requestId)?.(data);
    if (data.type === "THUMBNAIL_ERROR") {
      say(`Vorschaubilder konnten nicht gespeichert werden: ${data.message}. Bitte Speicher und Verbindung prüfen.`);
      retry.hidden = false;
    }
    if (data.type === "THUMBNAILS") {
      say(`Katalog gespeichert · Vorschaubilder laden: ${data.completed}/${data.total}. Videos benötigen Internet.`);
      retry.hidden = data.completed === data.total;
    }
    if (data.type === "PROGRESS") say(`Offline-Daten laden: ${data.completed}/${data.total} Dateien (${(data.loadedBytes / 1e6).toFixed(1)}/${(data.totalBytes / 1e6).toFixed(1)} MB).`);
    if (data.type === "ERROR") fail(new Error(data.message));
    if (data.type === "DOWNLOADED") {
      say("Offline-Daten vollständig geladen; Aktivierung wird geprüft …");
      askStatus();
    }
    if (data.type === "STATUS") {
      statusRequests.get(data.requestId)?.(data);
      say(data.ready ? `Offline bereit · Datenstand ${data.version}${updateFailed ? " · Updateprüfung nicht erreichbar; lokaler Stand bleibt erhalten." : ""}` : "Offline-Daten fehlen oder sind unvollständig. Bitte mit Internet erneut laden.");
      const missingThumbnails = data.thumbnails && data.thumbnails.completed < data.thumbnails.total;
      if (data.ready && data.thumbnails?.total) say(`${status.textContent} · Vorschaubilder ${data.thumbnails.completed}/${data.thumbnails.total}${missingThumbnails ? " – mit Internet erneut versuchen." : ""}`);
      retry.hidden = data.ready && !missingThumbnails;
      if (data.ready && missingThumbnails && !checking && !thumbnailsRequested && navigator.onLine) {
        const worker = navigator.serviceWorker.controller;
        if (worker) {
          thumbnailsRequested = true;
          worker.postMessage({ type: "REPAIR" });
        }
      }
      waiting();
    }
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (activating) location.reload();
    else askStatus();
  });
  async function check() {
    if (checking) return;
    checking = true;
    updateFailed = false;
    retry.hidden = true;
    try {
      registration = await bounded(navigator.serviceWorker.getRegistration(new URL("./", location.href)));
      if (registration?.active) askStatus();
      if (!navigator.onLine && registration?.active) return;
      registration = await bounded(navigator.serviceWorker.register(new URL("sw.js", location.href), { updateViaCache: "none" }));
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed") {
            if (navigator.serviceWorker.controller) waiting();
            else say("Offline-Daten vollständig geladen.");
          }
          if (worker.state === "redundant") fail(new Error("Offline-Download wurde abgebrochen. Der vorherige Stand bleibt erhalten."));
        });
      });
      await bounded(registration.update());
      if (registration.active) {
        const state = await requestStatus(registration.active);
        if (!state.ready || (state.thumbnails && state.thumbnails.completed < state.thumbnails.total)) {
          thumbnailsRequested = true;
          registration.active.postMessage({ type: "REPAIR" });
        }
      }
      navigator.serviceWorker.controller?.postMessage({ type: "CLIENT_VERSION", version });
      waiting();
    } catch (error) {
      if (registration?.active && navigator.serviceWorker.controller) {
        console.warn("Updateprüfung nicht erreichbar; lokaler Stand wird geprüft.", error);
        updateFailed = true;
        askStatus();
      } else fail(error);
    } finally {
      checking = false;
    }
  }
  update.addEventListener("click", () => {
    activating = true;
    registration.waiting?.postMessage({ type: "ACTIVATE" });
  });
  retry.addEventListener("click", check);
  addEventListener("online", check);
  addEventListener("focus", askStatus);
  await check();
  return {
    check,
    async persist() {
      if (!navigator.storage?.persist) { report("Dauerhafte Speicherung wird von diesem Browser nicht angeboten."); return; }
      const granted = await navigator.storage.persist();
      report(granted ? "Dauerhafte Speicherung wurde erlaubt. Trotzdem ist eine Sicherung nicht garantiert." : "Dauerhafte Speicherung wurde nicht erlaubt. Die App bleibt offline nutzbar, solange die Daten vorhanden sind.");
    },
    async clear() {
      if (!confirm("Offline-Daten und App-Einstellungen löschen? Ohne Internet kann die App danach nicht erneut eingerichtet werden.")) return;
      const worker = registration?.active ?? navigator.serviceWorker.controller;
      if (worker) await requestStatus(worker, "CLEAR");
      await registration?.unregister();
      for (const key of await caches.keys()) if (key.startsWith(prefix)) await caches.delete(key);
      for (const key of ["theme", "player", "autonext"]) localStorage.removeItem(`pretty-old-pixel:app:${key}`);
      location.assign("../");
    },
  };
}
