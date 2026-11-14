export const baselineWidgetCount = 15;

// This registry describes rendering widgets; css-budget.mjs itself is not a widget.
export const widgetCssRules = [
  { file: "archive-links.mjs", selectors: [".archive-links", ".archive-icon", ".archive-icon-labelled"] },
  { file: "catalog-grid.mjs", selectors: [".catalog-grid"] },
  { file: "episode-list.mjs", selectors: [".episode-menu", ".episode-playlists", "[data-video-link][aria-current]"] },
  { file: "game-discussions.mjs", selectors: [".meta"] },
  { file: "game-statistics.mjs", selectors: [".statistics-chart", ".statistics-chart-scroll", ".statistics-table-scroll", ".statistics-table"] },
  { file: "game-table.mjs", selectors: [".game-table", ".game-table-links", ".game-table-company", ".game-table-toolbar", ".game-table-summary", ".game-table-sort", ".game-table-controls"] },
  { file: "magazine-logo.mjs", selectors: [".magazine-logo"] },
  { file: "metadata.mjs", selectors: [".detail-meta"] },
  { file: "navigation.mjs", selectors: [".navigation-menu", ".navigation-control", ".game-page-navigation"] },
  { file: "pagination.mjs", selectors: [".pagination", ".page-list"] },
  { file: "process-diagram.mjs", selectors: [] }, // Its styles are embedded in the SVG, not site.css.
  { file: "theme-toggle.mjs", selectors: [".theme-toggle", ".theme-moon", ".theme-sun"] },
  { file: "video-entry.mjs", selectors: [".video-list", ".video-entry-thumbnail", ".video-entry-content", ".topics", ".meta"] },
  { file: "video-panel.mjs", selectors: ["[data-video-panel]", "[data-video-panel][hidden]", ".description", ".topics", ".meta"] },
  { file: "video.mjs", selectors: [".detail-player", ".video-player", ".player-toolbar", ".player-controls", ".player-setting", ".player-title", ".meta", ".archive-icon"] },
];

// Page composition and shared helpers emitted outside the rendering widgets.
export const sharedLayoutRules = [
  ":root", "body", "h1", "h2", "h3", "h4", "h5", "h6", ":focus-visible",
  ".container", ".site-header", ".brand", ".brand-logo", ".site-footer",
  ".visually-hidden", ".skip-link", ".breadcrumbs", ".breadcrumb-separator", ".meta",
  ".lead", ".home-statistics", ".stats-grid", ".stat-note", ".theme-grid", ".theme-count",
  ".theme-ranking", ".theme-ranking-entry", ".release-table", ".release-country",
  ".game-info", ".year-list", ".magazine-calendar-scroll", ".magazine-calendar",
  ".magazine-calendar-mobile", ".game-catalog", ".issue-group", ".video-panels",
  ".detail-page", ".detail-layout", ".detail-main", ".detail-heading", ".detail-information",
];

export function calculateCssGzipBudget(widgets) {
  return 12 * 1024 + (widgets.length - baselineWidgetCount) * 1024;
}

export const cssGzipBudget = calculateCssGzipBudget(widgetCssRules);
