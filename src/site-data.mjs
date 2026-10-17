import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { slugify } from "./site-config.mjs";
import { secondsToIsoDuration } from "./fetch-youtube-videos.mjs";
import { gameDefinitions } from "./data-games.mjs";
import { structureGameSeries } from "./site-game-series.mjs";
import { sectionDefinitions } from "./data-sections.mjs";
import { extractVideoDetails } from "./site-video-details.mjs";

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function object(value, label) {
  requireValue(value && typeof value === "object" && !Array.isArray(value), `${label}: Objekt erwartet.`);
}

function text(value, label) {
  requireValue(typeof value === "string" && value.trim().length > 0, `${label}: Text fehlt.`);
  return value.trim();
}

function optionalText(value, label) {
  requireValue(value === undefined || value === null || typeof value === "string", `${label}: Text erwartet.`);
  return value ?? "";
}

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

function publishedTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return null;
  const timestamp = Date.parse(value);
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Number.isFinite(timestamp) && month >= 1 && month <= 12 && day >= 1 && day <= days ? timestamp : null;
}

export function chronological(a, b) {
  if (a.publishedTime === null) return b.publishedTime === null ? a.id.localeCompare(b.id, "en") : 1;
  if (b.publishedTime === null) return -1;
  return a.publishedTime - b.publishedTime || a.id.localeCompare(b.id, "en");
}

export function newestFirst(a, b) {
  if (a.publishedTime === null || b.publishedTime === null) {
    return a.publishedTime === null ? (b.publishedTime === null ? a.id.localeCompare(b.id, "en") : 1) : -1;
  }
  return b.publishedTime - a.publishedTime || a.id.localeCompare(b.id, "en");
}

function archiveIdentity(archives) {
  const archive = archives.find((item) => item.match === "issue"
    && (item.readerUrl || item.downloadUrl || (item.provider === "reetroz" && item.pageUrl)));
  return archive ? `${archive.provider}:${archive.readerUrl ?? archive.downloadUrl ?? archive.pageUrl}` : null;
}

function issueOrder(a, b) {
  return Number(a.special) - Number(b.special)
    || (a.months[0] ?? a.number ?? Infinity) - (b.months[0] ?? b.number ?? Infinity)
    || (a.number ?? Infinity) - (b.number ?? Infinity)
    || a.label.localeCompare(b.label, "de")
    || (a.id ?? "").localeCompare(b.id ?? "", "en");
}

