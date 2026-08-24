import { invoke } from "@tauri-apps/api/core";
import type { NewsItem } from "./types";

export async function newsFetch(): Promise<NewsItem[]> {
  return await invoke("news_fetch");
}
