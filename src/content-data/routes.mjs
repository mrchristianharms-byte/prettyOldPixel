export const yearAnchor = (year) => `jahr-${year ?? "unbekannt"}`;

export function slugify(name) {
  return name.toLowerCase().replaceAll("ß", "ss").normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}