function finalizeMagazines(magazineById, videoById, warnings) {
  for (const magazine of magazineById.values()) {
    const issueCandidates = new Map();
    const entries = magazine.videos.map((videoId) => {
      const mention = videoById.get(videoId).magazines.find((item) => item.id === magazine.id);
      return { videoId, mention };
    });
    const archiveIssues = new Map();
    for (const { mention } of entries) {
      const key = archiveIdentity(mention.archives);
      if (key && mention.issue) {
        if (!archiveIssues.has(key)) archiveIssues.set(key, []);
        archiveIssues.get(key).push(mention.issue);
      }
    }
    for (const { videoId, mention } of entries) {
      mention.route = magazine.route;
      let issue = mention.issue;
      if (issue) {
        const archiveKey = archiveIdentity(mention.archives);
        const peers = archiveKey ? archiveIssues.get(archiveKey) ?? [] : [];
        // Nur derselbe eindeutige Archivtreffer darf fehlende Heftdaten ergänzen.
        const years = [...new Set(peers.map((item) => item.year).filter((year) => year !== null))];
        const monthSets = [...new Set(peers.filter((item) => item.months.length).map((item) => item.months.join(",")))];
        const numbers = [...new Set(peers.map((item) => item.number).filter((number) => number !== null))];
        issue = {
          ...issue,
          year: issue.year ?? (years.length === 1 ? years[0] : null),
          months: issue.months.length ? issue.months : (monthSets.length === 1 ? monthSets[0].split(",").map(Number) : []),
          number: issue.number ?? (numbers.length === 1 ? numbers[0] : null),
        };
        const conflict = years.length > 1 || monthSets.length > 1 || numbers.length > 1;
        if (conflict) warnings.push(`${magazine.name}/${videoId}: Widersprüchliche Heftdaten zum Archivtreffer; keine Ausgabenseite.`);
        const identifiable = !conflict && (issue.special
          ? Boolean(archiveKey || (issue.year !== null && issue.number !== null))
          : Boolean(issue.year !== null && (issue.months.length || issue.number !== null)));
        if (identifiable) {
          const identity = issue.special
            ? { special: true, ...(archiveKey ? { archive: archiveKey } : { year: issue.year, number: issue.number }) }
            : { year: issue.year, ...(issue.months.length ? { months: issue.months } : { number: issue.number }) };
          const id = `${issue.special && archiveKey ? "archiv" : issue.year ?? "unbekannt"}-${createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 12)}`;
          let entity = magazine.issues.get(id);
          if (!entity) {
            entity = { ...issue, id, route: null, videos: [], archives: [] };
            magazine.issues.set(id, entity);
            issueCandidates.set(id, []);
          }
          issueCandidates.get(id).push(issue);
          if (!entity.videos.includes(videoId)) entity.videos.push(videoId);
          for (const archive of mention.archives) {
            if (!entity.archives.some((item) => JSON.stringify(item) === JSON.stringify(archive))) entity.archives.push(archive);
          }
          mention.issue = entity;
        } else {
          mention.issue = { ...issue, id: null, route: null };
          warnings.push(`${magazine.name}/${videoId}: Ausgabe nicht eindeutig; verbleibt in der Übersicht.`);
        }
        mention.yearRoute = mention.issue.year === null ? null : `${magazine.route}${mention.issue.year}/`;
      }
    }
    for (const issue of magazine.issues.values()) {
      const candidates = issueCandidates.get(issue.id);
      const numbers = [...new Set(candidates.map((item) => item.number).filter((number) => number !== null))];
      issue.number = numbers.length === 1 ? numbers[0] : null;
      if (numbers.length > 1) warnings.push(`${magazine.name}/${issue.id}: Unterschiedliche Heftnummern; Nummer bleibt unbekannt.`);
      if (issue.special) {
        const label = candidates.map((item) => item.label).sort((a, b) => a.localeCompare(b, "de"))[0];
        const title = issue.archives.filter((archive) => archive.match === "issue" && typeof archive.title === "string" && archive.title.trim())
          .map((archive) => archive.title.trim()).sort((a, b) => a.localeCompare(b, "de"))[0];
        issue.label = title ? `${label} – ${title}` : label;
      } else {
        issue.label = `${issue.number !== null ? `#${issue.number} ` : ""}${issue.months.length ? `${issue.months.join("+")}/` : ""}${issue.year}`.trim();
      }
      const part = (id) => videoById.get(id).magazines.find((item) => item.id === magazine.id).part;
      const chronologicalVideos = [...issue.videos].sort((a, b) => chronological(videoById.get(a), videoById.get(b)));
      const numbered = chronologicalVideos.filter((id) => part(id) !== null)
        .sort((a, b) => part(a) - part(b) || chronological(videoById.get(a), videoById.get(b)));
      let numberedIndex = 0;
      // Unnummerierte Videos behalten ihren chronologischen Platz, statt etwa hinter Teil 2 zu rutschen.
      issue.videos = chronologicalVideos.map((id) => part(id) === null ? id : numbered[numberedIndex++]);
      issue.archives.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"));
    }
    const issuesBySlug = new Map();
    for (const issue of magazine.issues.values()) {
      const slug = slugify(`${magazine.name} ${issue.label}`);
      if (!issuesBySlug.has(slug)) issuesBySlug.set(slug, []);
      issuesBySlug.get(slug).push(issue);
    }
    const usedSlugs = new Set(issuesBySlug.keys());
    for (const [slug, issues] of issuesBySlug) {
      issues.sort((a, b) => a.id.localeCompare(b.id, "en"));
      let variant = 1;
      for (const issue of issues) {
        let routeSlug = slug;
        if (issues.length > 1) {
          do { routeSlug = `${slug}-variante-${variant++}`; } while (usedSlugs.has(routeSlug));
          usedSlugs.add(routeSlug);
        }
        issue.route = `${magazine.route}ausgaben/${routeSlug}/`;
      }
    }
    function compareEntries(a, b) {
      const ai = a.mention.issue;
      const bi = b.mention.issue;
      return (ai?.year ?? Infinity) - (bi?.year ?? Infinity)
        || (ai && bi ? issueOrder(ai, bi) : ai ? -1 : bi ? 1 : 0)
        || (ai?.id && ai.id === bi?.id ? ai.videos.indexOf(a.videoId) - ai.videos.indexOf(b.videoId) : 0)
        || chronological(videoById.get(a.videoId), videoById.get(b.videoId));
    }
    entries.sort(compareEntries);
    magazine.entries = entries;
    magazine.videos = entries.map((entry) => entry.videoId);
    magazine.years = [...new Set(entries.map((entry) => entry.mention.issue?.year).filter((year) => year !== null && year !== undefined))]
      .sort((a, b) => a - b)
      .map((year) => ({ year, route: `${magazine.route}${year}/`, entries: entries.filter((entry) => entry.mention.issue?.year === year) }));
    magazine.issues = new Map([...magazine.issues].sort(([, a], [, b]) =>
      (a.year ?? Infinity) - (b.year ?? Infinity) || issueOrder(a, b)));
  }
}

