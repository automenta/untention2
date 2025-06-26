import { db, LMCacheEntry } from '../db/db';

const MAX_CACHE_ENTRIES = 10;

export const addLMCacheEntry = async (prompt: string, response: string, model: string): Promise<number | undefined> => {
  try {
    const newEntry: LMCacheEntry = {
      prompt,
      response,
      model,
      timestamp: new Date(),
    };
    const id = await db.lmCache.add(newEntry);

    // Enforce cache limit: delete oldest entries if count exceeds MAX_CACHE_ENTRIES
    const count = await db.lmCache.count();
    if (count > MAX_CACHE_ENTRIES) {
      const entriesToDelete = await db.lmCache
        .orderBy('timestamp')
        .limit(count - MAX_CACHE_ENTRIES)
        .toArray();

      const idsToDelete = entriesToDelete.map(entry => entry.id).filter(id => id !== undefined) as number[];
      if (idsToDelete.length > 0) {
        await db.lmCache.bulkDelete(idsToDelete);
        console.log(`LM Cache: Evicted ${idsToDelete.length} old entries.`);
      }
    }
    return id;
  } catch (error) {
    console.error("Failed to add LM Cache entry:", error);
    return undefined;
  }
};

export const getLMCacheByPrompt = async (prompt: string, model: string): Promise<LMCacheEntry | undefined> => {
  try {
    // This is a simple exact match. More sophisticated matching (e.g., fuzzy) would be complex.
    return await db.lmCache
      .where({ prompt: prompt, model: model })
      .sortBy('timestamp') // Get the most recent for this exact prompt/model
      .then(results => results.pop()); // last one is the most recent due to sortBy
  } catch (error) {
    console.error("Failed to retrieve LM Cache entry by prompt:", error);
    return undefined;
  }
};

export const getAllLMCacheEntries = async (limit: number = MAX_CACHE_ENTRIES): Promise<LMCacheEntry[]> => {
    try {
        return await db.lmCache
            .orderBy('timestamp')
            .reverse() // Most recent first
            .limit(limit)
            .toArray();
    } catch (error) {
        console.error("Failed to retrieve all LM Cache entries:", error);
        return [];
    }
};

export const clearLMCache = async (): Promise<void> => {
    try {
        await db.lmCache.clear();
        console.log("LM Cache cleared.");
    } catch (error) {
        console.error("Failed to clear LM Cache:", error);
    }
};
