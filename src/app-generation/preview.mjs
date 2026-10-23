export const offlinePreview = new URL("../assets/offline-preview.svg", import.meta.url).href;

export function updatePreview(image, onlineUrl) {
  image.onerror = () => {
    image.onerror = null;
    image.src = offlinePreview;
    image.alt = "Vorschaubild nicht lokal gespeichert oder nicht erreichbar.";
  };
  image.src = onlineUrl;
}