function normalizeGames(definitions, playlists, videoById, warnings) {
  requireValue(Array.isArray(definitions), "Spiele: Zuordnungsliste fehlt.");
  const playlistById = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const gameIds = new Set();
  const assignedPlaylists = new Set();
  const hasReviewedPlaylists = definitions.some((definition) => Array.isArray(definition?.playlistIds)
    && definition.playlistIds.some((id) => playlistById.has(id)));
  const games = [];
  for (const definition of definitions) {
    object(definition, "Spielzuordnung");
    const name = text(definition.name, "Spiel.name");
    const id = text(definition.id, `${name}.id`);
    requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) && id !== "seite" && !gameIds.has(id), `Ungültige oder doppelte Spiele-ID: ${id}`);
    gameIds.add(id);
    const release = definition.release ?? null;
    if (release !== null) {
      object(release, `${name}.release`);
      requireValue(Number.isInteger(release.year) && release.year >= 1950 && release.year <= 2200,
        `${name}: Ungültiges Erscheinungsjahr.`);
      requireValue(httpUrl(release.source), `${name}: Ungültige Quelle zum Erscheinungsjahr.`);
    }
    for (const field of ["playlistIds", "videoIds", "platforms", "aliases"]) {
      requireValue(Array.isArray(definition[field]) && definition[field].every((value) => typeof value === "string" && value.trim()),
        `${name}.${field}: Textliste erwartet.`);
      requireValue(new Set(definition[field]).size === definition[field].length, `${name}.${field}: Doppelte Zuordnung.`);
    }
    requireValue(definition.playlistIds.every((value) => /^[A-Za-z0-9_-]+$/u.test(value)), `${name}: Ungültige Playlist-ID.`);
    requireValue(definition.videoIds.every((value) => /^[A-Za-z0-9_-]{11}$/u.test(value)), `${name}: Ungültige Video-ID.`);
    const excluded = definition.excludedVideoIds ?? [];
    requireValue(Array.isArray(excluded) && excluded.every((value) => typeof value === "string" && /^[A-Za-z0-9_-]{11}$/u.test(value)),
      `${name}: Ungültige ausgeschlossene Video-ID.`);
    requireValue(!definition.videoIds.some((videoId) => excluded.includes(videoId)), `${name}: Widersprüchliche Videozuordnung.`);
    requireValue(definition.playlistIds.length > 0, `${name}: Bestätigte Quellplaylist fehlt.`);
    const sources = definition.playlistIds.flatMap((playlistId) => {
      requireValue(!assignedPlaylists.has(playlistId), `Playlist ${playlistId} ist mehreren Spielen zugeordnet.`);
      assignedPlaylists.add(playlistId);
      const playlist = playlistById.get(playlistId);
      if (!playlist && hasReviewedPlaylists) warnings.push(`${name}/${playlistId}: Bestätigte Quellplaylist fehlt im Cache.`);
      return playlist ? [playlist] : [];
    }).sort((a, b) => a.id.localeCompare(b.id, "en"));
    const members = new Set(sources.flatMap((playlist) => playlist.videos.map((video) => video.id)));
    for (const videoId of definition.videoIds) {
      if (videoById.has(videoId)) members.add(videoId);
      else if (sources.length) warnings.push(`${name}/${videoId}: Bestätigter Zusatzbeitrag fehlt im öffentlichen Katalog.`);
    }
    for (const videoId of excluded) members.delete(videoId);
    const isReminder = (video) => /\bre\.minder\b/iu.test(video.title);
    if ([...members].filter((videoId) => !isReminder(videoById.get(videoId))).length < 2) continue;
    const videos = [...members].map((videoId) => videoById.get(videoId)).sort(chronological);
    if (release === null) warnings.push(`${name}: Erscheinungsjahr fehlt; wird als unbekannt angezeigt.`);
    const game = {
      id, name, route: `spiele/${id}/`, platforms: [...definition.platforms].sort(), aliases: [...definition.aliases].sort(),
      releaseYear: release?.year ?? null, releaseYearSource: release === null ? null : httpUrl(release.source),
      videos: videos.map((video) => video.id),
      playlists: sources.map((playlist) => ({ id: playlist.id, title: playlist.title, url: `https://www.youtube.com/playlist?list=${playlist.id}` })),
    };
    game.series = structureGameSeries(videos, sources, [game.name, ...game.aliases]);
    for (const video of videos) video.games.push({ id, name, route: game.route });
    games.push(game);
  }
  for (const playlist of playlists) {
    if (!assignedPlaylists.has(playlist.id) && /^\s*re\.(?:play|connect)\b/iu.test(playlist.title)) {
      warnings.push(`${playlist.id}: Spielzuordnung nicht bestätigt (${playlist.title.replace(/\s+/gu, " ")}); keine Spieleseite.`);
    }
  }
  return games.sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id, "en"));
}

