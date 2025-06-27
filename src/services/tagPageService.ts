import { db, TagPage, Note } from '../db/db'; // Assuming Note might be needed for counts, or adjust if not.
import { liveQuery, Observable } from 'dexie';

// Interface for the object returned by getAllTagPagesWithItemCounts
export interface TagPageWithCount {
  id: number;
  name: string;
  count: number;
  createdAt: Date; // Include other TagPage fields if needed in the UI directly
  updatedAt: Date;
}

/**
 * Finds a TagPage by its name (case-insensitive).
 * Optionally creates a new TagPage if it doesn't exist and createIfNotExist is true.
 * The name stored in the database will be the one provided when first created.
 */
export const getTagPageByName = async (name: string, createIfNotExist: boolean = false): Promise<TagPage | undefined> => {
  if (!name || !name.trim()) {
    return undefined;
  }
  const trimmedName = name.trim();

  // Perform a case-insensitive search
  let tagPage = await db.tagPages.where('name').equalsIgnoreCase(trimmedName).first();

  if (!tagPage && createIfNotExist) {
    try {
      const newTagPageId = await db.tagPages.add({
        name: trimmedName, // Store with the casing provided
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      tagPage = await db.tagPages.get(newTagPageId);
    } catch (error) {
      // Handle potential race condition if another process added it, or unique constraint violation if &name is strictly case sensitive
      // and we tried to add a different casing of an existing name (though equalsIgnoreCase should prevent this specific scenario here)
      // A second lookup might be needed if add fails due to race condition.
      console.error(`Error creating tagPage '${trimmedName}':`, error);
      // Retry lookup in case of race condition where it was added between .first() and .add()
      tagPage = await db.tagPages.where('name').equalsIgnoreCase(trimmedName).first();
      if (!tagPage) { // If still not found after a race condition check, then it's a genuine error.
          // Depending on strictness, could throw error or return undefined.
          // For now, logging and returning undefined.
          console.error(`Failed to create or find tagPage '${trimmedName}' even after retry.`);
          return undefined;
      }
    }
  }
  return tagPage;
};

/**
 * Fetches multiple TagPage objects by their IDs.
 */
export const getTagPagesByIds = async (ids: number[]): Promise<TagPage[]> => {
  if (!ids || ids.length === 0) {
    return [];
  }
  // Dexie's bulkGet or where(':id').anyOf(ids) can be used.
  // where clause is generally more flexible if we need to add more conditions later.
  return db.tagPages.where('id').anyOf(ids).toArray();
};

/**
 * Retrieves all TagPages and dynamically counts how many notes reference each tagPageId.
 * Returns a live query observable.
 */
export const getAllTagPagesWithItemCounts = (): Observable<TagPageWithCount[]> => {
  return liveQuery(async () => {
    const allTagPages = await db.tagPages.orderBy('name').toArray();
    const allNotes = await db.notes.toArray(); // Consider nostrProfiles too if they use tagPageIds

    // For NostrProfileNotes, assuming they also have a tagPageIds field after migration
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


    return allTagPages.map(tp => ({
      ...tp,
      id: tp.id!, // id will exist for sure from DB
      count: tagCounts.get(tp.id!) || 0,
    })).sort((a,b) => a.name.localeCompare(b.name)); // Default sort by name
  });
};

// Placeholder for future service functions like renameTagPage, deleteTagPageAndUnlink
export const renameTagPage = async (tagPageId: number, newName: string): Promise<void> => {
    // Implementation will ensure newName is unique (case-insensitive), then update TagPage.name
    // This is a placeholder.
    console.log("Placeholder: renameTagPage", {tagPageId, newName});
    const trimmedNewName = newName.trim();
    if (!trimmedNewName) throw new Error("New tag name cannot be empty.");

    // Check if another tag already exists with the new name (case-insensitive)
    const existingTagWithNewName = await db.tagPages.where('name').equalsIgnoreCase(trimmedNewName).first();
    if (existingTagWithNewName && existingTagWithNewName.id !== tagPageId) {
        // This means we are trying to rename to a name that already exists for a *different* tag.
    // This is a "merge" operation.
    // 1. Re-assign all items (notes, nostrProfiles) from the old tagPage (tagPageId) to the existingTagWithNewName.id
    // 2. Delete the old tagPage (tagPageId).

    const targetTagPageId = existingTagWithNewName.id!;

    // Update notes
    const notesToUpdate = await db.notes.where('tagPageIds').equals(tagPageId).toArray();
    const noteUpdatePromises = notesToUpdate.map(note => {
      const newTagPageIds = new Set(note.tagPageIds?.filter(id => id !== tagPageId) || []);
      newTagPageIds.add(targetTagPageId);
      return db.notes.update(note.id!, { tagPageIds: Array.from(newTagPageIds), updatedAt: new Date() });
    });
    await Promise.all(noteUpdatePromises);

    // Update nostrProfiles
    const profilesToUpdate = await db.nostrProfiles.where('tagPageIds').equals(tagPageId).toArray();
    const profileUpdatePromises = profilesToUpdate.map(profile => {
      const newTagPageIds = new Set(profile.tagPageIds?.filter(id => id !== tagPageId) || []);
      newTagPageIds.add(targetTagPageId);
      return db.nostrProfiles.update(profile.id!, { tagPageIds: Array.from(newTagPageIds), updatedAt: new Date() });
    });
    await Promise.all(profileUpdatePromises);

    // Delete the old TagPage
    await db.tagPages.delete(tagPageId);
    // No need to update item counts here, getAllTagPagesWithItemCounts will recalculate.
    // UI should refresh.
  } else {
    // No conflict, or renaming to self (e.g. case change), just update the name
    await db.tagPages.update(tagPageId, { name: trimmedNewName, updatedAt: new Date() });
    }
};

export const deleteTagPageAndUnlink = async (tagPageId: number): Promise<void> => {
    // Implementation will delete the TagPage and remove its ID from all notes' tagPageIds array.
    // This is a placeholder.
    console.log("Placeholder: deleteTagPageAndUnlink", {tagPageId});

    // 1. Remove the tagPageId from all notes
    const notesToUpdate = await db.notes.where('tagPageIds').equals(tagPageId).toArray();
    const noteUpdatePromises = notesToUpdate.map(note => {
        const newTagPageIds = note.tagPageIds?.filter(id => id !== tagPageId);
        return db.notes.update(note.id!, { tagPageIds: newTagPageIds, updatedAt: new Date() });
    });
    await Promise.all(noteUpdatePromises);

    // 2. Remove the tagPageId from all nostrProfiles
    const profilesToUpdate = await db.nostrProfiles.where('tagPageIds').equals(tagPageId).toArray();
    const profileUpdatePromises = profilesToUpdate.map(profile => {
        const newTagPageIds = profile.tagPageIds?.filter(id => id !== tagPageId);
        return db.nostrProfiles.update(profile.id!, { tagPageIds: newTagPageIds, updatedAt: new Date() });
    });
    await Promise.all(profileUpdatePromises);

    // 3. Delete the TagPage itself
    await db.tagPages.delete(tagPageId);
};
