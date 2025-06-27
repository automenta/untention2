import { db, Note, TagPage } from '../db/db'; // Import TagPage
import { liveQuery, Observable } from 'dexie';
import * as tagPageService from './tagPageService'; // Import the new service
// import { firstValueFrom } from 'rxjs'; // Removed unused import

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
  return db.notes.add(newNote) as Promise<number>; // Cast return type
};

export const getNoteById = async (id: number): Promise<Note | null> => {
  const note = await db.notes.get(id);
  return note || null;
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
    // Directly await the result of the Dexie liveQuery observable from the service.
    // This works because we are inside another liveQuery's async function.
    // Dexie automatically subscribes to nested live queries.
    // const tagPagesWithCountsObservable = tagPageService.getAllTagPagesWithItemCounts(); // Unused variable
    // To get the actual data from a Dexie observable inside a liveQuery,
    // you typically don't await firstValueFrom (that's for RxJS).
    // Instead, you'd structure it so Dexie handles the reactivity.
    // However, if you need a snapshot, you can use `await observablePromise(observable)`
    // But here, we want live updates.
    // A cleaner way if getAllTagPagesWithItemCounts is a liveQuery:
    // const allTagPages = await db.tagPages.orderBy('name').toArray(); // (Example, adapt to actual logic)
    // For now, to fix the immediate error with firstValueFrom on a Dexie observable:
    // We need to get a promise from the Dexie observable for one-time use if not in a reactive chain.
    // Since this IS a liveQuery, we can re-evaluate how it consumes other liveQueries.
    // The simplest for now, if tagPageService.getAllTagPagesWithItemCounts() IS a dexie live observable,
    // is to call it and let dexie manage dependencies.
    // The issue is `firstValueFrom` expects an RxJS observable.
    // The `tagPageService.getAllTagPagesWithItemCounts()` returns a Dexie observable.

    // Correct approach: if `tagPageService.getAllTagPagesWithItemCounts` returns a Dexie Observable,
    // and `getAllTags` is also a liveQuery, Dexie will handle the dependency.
    // The error was `firstValueFrom` on a non-RxJS observable.
    // We just need to get the current value.
    // A direct call to the function that returns the Dexie observable is enough inside liveQuery.

    // Let's assume tagPageService.getAllTagPagesWithItemCounts() returns the array directly for this snapshot logic,
    // or we adjust tagPageService to return a promise for one-time get if getAllTags is not live.
    // Given getAllTags IS liveQuery, it should depend on the liveQuery from tagPageService.
    // The `await firstValueFrom` was the error. We should just call it.
    // However, tagPageService.getAllTagPagesWithItemCounts() returns an Observable.
    // A simple way to get the current value of a dexie observable is not straightforward without firstValueFrom (for RxJS) or custom logic.

    // Simplest fix: Re-implement the logic of getAllTagPagesWithItemCounts here if getAllTags needs to be live and depend on its parts.
    // OR, if getAllTags doesn't need to be live itself but just transform data, it shouldn't use liveQuery.

    // Assuming getAllTags itself should be live based on changes to TagPages or Notes:
    const allTagPages = await db.tagPages.orderBy('name').toArray();
    const allNotes = await db.notes.toArray();
    const allNostrProfileNotes = await db.nostrProfiles.toArray();

    const tagCounts = new Map<number, number>();
    allNotes.forEach(note => {
      if (note.tagPageIds) {
        note.tagPageIds.forEach(id => {
          tagCounts.set(id, (tagCounts.get(id) || 0) + 1);
        });
      }
    });
    allNostrProfileNotes.forEach(profile => {
        if (profile.tagPageIds) {
            profile.tagPageIds.forEach(id => {
                tagCounts.set(id, (tagCounts.get(id) || 0) + 1);
            });
        }
    });

    // allTagPages is TagPage[]. We are mapping to TagPageWithCount[]
    const tagPagesWithCountsData: tagPageService.TagPageWithCount[] = allTagPages.map((tp: TagPage) => ({
      id: tp.id!,
      name: tp.name,
      count: tagCounts.get(tp.id!) || 0,
      createdAt: tp.createdAt,
      updatedAt: tp.updatedAt,
    }));

    return tagPagesWithCountsData.map((tp: tagPageService.TagPageWithCount) => tp.name).sort((a: string, b: string) => a.localeCompare(b));
  });
};
