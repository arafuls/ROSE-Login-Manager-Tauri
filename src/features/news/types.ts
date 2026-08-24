/** Mirrors src-tauri/src/models.rs's NewsItem. */
export interface NewsItem {
  category: string;
  excerpt: string;
  link: string;
  /** Already-formatted date text from the site itself (e.g. "May 31, 2026") - not a raw date to reparse. */
  published: string;
  thumbnail: string | null;
  title: string;
}
