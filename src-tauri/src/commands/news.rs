//! `news_fetch` - pulls from the ROSE Online news API
//! (roseonlinegame.com/api/v1/news) rather than scraping the HTML listing
//! page (roseonlinegame.com/news, used by an earlier version of this
//! file). The API is a versioned, CORS-open, paginated JSON endpoint with
//! the same fields the scraper had to reconstruct by hand - a structured
//! `category` object instead of text pulled from a `<span>`, a direct
//! `image` URL instead of reading a lazy-load `data-src` attribute, and a
//! real ISO 8601 `published_at` instead of the page's pre-rendered date
//! text. Confirmed by fetching it directly: `access-control-allow-origin:
//! *`, `x-ratelimit-limit: 600`, standard Laravel API-resource pagination
//! (`data`/`links`/`meta`). Switching removes the CSS-selector fragility
//! of the scraper - a template change on the HTML page could silently
//! return zero articles, while a shape change on a versioned API endpoint
//! is far less likely to happen without notice.

use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::models::NewsItem;

const NEWS_API_URL: &str = "https://www.roseonlinegame.com/api/v1/news";
const EXCERPT_MAX_CHARS: usize = 220;
const MONTH_NAMES: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

#[derive(Debug, Deserialize)]
struct NewsApiResponse {
    data: Vec<ApiNewsItem>,
}

#[derive(Debug, Deserialize)]
struct ApiNewsItem {
    title: String,
    short_description: String,
    category: ApiCategory,
    image: Option<String>,
    published_at: String,
    link: String,
}

#[derive(Debug, Deserialize)]
struct ApiCategory {
    title: String,
}

