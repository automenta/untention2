import { db, Note } from '../db/db';
import { liveQuery, Observable } from 'dexie';
import * as tagPageService from './tagPageService'; // Import the new service
import { firstValueFrom } from 'rxjs'; // Import firstValueFrom for converting Observable to Promise

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
  return liveQuery(async () => {
    // Use firstValueFrom to convert the Observable from tagPageService into a Promise
    // that can be awaited within this async liveQuery function.
    const currentTagPagesWithCounts = await firstValueFrom(tagPageService.getAllTagPagesWithItemCounts());

    return currentTagPagesWithCounts.map(tp => tp.name).sort((a,b) => a.localeCompare(b));
  });
};
