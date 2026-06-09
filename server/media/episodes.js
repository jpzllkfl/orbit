import { getDb } from './db.js';

export function listShowSeasons(libraryId, showTitle) {
  const rows = getDb()
    .prepare(
      `SELECT season, COUNT(*) AS episodes
       FROM media_items
       WHERE library_id = ? AND show_title = ? AND season IS NOT NULL
       GROUP BY season
       ORDER BY season`,
    )
    .all(libraryId, showTitle);
  return rows.map((r) => ({
    season: r.season,
    title: `Season ${r.season}`,
    poster: null,
    episodes: r.episodes,
  }));
}

export function listShowEpisodes(libraryId, showTitle, season) {
  const rows = getDb()
    .prepare(
      `SELECT id, season, episode, title, file_path
       FROM media_items
       WHERE library_id = ? AND show_title = ? AND season = ?
       ORDER BY episode`,
    )
    .all(libraryId, showTitle, season);
  return rows.map((r) => ({
    id: r.id,
    season: r.season,
    episode: r.episode,
    title: r.title || `Episode ${r.episode}`,
    filePath: r.file_path,
  }));
}
