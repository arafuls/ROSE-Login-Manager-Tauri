const NEWS_URL = "https://www.roseonlinegame.com/news";

/**
 * Embeds the official site's news page directly rather than re-implementing
 * a patch-notes feed against an undocumented API - always current by
 * construction, no scraping/API-shape risk. Confirmed roseonlinegame.com
 * sends no X-Frame-Options/CSP frame-ancestors header, so embedding it
 * isn't blocked.
 */
export function NewsPanel() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <iframe
        className="w-full flex-1 border-0"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups"
        src={NEWS_URL}
        title="ROSE Online News"
      />
    </div>
  );
}
