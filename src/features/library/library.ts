export const MEDIA_KINDS = ["book", "movie", "series", "music", "podcast", "game", "other"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const MEDIA_STATUS = ["want", "in_progress", "done", "dropped"] as const;
export type MediaStatus = (typeof MEDIA_STATUS)[number];

export const MEDIA_LABEL: Record<MediaKind, string> = { book: "Books", movie: "Films", series: "Series", music: "Music", podcast: "Podcasts", game: "Games", other: "Other" };
export const STATUS_LABEL: Record<MediaStatus, string> = { want: "want to", in_progress: "on it", done: "done", dropped: "dropped" };

/** "Favourite Song" → "song": one spelling per category. */
export const normalizeCategory = (c: string) => c.trim().toLowerCase().replace(/^favou?rite\s+/, "").replace(/s$/, "") || "other";
