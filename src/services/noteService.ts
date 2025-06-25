import { db, Note } from '../db/db';
import { liveQuery } from 'dexie';

export const createNote = async (title: string, content: string, tags: string[] = []): Promise<number> => {
  const newNote: Note = {
    title,
    content,
    tags,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return db.notes.add(newNote);
};

export const getNoteById = (id: number): Promise<Note | undefined> => {
  return db.notes.get(id);
};

export const updateNote = async (id: number, updates: Partial<Note>): Promise<number> => {
  const noteToUpdate = { ...updates, updatedAt: new Date() };
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

export const getNotesByTag = (tag: string) => {
  return liveQuery(() =>
    db.notes
      .where('tags')
      .equals(tag)
      .toArray()
      .then(notes => notes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()))
  );
};

// Utility to get all unique tags
export const getAllTags = () => {
  return liveQuery(async () => {
    const notes = await db.notes.toArray();
    const tagSet = new Set<string>();
    notes.forEach(note => note.tags.forEach(tag => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  });
};
