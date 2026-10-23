export function httpUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}
