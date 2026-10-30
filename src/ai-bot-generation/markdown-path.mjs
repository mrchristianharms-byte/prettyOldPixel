export const markdownFile = (route) => route.endsWith("/") || !route
  ? `${route}index.md` : route.replace(/\.html$/u, ".md");
