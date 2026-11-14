# Wiederverwendbares YouTube-Modul

Die ES-Module unter `src/shared/` können in anderen Node.js-Projekten verwendet
werden. Sie benötigen Node.js 22 oder neuer, aber keine npm-Abhängigkeiten.
Sie lesen weder `.env` noch Umgebungsvariablen, wählen keinen Standardkanal
und starten beim Import keine CLI oder Netzwerkzugriffe.

## Dateien übernehmen

Diese fünf Dateien zusammen und mit unveränderten relativen Pfaden übernehmen:

- `src/shared/fetch-youtube.mjs`: öffentlicher Einstieg, Quellenwahl und kombinierte Synchronisation.
- `src/shared/fetch-youtube-videos.mjs`: Video-Scraper und inkrementelle Video-Synchronisation.
- `src/shared/fetch-youtube-playlists.mjs`: Playlist-Scraper und inkrementelle Playlist-Synchronisation.
- `src/shared/youtube-data-api.mjs`: offizieller YouTube Data API v3-Client.
- `src/shared/archive-cache.mjs`: lokale JSON-Persistenz und Wartefunktion.

Es gibt keine Abhängigkeit von `src/fetch-channel/`, Website-Daten oder der
Verzeichnisstruktur dieses Projekts. Das Repository bleibt ein privates
Websiteprojekt; diese Extraktion veröffentlicht kein npm-Paket und vergibt
keine neue Lizenz.

## Videos und Playlists synchronisieren

```js
import { syncYoutube } from "./shared/fetch-youtube.mjs";

const result = await syncYoutube({
  channel: "@YourChannel",
  videosCacheFile: "./cache/videos.json",
  playlistsCacheFile: "./cache/playlists.json",
  // Optional: apiKey: yourApiKey,
  log: console.log,
});

console.log(result.videos.newVideoIds);
console.log(result.playlists); // null, wenn der vorhandene Playlist-Cache genügt
```

`channel` akzeptiert einen Handle, `@Handle` oder eine YouTube-URL mit `@Handle`.
Beide Cachepfade sind erforderlich und werden vor dem ersten Abruf geprüft.
Relative Pfade beziehen sich auf das Arbeitsverzeichnis des aufrufenden
Prozesses. Fehlende Verzeichnisse werden angelegt; JSON wird über eine temporäre
Datei und anschließendes Umbenennen geschrieben. Einen Cachepfad nicht von
mehreren Synchronisationsläufen gleichzeitig beschreiben lassen.

Ohne `apiKey` werden öffentliche YouTube-Seiten und Innertube verwendet.
Mit explizitem Key wird ausschließlich die offizielle API verwendet;
API-Fehler lösen keinen Wechsel zum Scraper aus. Der Key wird als HTTP-Header
übertragen. Die Bibliothek liest ihn nicht selbst aus der Umgebung.

Weitere gemeinsame Optionen sind `fetchImpl` (Standard: globales `fetch`),
`log` (Standard: `console.log`) und `sleep(milliseconds)` (Standard: Timer).
HTTP-429- und Serverfehler werden begrenzt mit Wartezeiten wiederholt;
Fehler werden an den Aufrufer weitergereicht.

Der kombinierte Lauf synchronisiert zuerst Videos. Ohne neue Videos und mit
vollständigem Playlist-Cache desselben Kanals entfällt der Playlistabruf.
Mit neuen Video-IDs und vollständigem Cache endet die gezielte Playlistsuche,
sobald alle neuen IDs gefunden wurden. Ohne vollständigen Cache werden alle
Playlists geladen. Ein fehlgeschlagener Videoabruf startet keine Playlists.

## Einzeln synchronisieren

```js
import {
  syncYoutubeVideos,
  syncYoutubePlaylists,
} from "./shared/fetch-youtube.mjs";

const videos = await syncYoutubeVideos({
  channel: "YourChannel",
  cacheFile: "./cache/videos.json",
});

const playlists = await syncYoutubePlaylists({
  channel: "YourChannel",
  cacheFile: "./cache/playlists.json",
  newVideoIds: videos.newVideoIds,
});
```

Jeder einzelne Lauf verlangt einen expliziten `cacheFile`. Ein Playlistlauf
aktualisiert ohne `newVideoIds` alle Playlists. `now: () => isoTimestamp` kann
für reproduzierbare Playlist-Prüfzeitstempel übergeben werden.

Das Videoergebnis enthält `channel`, `complete`, `fetchedAt`, `lastModified`,
`videos` sowie die nur im Rückgabewert vorhandenen Felder `newVideos` und
`newVideoIds`. Videos enthalten `id`, `title`, `description`, `duration`,
`durationSeconds` und `publishedAt`; private, ungelistete und bevorstehende
Videos werden nicht aufgenommen.

Das Playlistergebnis enthält `channel`, `complete`, `fetchedAt`, `lastModified`
und `playlists`. Jede Playlist enthält `id`, `title`, `description`, `url`,
`videoCount`, `videos`, `checkedAt` und `lastModified`. Mitglieder enthalten
`position`, `videoId`, `title` und `availability`. Reihenfolge und doppelte
Mitgliedschaften bleiben erhalten. Die API verbirgt private/gelöschte Einträge;
der Scraper kann vom öffentlichen Seiteninhalt als nicht verfügbar markierte
Einträge erhalten. Fehlgeschlagene Aktualisierungen behalten alte Daten,
markieren den Cache unvollständig und werfen einen Fehler.

## Ohne Dateisynchronisation abrufen

```js
import { createYoutubeSources } from "./shared/fetch-youtube.mjs";

const { videos, playlists } = createYoutubeSources({ /* apiKey optional */ });
const channel = await videos.channel("YourChannel");
for await (const ids of videos.playlistVideoIds(`UU${channel.id.slice(2)}`)) {
  const details = await videos.videos(ids);
  console.log(details); // Array mit Videodaten; nicht öffentliche Videos: null
}
const listing = await playlists.channelPlaylists("YourChannel");
for (const entry of listing.entries) {
  console.log(await playlists.playlist(entry));
}
```

`createYoutubeSources` liefert für beide Abrufwege dieselben Quellenverträge.
Die Videoquelle bietet `channel(handle)`, den asynchronen Seitengenerator
`playlistVideoIds(playlistId)` und `videos(ids)`. Die Playlistquelle bietet
`channelPlaylists(handle)` mit `{ channel, entries }`, `playlist(entry)` und
den asynchronen Generator `recentPlaylists(handle, oldById, channelId)`;
`oldById` ist dabei eine Map bereits bekannter Playlists mit `lastModified`.

Für eigene Quellen können die niedrigeren `syncYoutubeVideos`- und
`syncYoutubePlaylists`-Funktionen direkt aus den jeweiligen Einzelmodulen
importiert und mit `source` übergeben werden. Die Funktionen aus dem gemeinsamen
Einstieg erzeugen dagegen ihre Quellen selbst. Die Einzelmodule exportieren
auch `createYoutubeScraper` beziehungsweise `createPlaylistScraper` für
gezielten anonymen Zugriff.

## Integration dieses Projekts

`src/fetch-channel/` enthält weiterhin die ausführbaren CLI-Adapter, die
Standardcachepfade, API-Key-Auflösung und GitHub-Actions-Ausgaben. Bestehende
Importpfade und die npm-Befehle bleiben kompatibel. Tests für beide Ebenen
liegen unter `tests/fetch-channel/`; `youtube-shared.test.mjs` kopiert nur die
fünf Bibliotheksdateien in ein temporäres fremdes Projekt und prüft beide
Abrufwege einschließlich eines zweiten inkrementellen Laufs.
