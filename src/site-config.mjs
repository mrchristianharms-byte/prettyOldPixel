import path from "node:path";

export const productionUrl = "https://mrchristianharms-byte.github.io/prettyOldPixel/";

export function createSiteConfig(baseUrl = productionUrl) {
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new Error("Die Website-Basis muss eine HTTP(S)-URL ohne Zugangsdaten, Query oder Fragment sein.");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  const basePath = url.pathname;
  function checkRoute(route) {
    if (route.startsWith("/") || route.includes("..") || /[?:#\\]/u.test(route)) {
      throw new Error(`Ungültiger relativer Seitenpfad: ${route}`);
    }
  }
  function href(route = "", fromRoute = "") {
    checkRoute(route);
    checkRoute(fromRoute);
    const directory = fromRoute.endsWith("/") ? fromRoute : path.posix.dirname(fromRoute);
    const relative = path.posix.relative(directory || ".", route || ".");
    return relative ? `${relative}${route.endsWith("/") || !route ? "/" : ""}` : "./";
  }
  const config = {
    name: "Pretty Old Pixel",
    baseUrl: url.href,
    basePath,
    pageSize: 50,
    href,
    absolute: (route = "") => {
      checkRoute(route);
      return new URL(route, url).href;
    },
    forPage(route) {
      checkRoute(route);
      return { ...this, href: (target = "") => href(target, route) };
    },
  };
  return config;
}

export const paginatedRoute = (route, page) => page === 1 ? route : `${route}seite/${page}/`;

export function slugify(name) {
  return name.toLowerCase().replaceAll("ß", "ss").normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}
