// bible-service.js - Fetches scriptures, manages verse database, and connects to Bible API

import { BIBLE_BOOKS, DAILY_VERSES, PRELOADED_CHAPTERS } from './bible-data.js';

class BibleService {
  constructor() {
    this.books = BIBLE_BOOKS;
    this.dailyVerses = DAILY_VERSES;
    this.preloadedChapters = PRELOADED_CHAPTERS;
    this.cache = new Map();
  }

  // Get a random or daily verse
  getDailyVerse() {
    // Pick based on day of year for consistent daily verse, or random if refreshed
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const index = dayOfYear % this.dailyVerses.length;
    return this.dailyVerses[index];
  }

  getRandomVerse(category = null) {
    let pool = this.dailyVerses;
    if (category && category !== 'All') {
      pool = this.dailyVerses.filter(v => v.category === category);
      if (pool.length === 0) pool = this.dailyVerses;
    }
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }

  getCategories() {
    const set = new Set(this.dailyVerses.map(v => v.category));
    return ['All', ...Array.from(set)];
  }

  // Fetch full chapter or passage (either from local preloaded cache or from Bible API)
  async getChapter(book, chapter) {
    const key = `${book} ${chapter}`.trim();

    // Check preloaded first
    if (this.preloadedChapters[key]) {
      return {
        ...this.preloadedChapters[key],
        source: 'local'
      };
    }

    // Check memory cache
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Try fetching from online Bible API
    try {
      const formattedQuery = encodeURIComponent(`${book} ${chapter}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(`https://bible-api.com/${formattedQuery}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`Failed to fetch ${key}: status ${resp.status}`);
      }

      const data = await resp.json();
      const result = {
        reference: data.reference || key,
        book: book,
        chapter: chapter,
        title: `${book} Chapter ${chapter}`,
        verses: (data.verses || []).map(v => ({
          verse: v.verse,
          text: (v.text || "").trim()
        })),
        text: (data.text || "").trim(),
        translation: data.translation_name || "World English Bible",
        source: 'api'
      };

      this.cache.set(key, result);
      return result;
    } catch (err) {
      console.warn(`Online fetch for ${key} failed, falling back to local fallback.`, err);

      // Check if we have any matching verse for this book in daily verses
      const matchingVerses = this.dailyVerses.filter(v => v.book.toLowerCase() === book.toLowerCase() && v.chapter === chapter);
      if (matchingVerses.length > 0) {
        return {
          reference: `${book} ${chapter}`,
          book,
          chapter,
          title: `${book} ${chapter}`,
          verses: matchingVerses.map((v, i) => ({
            verse: v.startVerse || i + 1,
            text: v.text
          })),
          text: matchingVerses.map(v => v.text).join("\n\n"),
          source: 'local-partial'
        };
      }

      // Default fallback if offline and not preloaded
      return {
        reference: `${book} ${chapter}`,
        book,
        chapter,
        title: `${book} ${chapter}`,
        verses: [
          {
            verse: 1,
            text: "Could not connect to online Bible server. Please check your connection or choose one of the preloaded chapters (Psalm 23, Philippians 4, Romans 8, 1 Corinthians 13, Psalm 91, Proverbs 3)."
          }
        ],
        text: "Could not connect to online Bible server.",
        source: 'offline-error'
      };
    }
  }

  // Get full context for a specific daily verse
  async getVerseFullContext(verseObj) {
    if (!verseObj) return null;
    return await this.getChapter(verseObj.book, verseObj.chapter);
  }
}

export const bibleService = new BibleService();
