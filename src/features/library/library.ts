export const MEDIA_KINDS = ["book", "movie", "series", "music", "podcast", "game", "other"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];
export const MEDIA_STATUS = ["want", "in_progress", "done", "dropped"] as const;
export type MediaStatus = (typeof MEDIA_STATUS)[number];

export const MEDIA_LABEL: Record<MediaKind, string> = { book: "Books", movie: "Films", series: "Series", music: "Music", podcast: "Podcasts", game: "Games", other: "Other" };
export const STATUS_LABEL: Record<MediaStatus, string> = { want: "want to", in_progress: "on it", done: "done", dropped: "dropped" };

/** How they have a book. Only books have a format; it's optional. */
export const MEDIA_FORMATS = ["print", "ebook", "audio"] as const;
export type MediaFormat = (typeof MEDIA_FORMATS)[number];
export const FORMAT_LABEL: Record<MediaFormat, string> = { print: "Hard copy", ebook: "PDF / e-book", audio: "Audiobook" };

/** The format to store: a known one for a book, otherwise none (a film has no "hard copy"). */
export function formatFor(kind: MediaKind, format: string | null | undefined): MediaFormat | null {
  return kind === "book" && MEDIA_FORMATS.includes(format as MediaFormat) ? (format as MediaFormat) : null;
}

/** "Favourite Song" → "song": one spelling per category. */
export const normalizeCategory = (c: string) => c.trim().toLowerCase().replace(/^favou?rite\s+/, "").replace(/s$/, "") || "other";
