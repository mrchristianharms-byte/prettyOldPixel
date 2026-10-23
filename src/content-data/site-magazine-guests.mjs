import { createHash } from "node:crypto";
import { slugify } from "./routes.mjs";
import { magazineGuestChannels } from "../data/data-magazine-guest-channels.mjs";

export function extractMagazineGuests(title) {
  const match = /\bmit\s+(.+)$/iu.exec(title);
  if (!match) return [];
  const clause = match[1].replace(/\s+[-–—]\s+(?=@)/gu, " ")
    .split(/\s+[-–—|]\s*|\s+(?:und|in)\s+(?:dem|der|den)\s+/iu)[0].trim();
  if (/^(?:chat(?:[- ]vote)?|ab\b)/iu.test(clause)) return [];
  const guests = new Map();
  for (const part of clause.split(/\s+(?:und|&)\s+|,\s+(?=@)/iu)) {
    const handle = /^(?:[\p{L}\p{M}.'’ -]+\s+)?(@[\p{L}\p{M}\p{N}_.-]+)/u.exec(part);
    const name = (handle?.[0] ?? part).trim().replace(/\s+/gu, " ");
    if (!name || (!handle && !/^\p{Lu}[\p{L}\p{M} .,'’()-]*$/u.test(name))) continue;
    const key = (handle?.[1] ?? name).normalize("NFC").toLowerCase();
    guests.set(key, { key, name });
  }
  return [...guests.values()];
}

export function magazineGuests(videos, magazines) {
  const byKey = new Map();
  for (const video of videos.filter((item) => item.blaetterabend)) {
    for (const { key, name } of extractMagazineGuests(video.title)) {
      if (!byKey.has(key)) byKey.set(key, { key, names: new Set(), videoIds: new Set() });
      const guest = byKey.get(key);
      guest.names.add(name);
      guest.videoIds.add(video.id);
    }
  }
  const aliases = new Map();
  for (const guest of byKey.values()) {
    const channel = magazineGuestChannels[guest.key];
    const names = new Set([guest.key, ...guest.names,
      ...(channel ? [new URL(channel).pathname.slice(1)] : [])]);
    for (const name of names) {
      const alias = name.replace(/^@/u, "").normalize("NFC").toLowerCase();
      if (!aliases.has(alias)) aliases.set(alias, new Set());
      aliases.get(alias).add(guest);
    }
  }
  const unassigned = videos.filter((item) => item.blaetterabend
    && extractMagazineGuests(item.title).length === 0);
  for (const [alias, owners] of aliases) {
    if (owners.size !== 1) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_.@-])@?${escaped}(?![\\p{L}\\p{M}\\p{N}_.-])`, "iu");
    const [guest] = owners;
    for (const video of unassigned) {
      if (pattern.test(video.title.normalize("NFC"))) guest.videoIds.add(video.id);
    }
  }
  const guests = [...byKey.values()].map((guest) => {
    const name = [...guest.names].sort((a, b) => b.length - a.length || a.localeCompare(b, "de"))[0];
    const entries = magazines.flatMap((magazine) => magazine.entries.filter((entry) => guest.videoIds.has(entry.videoId)));
    for (const video of videos.filter((item) => guest.videoIds.has(item.id) && !item.magazines.length)) {
      entries.push({ videoId: video.id, mention: { name: "Zeitschrift ungeklärt", archives: [] } });
    }
    entries.sort((a, b) => (b.mention.issue?.year ?? -Infinity) - (a.mention.issue?.year ?? -Infinity)
      || a.mention.name.localeCompare(b.mention.name, "de")
      || a.videoId.localeCompare(b.videoId, "en"));
    return {
      key: guest.key, name, entries, videoIds: [...guest.videoIds].sort(),
      channelUrl: magazineGuestChannels[guest.key] ?? null,
      issueCount: new Set(entries.map((entry) => entry.mention.issue?.route).filter(Boolean)).size,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "de") || a.key.localeCompare(b.key, "en"));
  const slugs = guests.map((guest) => slugify(guest.key) || "gast");
  for (const [index, guest] of guests.entries()) {
    const slug = slugs[index];
    const suffix = slugs.filter((value) => value === slug).length > 1
      ? `-${createHash("sha256").update(guest.key).digest("hex").slice(0, 12)}` : "";
    guest.route = `zeitschriften/gaeste/${slug}${suffix}/`;
  }
  return guests;
}
