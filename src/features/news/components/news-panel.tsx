/** The Home screen's News panel. */

import { openUrl } from "@tauri-apps/plugin-opener";
import { LoaderCircle, RefreshCw, SquareArrowOutUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NewsItem } from "@/features/news/types";
import { useNews } from "@/features/news/use-news";
import { cn } from "@/lib/utils";

/**
 * Replaces the old iframe embed of roseonlinegame.com/launcher.html. That
 * page's own layout isn't ours to control, and it visibly broke
 * (overlapping/misaligned) when this panel's size changed - resizing an
 * iframe doesn't make third-party content inside it reflow, since that
 * content has no reason to expect an arbitrary embed size. This instead
 * scrapes the site's own news listing page (src-tauri/src/commands/news.rs)
 * and renders it as native, flexbox-laid-out cards - reactive by
 * construction, since we own the markup end to end.
 *
 * Category/thumbnail: the site's own listing page always renders the
 * category badge in the same red, regardless of type (confirmed by
 * inspecting its real HTML) - the per-category coloring here
 * (CATEGORY_COLOR_CLASS) is this app's own design choice, not a copy of
 * the source site's styling.
 */
export function NewsPanel() {
  const { items, loading, error, refetch } = useNews();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4">
        <span className="font-medium text-sm">News</span>
        <Button
          aria-label="Refresh news"
          disabled={loading}
          onClick={refetch}
          size="icon-xs"
          title="Refresh"
          variant="ghost"
        >
          <RefreshCw
            className={loading ? "size-3.5 animate-spin" : "size-3.5"}
          />
        </Button>
      </div>

      <div className="@container min-h-0 flex-1 overflow-y-auto">
        {loading && items.length === 0 && (
          <div className="flex h-40 items-center justify-center">
            <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-muted-foreground text-sm">
              Couldn't load news: {error}
            </p>
            <Button onClick={refetch} size="sm" variant="outline">
              Retry
            </Button>
          </div>
        )}

        {!((loading && items.length === 0) || error) && items.length === 0 && (
          <div className="flex h-40 items-center justify-center">
            <p className="text-muted-foreground text-sm">No news right now.</p>
          </div>
        )}

        {items.length > 0 && (
          <div className="grid @2xl:grid-cols-2 grid-cols-1 gap-3 p-4">
            {items.map((item) => (
              <NewsCard item={item} key={item.link} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Not exhaustive on purpose - `category` is whatever text the site puts
 * in the badge (see models.rs's NewsItem doc comment), so an
 * unrecognized value just falls through to the default color instead of
 * needing a code change every time the site adds a new one.
 */
const CATEGORY_COLOR_CLASS: Record<string, string> = {
  Development: "text-emerald-500",
  Maintenance: "text-destructive",
  News: "text-primary",
};
const DEFAULT_CATEGORY_COLOR_CLASS = "text-primary";

/** One article as a clickable card, opening the article's link on click. */
function NewsCard({ item }: { item: NewsItem }) {
  const categoryColor =
    CATEGORY_COLOR_CLASS[item.category] ?? DEFAULT_CATEGORY_COLOR_CLASS;

  return (
    <button
      className="flex gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50"
      onClick={() => openUrl(item.link)}
      type="button"
    >
      {item.thumbnail && (
        <img
          alt=""
          className="h-20 w-20 shrink-0 rounded-md border object-cover"
          height={80}
          src={item.thumbnail}
          width={80}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {item.category && (
                <span
                  className={cn(
                    "font-heading font-semibold text-xs uppercase tracking-wide",
                    categoryColor
                  )}
                >
                  {item.category}
                </span>
              )}
              {item.published && (
                <span className="text-muted-foreground text-xs">
                  {item.published}
                </span>
              )}
            </div>
            <p className="mt-1 font-medium text-sm leading-snug">
              {item.title}
            </p>
          </div>
          <SquareArrowOutUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        </div>
        {item.excerpt && (
          <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
            {item.excerpt}
          </p>
        )}
      </div>
    </button>
  );
}