function normalizeSections(definitions, videoById, playlists, warnings) {
  requireValue(Array.isArray(definitions), "Bereichszuordnungen: Liste erwartet.");
  const sections = [];
  const ids = new Set();
  for (const definition of definitions) {
    object(definition, "Bereich");
    const { id, name, description, videos, playlistIds, excludedVideoIds } = definition;
    requireValue(["hardware", "retrospektiven", "interviews"].includes(id) && !ids.has(id), `Ungültiger oder doppelter Bereich: ${id}`);
    ids.add(id);
    text(name, `${id}: Name`);
    text(description, `${id}: Beschreibung`);
    for (const [key, values] of [["playlistIds", playlistIds], ["excludedVideoIds", excludedVideoIds]]) {
      requireValue(Array.isArray(values) && values.every((value) => typeof value === "string"
        && (key === "playlistIds" ? /^[A-Za-z0-9_-]+$/u : /^[A-Za-z0-9_-]{11}$/u).test(value))
        && new Set(values).size === values.length, `${id}: Ungültige ${key}.`);
    }
    requireValue(Array.isArray(videos), `${id}: Videoliste fehlt.`);
    const assignedIds = new Set();
    const entries = [];
    const sources = playlists.filter((playlist) => playlistIds.includes(playlist.id));
    for (const assignment of videos) {
      object(assignment, `${id}: Zuordnung`);
      requireValue(typeof assignment.id === "string" && /^[A-Za-z0-9_-]{11}$/u.test(assignment.id)
        && !assignedIds.has(assignment.id) && !excludedVideoIds.includes(assignment.id), `${id}: Ungültige oder doppelte Videozuordnung.`);
      assignedIds.add(assignment.id);
      text(assignment.topic, `${id}/${assignment.id}: Thema`);
      optionalText(assignment.note, `${id}/${assignment.id}: Hinweis`);
      if (id === "retrospektiven") requireValue(Number.isInteger(assignment.order) && assignment.order >= 0, `${id}: Folgenreihenfolge fehlt.`);
      requireValue(assignment.people === undefined || (Array.isArray(assignment.people)
        && assignment.people.every((person) => typeof person === "string" && person.trim())), `${id}: Ungültige Gesprächspersonen.`);
      if (id === "interviews") requireValue(assignment.people?.length > 0, `${id}: Gesprächsperson fehlt.`);
      const video = videoById.get(assignment.id);
      if (!video) {
        if (sources.length) warnings.push(`${id}/${assignment.id}: Bestätigter Bereichsbeitrag fehlt im öffentlichen Katalog; ausgelassen.`);
        continue;
      }
      entries.push({
        videoId: video.id, topic: assignment.topic, people: [...(assignment.people ?? [])],
        order: assignment.order ?? null, note: assignment.note ?? "",
      });
    }
    const candidatePattern = {
      hardware: /\bre\.ware\b|\bHardware\b/iu,
      retrospektiven: /\bre\.trospektive\b/iu,
      interviews: /\bInterview\b|\bTalk\b/iu,
    }[id];
    const candidates = new Set([
      ...sources.flatMap((source) => source.videos.map((video) => video.id)),
      ...[...videoById.values()].filter((video) => candidatePattern.test(video.title)).map((video) => video.id),
    ]);
    for (const videoId of [...candidates].sort()) {
      if (!assignedIds.has(videoId) && !excludedVideoIds.includes(videoId)) {
        warnings.push(`${id}/${videoId}: Neuer Kandidat ist noch nicht fachlich geprüft; keine automatische Bereichszuordnung.`);
      }
    }
    if (!entries.length) continue;
    entries.sort((a, b) => id === "retrospektiven"
      ? a.order - b.order || a.topic.localeCompare(b.topic, "de") || a.videoId.localeCompare(b.videoId, "en")
      : newestFirst(videoById.get(a.videoId), videoById.get(b.videoId)));
    if (id === "retrospektiven") {
      const groups = new Map();
      for (const entry of entries) {
        if (!groups.has(entry.topic)) groups.set(entry.topic, []);
        groups.get(entry.topic).push(entry);
      }
      entries.splice(0, entries.length, ...[...groups.values()].flat());
    }
    const section = { id, name, description, route: `${id}/`, entries };
    for (const entry of entries) videoById.get(entry.videoId).sections.push({ id, name, route: section.route });
    sections.push(section);
  }
  return sections.sort((a, b) => ["hardware", "retrospektiven", "interviews"].indexOf(a.id) - ["hardware", "retrospektiven", "interviews"].indexOf(b.id));
}

