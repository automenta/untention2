import { db, Note } from '../db/db';
import { liveQuery, Observable } from 'dexie';
import * as tagPageService from './tagPageService'; // Import the new service

export const createNote = async (title: string, content: string, tagInput: string[] = []): Promise<number> => {
  const tagPageIds: number[] = [];
  if (tagInput && tagInput.length > 0) {
    for (const tagName of tagInput) {
      const tagPage = await tagPageService.getTagPageByName(tagName, true);
      if (tagPage && tagPage.id) {
        tagPageIds.push(tagPage.id);
      }
    }
  }

  const newNote: Note = {
    title,
    content,
    tagPageIds: [...new Set(tagPageIds)], // Ensure uniqueness
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return db.notes.add(newNote);
};

export const getNoteById = (id: number): Promise<Note | undefined> => {
  return db.notes.get(id);
};

export const updateNote = async (id: number, updates: Partial<Note> & { tagInput?: string[] }): Promise<number> => {
  const updateData: Partial<Note> = { ...updates };
  delete (updateData as any).tagInput; // Remove tagInput from data to be directly saved to DB

  if (updates.tagInput !== undefined) { // Check if tagInput was explicitly provided (even if empty array)
    const tagPageIds: number[] = [];
    if (updates.tagInput.length > 0) {
      for (const tagName of updates.tagInput) {
        const tagPage = await tagPageService.getTagPageByName(tagName, true);
        if (tagPage && tagPage.id) {
          tagPageIds.push(tagPage.id);
        }
      }
    }
    updateData.tagPageIds = [...new Set(tagPageIds)]; // Ensure uniqueness
  }

  const noteToUpdate = { ...updateData, updatedAt: new Date() };
  return db.notes.update(id, noteToUpdate);
};

export const deleteNote = (id: number): Promise<void> => {
  return db.notes.delete(id);
};

export const getAllNotes = (orderBy: keyof Note = 'updatedAt', reverse: boolean = true) => {
  let query = db.notes.orderBy(orderBy);
  if (reverse) {
    query = query.reverse();
  }
  return liveQuery(() => query.toArray());
};

// Full-text search for notes (title and content)
// Dexie's built-in string indexing allows for basic "contains" style search.
// For more advanced FTS, we might need to integrate other libraries or use more complex queries.
export const searchNotes = (searchTerm: string) => {
  if (!searchTerm.trim()) {
    return liveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray());
  }
  const lowerSearchTerm = searchTerm.toLowerCase();
  // This is a basic search. Dexie doesn't have true FTS like Lucene.
  // It will find notes where title or content CONTAINS the searchTerm.
  // For more complex scenarios, one might need to fetch all notes and filter client-side,
  // or structure data differently (e.g., word arrays).
  return liveQuery(() =>
    db.notes
      .filter(note =>
        note.title.toLowerCase().includes(lowerSearchTerm) ||
        note.content.toLowerCase().includes(lowerSearchTerm)
      )
      .toArray()
      .then(notes => notes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) // Manual sort after filter
  );
};

// Replaces getNotesByTag
export const getNotesByTagPageId = (tagPageId: number) => {
  return liveQuery(() =>
    db.notes
      .where('tagPageIds')
      .equals(tagPageId) // Dexie's equals for multiEntry array checks for inclusion
      .toArray()
      .then(notes => notes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()))
  );
};

// Old tag utility functions are removed as their functionality is now in tagPageService
// or handled differently.
// - TagWithCount interface (moved to tagPageService as TagPageWithCount)
// - getUniqueTagsWithCounts (functionality moved to tagPageService.getAllTagPagesWithItemCounts)
// - renameTag (functionality moved to tagPageService.renameTagPage)
// - deleteTagFromNotes (functionality moved to tagPageService.deleteTagPageAndUnlink)

// getAllTags now sources its names from tagPageService
export const getAllTags = (): Observable<string[]> => {
  // This function is intended to be used with useLiveQuery in React components.
  // It subscribes to the live query from tagPageService and maps the results.
  return liveQuery(async () => {
    const tagPagesWithCounts = await new Promise<tagPageService.TagPageWithCount[]>((resolve, reject) => {
      const subscription = tagPageService.getAllTagPagesWithItemCounts().subscribe({
        next: (value) => resolve(value),
        error: (err) => reject(err),
      });
      // This is a common pattern to bridge a live query to a one-time async value if needed,
      // but since getAllTagPagesWithItemCounts is already a live query,
      // we just need to ensure its result is correctly processed.
      // The subscription here will be managed by the outer liveQuery.
      // However, it's better to directly use the observable nature of Dexie's liveQuery.
      // The `await` keyword on a liveQuery observable directly gives its current value within another liveQuery block.
    });

    // Re-evaluating the direct use of liveQuery instance from another service:
    // The simplest way for `getAllTags` to remain a live query source of string names
    // is to depend on `tagPageService.getAllTagPagesWithItemCounts` correctly.
    const tagsWithCountsObservable = tagPageService.getAllTagPagesWithItemCounts();

    // This is a pattern to transform results from one live observable within another.
    // We need to await the current value of the observable.
    const currentTagPagesWithCounts = await tagsWithCountsObservable;

    return currentTagPagesWithCounts.map(tp => tp.name).sort((a,b) => a.localeCompare(b));
  });
};
