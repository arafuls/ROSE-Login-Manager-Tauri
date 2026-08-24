/** Tauri command bindings for the News panel. */

import { invoke } from "@tauri-apps/api/core";
import type { NewsItem } from "./types";

/** Fetches the latest ROSE Online news articles. */
export async function newsFetch(): Promise<NewsItem[]> {
  return await invoke("news_fetch");
}
