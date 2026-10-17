import { paginatedRoute } from "../site-config.mjs";

export function pagination(baseRoute, page, pageCount, config) {
  if (pageCount < 2) return "";
  return `<nav class="pagination" aria-label="Übersichtsseiten">
${page > 1 ? `<a href="${config.href(paginatedRoute(baseRoute, page - 1))}" rel="prev">← Vorherige Seite</a>` : ""}
<span aria-current="page">Seite ${page} von ${pageCount}</span>
${page < pageCount ? `<a href="${config.href(paginatedRoute(baseRoute, page + 1))}" rel="next">Nächste Seite →</a>` : ""}
</nav><details><summary>Alle Übersichtsseiten</summary><ol class="page-list">${Array.from({ length: pageCount }, (_, index) => `<li><a href="${config.href(paginatedRoute(baseRoute, index + 1))}"${page === index + 1 ? ' aria-current="page"' : ""}>Seite ${index + 1}</a></li>`).join("")}</ol></details>`;
}
