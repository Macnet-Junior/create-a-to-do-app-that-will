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
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const index = Math.abs(dayOfYear) % this.dailyVerses.length;
    return this.dailyVerses[index] || this.dailyVerses[0];
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

  getInspiringChapters() {
    return [
      { book: "Psalms", chapter: 23, label: "Psalm 23 (The Shepherd's Care)" },
      { book: "Philippians", chapter: 4, label: "Philippians 4 (Peace & Rejoicing)" },
      { book: "1 Corinthians", chapter: 13, label: "1 Corinthians 13 (The Way of Love)" },
      { book: "Romans", chapter: 8, label: "Romans 8 (More than Conquerors)" },
      { book: "Psalms", chapter: 91, label: "Psalm 91 (Shelter of the Almighty)" },
      { book: "John", chapter: 14, label: "John 14 (The Way, Truth & Life)" },
      { book: "Proverbs", chapter: 3, label: "Proverbs 3 (Trust with All Your Heart)" },
      { book: "Isaiah", chapter: 40, label: "Isaiah 40 (Renewing Strength)" },
      { book: "Psalms", chapter: 121, label: "Psalm 121 (My Help Comes from the Lord)" },
      { book: "Matthew", chapter: 5, label: "Matthew 5 (The Sermon on the Mount)" }
    ];
  }

  // Fetch full chapter or passage (either from local preloaded cache or from Bible API)
  async getChapter(book, chapter) {
    const cleanBook = (book || "").trim();
    const cleanChap = parseInt(chapter, 10);
    const key = `${cleanBook} ${cleanChap}`;
    const keyAlt = cleanBook === "Psalms" ? `Psalm ${cleanChap}` : (cleanBook === "Psalm" ? `Psalms ${cleanChap}` : key);

    // Check preloaded first
    if (this.preloadedChapters[key]) {
      return { ...this.preloadedChapters[key], source: 'local' };
    }
    if (this.preloadedChapters[keyAlt]) {
      return { ...this.preloadedChapters[keyAlt], source: 'local' };
    }

    // Check memory cache
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Try fetching from online Bible API (World English Bible)
    try {
      const formattedQuery = encodeURIComponent(`${cleanBook} ${cleanChap}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const resp = await fetch(`https://bible-api.com/${formattedQuery}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`Failed to fetch ${key}: status ${resp.status}`);
      }

      const data = await resp.json();
      const verses = (data.verses || []).map(v => ({
        verse: v.verse,
        text: (v.text || "").trim()
      }));

      const result = {
        reference: data.reference || key,
        book: cleanBook,
        chapter: cleanChap,
        title: `${cleanBook} Chapter ${cleanChap}`,
        verses: verses,
        text: (data.text || "").trim(),
        translation: data.translation_name || "World English Bible",
        source: 'api'
      };

      this.cache.set(key, result);
      return result;
    } catch (err) {
      console.warn(`Online fetch for ${key} failed, falling back to local fallback.`, err);

      // Check if we have any matching verse for this book in daily verses
      const matchingVerses = this.dailyVerses.filter(v => 
        v.book.toLowerCase() === cleanBook.toLowerCase() && v.chapter === cleanChap
      );
      if (matchingVerses.length > 0) {
        return {
          reference: `${cleanBook} ${cleanChap}`,
          book: cleanBook,
          chapter: cleanChap,
          title: `${cleanBook} Chapter ${cleanChap}`,
          verses: matchingVerses.map((v, i) => ({
            verse: v.startVerse || i + 1,
            text: v.text
          })),
          text: matchingVerses.map(v => v.text).join("\n\n"),
          translation: "World English Bible",
          source: 'local-partial'
        };
      }

      // Default fallback
      return {
        reference: `${cleanBook} ${cleanChap}`,
        book: cleanBook,
        chapter: cleanChap,
        title: `${cleanBook} ${cleanChap}`,
        verses: [
          {
            verse: 1,
            text: `Connection offline or chapter not cached. Please select an offline favorite such as Psalm 23, Philippians 4, John 14, Romans 8, or Psalm 91.`
          }
        ],
        text: "Could not connect to online Bible server.",
        translation: "World English Bible",
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
