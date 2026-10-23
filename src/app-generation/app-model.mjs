import { extractVideoDetails } from "../content-data/site-video-details.mjs";
import { gameMetadataFilters } from "../content-data/game-filters.mjs";

export const schemaVersion = 1;

export function exportAppData(model, publicUrl) {
  return {
    schemaVersion, publicUrl, channel: model.channel,
    videos: model.videos.map(({ url, embedUrl, thumbnailUrl, duration, publishedTime, descriptionWithoutChapters, chapters, mentionedChannels, ...video }) => video),
    playlists: model.playlists.map(({ videos, ...playlist }) => ({ ...playlist, videos: videos.map((video) => video.id) })),
    games: model.games.map(({ metadata, ...game }) => ({
      ...game,
      metadata: {
        status: metadata?.status ?? "blocked",
        data: metadata?.status === "ready" ? {
          releaseYear: metadata.data.releaseYear, genres: metadata.data.genres,
          releases: metadata.data.releases, additionalReleases: metadata.data.additionalReleases,
          scope: metadata.data.scope, evidence: { sourceUrl: metadata.data.evidence.sourceUrl },
        } : null,
      },
    })),
    sections: model.sections, navigation: model.navigation,
    magazines: model.magazines.map(({ years, ...magazine }) => ({ ...magazine, issues: [...magazine.issues.values()] })),
    magazineGuests: model.magazineGuests,
    unresolvedMagazines: model.unresolvedMagazines.map((video) => video.id),
    news: model.news.map((video) => video.id),
    gameFilters: [...gameMetadataFilters(model.games)].flatMap(([field, entries]) =>
      [...entries.values()].map(({ games, ...entry }) => ({ ...entry, field, games: games.map((game) => game.id) }))),
  };
}

export function hydrateAppData(data) {
  if (data?.schemaVersion !== schemaVersion || !Array.isArray(data.videos)
    || !Array.isArray(data.games) || !Array.isArray(data.magazines)) {
    throw new Error("App-Daten haben ein unbekanntes oder unvollständiges Schema.");
  }
  const publicUrl = new URL(data.publicUrl);
  if (!["https:", "http:"].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password) {
    throw new Error("Ungültige öffentliche Website-Adresse.");
  }
  const videos = data.videos.map((source) => {
    if (!/^[A-Za-z0-9_-]{11}$/u.test(source.id)) throw new Error("Ungültige Video-ID in App-Daten.");
    const video = {
      ...source, publishedTime: source.publishedAt === null ? null : Date.parse(source.publishedAt),
      url: `https://www.youtube.com/watch?v=${source.id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${source.id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${source.id}/mqdefault.jpg`,
    };
    return Object.assign(video, extractVideoDetails(video, data.channel));
  });
  const videoById = new Map(videos.map((video) => [video.id, video]));
  if (videoById.size !== videos.length) throw new Error("Doppelte Video-ID in App-Daten.");
  const resolve = (id) => {
    const video = videoById.get(id);
    if (!video) throw new Error(`Fehlendes Video in App-Daten: ${id}`);
    return video;
  };
  const model = {
    ...data, videos, videoById,
    playlists: data.playlists.map((playlist) => ({ ...playlist, videos: playlist.videos.map(resolve) })),
    news: data.news.map(resolve), unresolvedMagazines: data.unresolvedMagazines.map(resolve),
  };
  for (const game of model.games) game.videos.forEach(resolve);
  for (const magazine of model.magazines) {
    magazine.videos.forEach(resolve);
    for (const issue of magazine.issues) issue.videos.forEach(resolve);
  }
  return model;
}