export function normalizeSources({ videos: videoCache, playlists: playlistCache, magazines: magazineCache }, { now = Date.now(), games: definitions = gameDefinitions, sections: sectionAssignments = sectionDefinitions } = {}) {
  requireValue(Number.isFinite(now), "Ungültiger Vergleichszeitpunkt.");
  for (const [name, cache] of [["Videos", videoCache], ["Playlists", playlistCache], ["Blätterabend", magazineCache]]) {
    object(cache, name);
    object(cache.channel, `${name}.channel`);
    text(cache.channel.id, `${name}.channel.id`);
    if (name !== "Blätterabend") requireValue(cache.complete === true, `${name}: Cache ist nicht vollständig.`);
  }
  requireValue(videoCache.channel.id === playlistCache.channel.id && videoCache.channel.id === magazineCache.channel.id, "Die Caches gehören nicht zum selben YouTube-Kanal.");
  requireValue(Array.isArray(videoCache.videos), "Videos: Liste fehlt.");
  requireValue(Array.isArray(playlistCache.playlists), "Playlists: Liste fehlt.");
  requireValue(Array.isArray(magazineCache.videos), "Blätterabend: Liste fehlt.");
  const warnings = [];
  const videos = [];
  const videoById = new Map();
  const sourceIds = new Set();
  for (const raw of videoCache.videos) {
    object(raw, "Video");
    requireValue(typeof raw.id === "string" && /^[A-Za-z0-9_-]{11}$/u.test(raw.id), `Ungültige Video-ID: ${raw.id}`);
    requireValue(!sourceIds.has(raw.id), `Doppelte Video-ID: ${raw.id}`);
    sourceIds.add(raw.id);
    const title = text(raw.title, `${raw.id}.title`);
    const description = optionalText(raw.description, `${raw.id}.description`).replace(/\r\n?/gu, "\n");
    const timestamp = publishedTime(raw.publishedAt);
    if (timestamp === null) warnings.push(`${raw.id}: Veröffentlichungsdatum fehlt/ist ungültig; nicht in den News.`);
    if (timestamp !== null && timestamp > now) {
      warnings.push(`${raw.id}: Noch nicht veröffentlicht; keine öffentliche Seite.`);
      continue;
    }
    const seconds = raw.durationSeconds;
    requireValue(seconds === undefined || seconds === null || (Number.isInteger(seconds) && seconds >= 0), `${raw.id}: Ungültige Videolänge.`);
    const video = {
      id: raw.id, title, description,
      url: `https://www.youtube.com/watch?v=${raw.id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${raw.id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${raw.id}/mqdefault.jpg`,
      publishedTime: timestamp,
      publishedAt: timestamp === null ? null : new Date(timestamp).toISOString(),
      durationSeconds: seconds ?? null,
      duration: seconds === undefined || seconds === null ? null : secondsToIsoDuration(seconds),
      playlists: [], magazines: [], games: [], sections: [], blaetterabend: false,
    };
    Object.assign(video, extractVideoDetails(video, videoCache.channel));
    videos.push(video);
    videoById.set(video.id, video);
  }
  requireValue(videos.length > 0, "Keine veröffentlichbaren Videos im Cache.");

  const playlists = [];
  const playlistIds = new Set();
  for (const raw of playlistCache.playlists) {
    object(raw, "Playlist");
    const id = text(raw.id, "Playlist.id");
    requireValue(/^[A-Za-z0-9_-]+$/u.test(id) && !playlistIds.has(id), `Ungültige oder doppelte Playlist-ID: ${id}`);
    playlistIds.add(id);
    const title = text(raw.title, `${id}.title`);
    requireValue(Array.isArray(raw.videos), `${id}: Mitgliederliste fehlt.`);
    const members = [];
    const linked = new Set();
    const playlist = { id, title, description: optionalText(raw.description, `${id}.description`), members, videos: [] };
    for (const member of raw.videos) {
      object(member, `${id}: Mitglied`);
      requireValue(typeof member.videoId === "string" && /^[A-Za-z0-9_-]{11}$/u.test(member.videoId), `${id}: Ungültige Mitglieds-ID.`);
      requireValue(Number.isInteger(member.position) && member.position > 0, `${id}: Ungültige Quellposition.`);
      requireValue(["listed", "unavailable"].includes(member.availability), `${id}: Unbekannte Verfügbarkeit.`);
      const video = videoById.get(member.videoId);
      members.push({ ...member, resolved: Boolean(video) && member.availability === "listed" });
      if (!video || member.availability === "unavailable") {
        warnings.push(`${id}/${member.videoId}: Playlist-Eintrag fehlt im öffentlichen Katalog oder ist nicht verfügbar.`);
      } else if (!linked.has(video.id)) {
        linked.add(video.id);
        playlist.videos.push(video);
        video.playlists.push({ id, title, source: "youtube-playlists" });
      }
    }
    playlist.videos.sort(chronological);
    playlists.push(playlist);
  }

  const magazineById = new Map();
  const extractedIds = new Set();
  for (const raw of magazineCache.videos) {
    object(raw, "Blätterabend-Video");
    requireValue(typeof raw.id === "string" && /^[A-Za-z0-9_-]{11}$/u.test(raw.id), "Blätterabend: Ungültige Video-ID.");
    requireValue(!extractedIds.has(raw.id), `Blätterabend: Doppelte Video-ID ${raw.id}`);
    extractedIds.add(raw.id);
    requireValue(Array.isArray(raw.magazines), `${raw.id}: Zeitschriftenliste fehlt.`);
    const video = videoById.get(raw.id);
    if (!video) {
      warnings.push(`${raw.id}: Blätterabend-Eintrag ohne veröffentlichtes Video; ausgelassen.`);
      continue;
    }
    video.blaetterabend = true;
    if (!raw.magazines.length) warnings.push(`${raw.id}: Zeitschrift ungeklärt; Video bleibt in der Blätterabend-Übersicht.`);
    requireValue(raw.part === undefined || raw.part === null || (Number.isInteger(raw.part) && raw.part > 0), `${raw.id}: Ungültiger Videoteil.`);
    for (const mention of raw.magazines) {
      object(mention, `${raw.id}: Zeitschrift`);
      const name = text(mention.name, `${raw.id}: Zeitschriftenname`);
      const id = slugify(name);
      requireValue(id.length > 0, `Kein stabiler Zeitschriften-Slug für ${name}.`);
      requireValue(id !== "seite", `Reservierter Zeitschriften-Slug: ${id}`);
      requireValue(!video.magazines.some((item) => item.id === id), `${raw.id}: Doppelte Zeitschrift ${name}.`);
      let magazine = magazineById.get(id);
      requireValue(!magazine || magazine.name === name, `Kollidierende Zeitschriftennamen: ${name} / ${magazine?.name}`);
      if (!magazine) {
        magazine = { id, name, route: `zeitschriften/${id}/`, videos: [], issues: new Map() };
        magazineById.set(id, magazine);
      }
      if (!magazine.videos.includes(video.id)) magazine.videos.push(video.id);
      let issue = null;
      if (mention.issue !== null && mention.issue !== undefined) {
        object(mention.issue, `${name}: Ausgabe`);
        const data = mention.issue;
        const label = text(data.label, `${name}: Ausgabenbezeichnung`);
        requireValue(data.year === null || (Number.isInteger(data.year) && data.year >= 1800 && data.year <= 2200), `${name}: Ungültiger Jahrgang.`);
        requireValue(data.number === null || (Number.isInteger(data.number) && data.number > 0), `${name}: Ungültige Heftnummer.`);
        requireValue(Array.isArray(data.months) && data.months.every((month) => Number.isInteger(month) && month >= 1 && month <= 12), `${name}: Ungültige Ausgabenmonate.`);
        requireValue(typeof data.special === "boolean", `${name}: Sonderheftkennzeichen fehlt.`);
        issue = { year: data.year, number: data.number, months: [...new Set(data.months)].sort((a, b) => a - b), special: data.special, label };
      }
      const archives = [];
      for (const provider of ["kultmags", "reetroz"]) {
        const archive = mention[provider];
        if (archive === null || archive === undefined) continue;
        object(archive, `${name}: ${provider}`);
        requireValue(["issue", "folder", "magazine"].includes(archive.match), `${name}: Unbekannter Archivtreffertyp.`);
        const links = {};
        for (const key of ["pageUrl", "readerUrl", "downloadUrl"]) {
          if (archive[key] === null || archive[key] === undefined) continue;
          const url = httpUrl(archive[key]);
          requireValue(url, `${name}: Ungültiger Archivlink ${provider}.${key}`);
          links[key] = url;
        }
        archives.push({ provider, match: archive.match, title: archive.title, ...links });
      }
      video.magazines.push({ id, name, issue, archives, part: raw.part ?? null, source: "blaetterabend-videos" });
      if (!issue) warnings.push(`${name}/${raw.id}: Ausgabe unbekannt; Video bleibt auf der Zeitschriftenseite.`);
    }
  }
  finalizeMagazines(magazineById, videoById, warnings);
  const games = normalizeGames(definitions, playlists, videoById, warnings);
  const sections = normalizeSections(sectionAssignments, videoById, playlists, warnings);
  for (const video of videos) {
    video.magazines.sort((a, b) => a.id.localeCompare(b.id, "en"));
    video.playlists.sort((a, b) => a.id.localeCompare(b.id, "en"));
    video.games.sort((a, b) => a.id.localeCompare(b.id, "en"));
    video.sections.sort((a, b) => a.id.localeCompare(b.id, "en"));
  }
  videos.sort(newestFirst);
  return {
    channel: { id: videoCache.channel.id, title: text(videoCache.channel.title, "channel.title") },
    videos, videoById, playlists, games, sections,
    magazines: [...magazineById.values()].sort((a, b) => a.name.localeCompare(b.name, "de")),
    unresolvedMagazines: videos.filter((video) => video.blaetterabend && !video.magazines.length),
    news: videos.filter((video) => video.publishedTime !== null).slice(0, 20),
    warnings,
  };
}

export async function loadSiteData(cacheDirectory, options) {
  const [videos, playlists, magazines] = await Promise.all(
    ["youtube-videos.json", "youtube-playlists.json", "blaetterabend-videos.json"].map(async (name) => {
      const file = path.join(cacheDirectory, name);
      try {
        return JSON.parse(await readFile(file, "utf8"));
      } catch (error) {
        throw new Error(`Quelldatei kann nicht gelesen werden: ${file}: ${error.message}`, { cause: error });
      }
    }),
  );
  return normalizeSources({ videos, playlists, magazines }, options);
}