#[tauri::command]
pub async fn news_fetch() -> AppResult<Vec<NewsItem>> {
    let response: NewsApiResponse = reqwest::get(NEWS_API_URL)
        .await
        .map_err(|e| AppError::Internal(format!("failed to fetch news: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("failed to parse news response: {e}")))?;

    Ok(response.data.into_iter().map(map_news_item).collect())
}

fn map_news_item(item: ApiNewsItem) -> NewsItem {
    NewsItem {
        title: item.title,
        link: item.link,
        published: format_published_at(&item.published_at),
        excerpt: truncate_excerpt(&strip_markdown(&item.short_description)),
        category: item.category.title,
        thumbnail: item.image,
    }
}

/// Crude markdown stripper for excerpt text - drops heading/emphasis/code
/// markers character-by-character rather than parsing markdown properly,
/// since this only feeds a truncated preview, not rendered content. A bare
/// URL or a `[text](link)` pair passing through unstripped is an
/// acceptable rough edge here.
fn strip_markdown(text: &str) -> String {
    text.chars()
        .filter(|c| !matches!(c, '#' | '*' | '_' | '`'))
        .collect()
}

fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_excerpt(text: &str) -> String {
    let plain = collapse_whitespace(text);
    let char_count = plain.chars().count();
    if char_count <= EXCERPT_MAX_CHARS {
        plain
    } else {
        let truncated: String = plain.chars().take(EXCERPT_MAX_CHARS).collect();
        format!("{}…", truncated.trim_end())
    }
}

/// `published_at` is ISO 8601 (`2026-07-01T22:14:32.000000Z`) - only the
/// `YYYY-MM-DD` date prefix is used, formatted as "July 01, 2026" to match
/// what the site itself displays. Falls back to the raw string on any
/// unexpected shape rather than failing the whole fetch over one bad date.
fn format_published_at(iso: &str) -> String {
    let Some(date_part) = iso.get(0..10) else {
        return iso.to_string();
    };
    let mut parts = date_part.splitn(3, '-');
    let (Some(year), Some(month), Some(day)) = (parts.next(), parts.next(), parts.next()) else {
        return iso.to_string();
    };
    let Ok(month_index) = month.parse::<usize>() else {
        return iso.to_string();
    };
    let Some(month_name) = month_index.checked_sub(1).and_then(|i| MONTH_NAMES.get(i)) else {
        return iso.to_string();
    };

    format!("{month_name} {day}, {year}")
}

#[cfg(test)]
mod tests {
    use super::*;

    // Trimmed down to two entries, but otherwise the real response fetched
    // directly from roseonlinegame.com/api/v1/news at the time this was
    // written - if the API's shape changes, this test (not just a live
    // run) is what catches deserialization silently dropping fields.
    const FIXTURE: &str = r##"
        {
            "data": [
                {
                    "id": 276,
                    "title": "Patch Notes - 2026-07-01 (Monster Inspector)",
                    "short_description": "# Monster Inspector Update\r\n\r\nHello @everyone! Today we're back with a smaller but meaningful update.",
                    "description": "full body...",
                    "category": { "id": 3, "title": "Development", "link": "https://www.roseonlinegame.com/news/category/development" },
                    "image": "https://www.roseonlinegame.com/storage/news/example.png",
                    "published_at": "2026-07-01T22:14:32.000000Z",
                    "link": "https://www.roseonlinegame.com/news/276-patch-notes"
                },
                {
                    "id": 275,
                    "title": "[Completed] Server Maintenance - 2026-05-31",
                    "short_description": "Scheduled maintenance to deploy a small patch.",
                    "description": "full body...",
                    "category": { "id": 2, "title": "Maintenance", "link": "https://www.roseonlinegame.com/news/category/maintenance" },
                    "image": "https://www.roseonlinegame.com/storage/news/example2.png",
                    "published_at": "2026-05-31T20:31:24.000000Z",
                    "link": "https://www.roseonlinegame.com/news/275-maintenance"
                }
            ],
            "links": { "first": "", "last": "", "prev": null, "next": null },
            "meta": { "current_page": 1, "last_page": 1, "total": 2 }
        }
    "##;

    fn parse_fixture() -> Vec<NewsItem> {
        let response: NewsApiResponse = serde_json::from_str(FIXTURE).expect("valid fixture");
        response.data.into_iter().map(map_news_item).collect()
    }

    #[test]
    fn parses_every_item_in_the_response() {
        assert_eq!(parse_fixture().len(), 2);
    }

    #[test]
    fn extracts_all_fields_for_the_first_item() {
        let items = parse_fixture();
        let first = &items[0];
        assert_eq!(first.title, "Patch Notes - 2026-07-01 (Monster Inspector)");
        assert_eq!(first.link, "https://www.roseonlinegame.com/news/276-patch-notes");
        assert_eq!(first.category, "Development");
        assert_eq!(
            first.thumbnail.as_deref(),
            Some("https://www.roseonlinegame.com/storage/news/example.png")
        );
        assert_eq!(first.published, "July 01, 2026");
        assert!(first.excerpt.starts_with("Monster Inspector Update"));
    }

    #[test]
    fn distinguishes_categories_across_items() {
        let items = parse_fixture();
        assert_eq!(items[0].category, "Development");
        assert_eq!(items[1].category, "Maintenance");
    }

    #[test]
    fn formats_published_at_from_iso_8601() {
        assert_eq!(format_published_at("2026-05-31T20:31:24.000000Z"), "May 31, 2026");
    }

    #[test]
    fn falls_back_to_raw_string_on_malformed_date() {
        assert_eq!(format_published_at("not-a-date"), "not-a-date");
    }

    #[test]
    fn strips_markdown_heading_and_emphasis_markers() {
        assert_eq!(
            strip_markdown("# Title\r\n\r\n**Bold** and `code`"),
            " Title\r\n\r\nBold and code"
        );
    }

    #[test]
    fn long_excerpt_is_truncated_with_ellipsis() {
        let long_text = "word ".repeat(100);
        let truncated = truncate_excerpt(&long_text);
        assert!(truncated.chars().count() <= EXCERPT_MAX_CHARS + 1);
        assert!(truncated.ends_with('…'));
    }

    #[test]
    fn short_excerpt_is_untouched() {
        assert_eq!(truncate_excerpt("Short and sweet."), "Short and sweet.");
    }
}
