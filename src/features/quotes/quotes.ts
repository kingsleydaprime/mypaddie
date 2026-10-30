export interface Quote {
  text: string;
  author: string | null;
}

/**
 * The built-in set: short, public-domain or proverb, attributions we're sure
 * of (no "attributed to Mark Twain"). Leans to action over feeling good.
 */
export const BUILT_IN_QUOTES: readonly Quote[] = [
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
  { text: "Lost time is never found again.", author: "Benjamin Franklin" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
  { text: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius" },
  { text: "First say to yourself what you would be; and then do what you have to do.", author: "Epictetus" },
  { text: "No man is free who is not master of himself.", author: "Epictetus" },
  { text: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca" },
  { text: "While we are postponing, life speeds by.", author: "Seneca" },
  { text: "A journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "If you want to go fast, go alone. If you want to go far, go together.", author: "African proverb" },
  { text: "However long the night, the dawn will break.", author: "African proverb" },
  { text: "Little by little, the bird builds its nest.", author: "Proverb" },
  { text: "Fall seven times, stand up eight.", author: "Japanese proverb" },
  { text: "Be not afraid of growing slowly; be afraid only of standing still.", author: "Chinese proverb" },
  { text: "The best time to plant a tree was twenty years ago. The second best time is now.", author: "Proverb" },
  { text: "Rest if you must, but don't you quit.", author: "Don't Quit (anonymous poem)" },
  { text: "Make each day your masterpiece.", author: "John Wooden" },
  { text: "We are what we repeatedly do.", author: "Will Durant, on Aristotle" },
  { text: "And let us not be weary in well doing: for in due season we shall reap, if we faint not.", author: "Galatians 6:9" },
  { text: "Go to the ant, thou sluggard; consider her ways, and be wise.", author: "Proverbs 6:6" },
  { text: "Whatsoever thy hand findeth to do, do it with thy might.", author: "Ecclesiastes 9:10" },
];

/** A small, stable hash of the day ("2026-10-30"), so the quote holds all day and changes at midnight. */
function dayIndex(day: string): number {
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Today's quote. Their own come up two days in three (when they have any);
 * otherwise, and on the third day, one of the built-in set. Same day, same quote.
 */
export function quoteOfTheDay(own: readonly Quote[], day: string, builtIn: readonly Quote[] = BUILT_IN_QUOTES): Quote | null {
  const h = dayIndex(day);
  const pool = own.length > 0 && (h % 3 !== 2 || builtIn.length === 0) ? own : builtIn;
  if (pool.length === 0) return null;
  return pool[Math.floor(h / 3) % pool.length]!;
}

/** "Text — Author", or a line with "~ Author" / "- Author" at the end, into a quote. Strips wrapping quote marks. */
export function parseQuote(line: string): Quote | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(.*\S)\s+(?:—|–|~|-)\s+([^—–~]{1,120})$/u);
  const raw = m ? m[1]! : trimmed;
  const text = raw.replace(/^["“”']+|["“”']+$/gu, "").trim();
  if (!text) return null;
  return { text: text.slice(0, 500), author: m ? m[2]!.trim() : null };
}
