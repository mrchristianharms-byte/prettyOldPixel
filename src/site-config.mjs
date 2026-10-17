export const productionUrl = "https://mrchristianharms-byte.github.io/prettyOldPixel/";

export function createSiteConfig(baseUrl = productionUrl) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new Error("Die Website-Basis muss eine HTTP(S)-URL ohne Zugangsdaten, Query oder Fragment sein.");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  const basePath = url.pathname;
  function href(route = "") {
    if (route.startsWith("/") || route.includes("..") || /[?#\\]/u.test(route)) {
      throw new Error(`Ungültiger relativer Seitenpfad: ${route}`);
    }
    return `${basePath}${route}`;
  }
  return {
    name: "Pretty Old Pixel",
    baseUrl: url.href,
    basePath,
    pageSize: 50,
    href,
    absolute: (route = "") => new URL(href(route), url.origin).href,
  };
}

export const catalogRoute = (page) => page === 1 ? "videos/" : `videos/seite/${page}/`;
export const paginatedRoute = (route, page) => page === 1 ? route : `${route}seite/${page}/`;

export function slugify(name) {
  return name.toLowerCase().replaceAll("ß", "ss").normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}
