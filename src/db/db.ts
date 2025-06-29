import Dexie, { Table } from 'dexie';

export interface Note {
  id?: number;
  title: string;
  content: string;
  tagPageIds?: number[]; // Array of TagPage IDs
  createdAt: Date;
  updatedAt: Date;
}

export interface TagPage {
  id?: number;
  name: string; // Unique name of the tag, used for display and lookup. Consider canonical form (e.g. lowercase) for uniqueness.
  createdAt: Date;
  updatedAt: Date;
}

export interface Settings {
  id?: number; // Singleton settings object, always id 1
  lmModel?: string; // e.g., "gpt-3.5-turbo", "claude-2", "gemini-pro"
  ollamaBaseUrl?: string; // For Ollama, e.g., http://localhost:11434
  nostrRelayUrl?: string;
  nostrPubKey?: string;
  theme: 'light' | 'dark';

  // Encrypted fields, stored as ArrayBuffer
  encryptedLmApiKey?: ArrayBuffer;
  encryptedNostrPrivKey?: ArrayBuffer;
  // Store salt for key derivation if not fixed, or IVs if needed per encryption
  // For simplicity with fixed salt, not storing IV per item if using AES-GCM with new IV each time (internally generated)
  // However, if we derive a key, we need a salt. Let's add one.
  encryptionSalt?: Uint8Array;
}

export interface NostrProfileNote extends Note {
  npub: string; // npub (bech32 encoded public key)
  name?: string; // NIP-01 name
  picture?: string; // NIP-01 picture URL
  about?: string; // NIP-01 about content
  nip05?: string; // NIP-05 identifier
  nip05Verified?: boolean; // True if NIP-05 was successfully verified against the profile's pubkey
  nip05VerifiedAt?: Date; // Timestamp of the last NIP-05 verification attempt
  lastChecked?: Date; // Timestamp of last NIP-01 fetch attempt
  isContact?: boolean; // Explicitly marks this profile as a contact of the user
  // Other NIP-01 fields like website, lud16, etc., can be added as needed
  // Re-uses title from Note for a local alias/display name (could be petname from Kind 3)
  // Re-uses content from Note for local private notes about the profile
}

export interface DirectMessage {
  id?: number; // Auto-incrementing primary key
  eventId: string; // Nostr event ID (unique constraint)
  peerNpub: string; // The npub of the other party in the conversation
  isSender: boolean; // True if the current user sent this message, false if received
  content: string; // Decrypted message content
  createdAt: Date; // Timestamp from the Nostr event (event.created_at * 1000)
  readAt?: Date; // Timestamp when the current user read this message (for unread indicators)
  tags?: string[][]; // Store original event tags if needed for context/reply chains
}

export interface LMCacheEntry {
  id?: number; // Auto-incrementing ID
  prompt: string; // The prompt sent to the LM
  response: string; // The full response from the LM
  model: string; // Model used for this response
  timestamp: Date; // When this entry was cached
}

export class NotentionDexie extends Dexie {
  notes!: Table<Note>;
  settings!: Table<Settings>;
  lmCache!: Table<LMCacheEntry>;
  nostrProfiles!: Table<NostrProfileNote>;
  directMessages!: Table<DirectMessage>;
  tagPages!: Table<TagPage>; // New table for TagPages

  constructor() {
    super('notentionDB');
    this.version(1).stores({
      notes: '++id, title, *tags, createdAt, updatedAt, content', // old 'tags' (string array)
      settings: '++id',
    });
    this.version(2).stores({
      // notes schema remains same as v1 regarding tags
      settings: '++id',
      lmCache: '++id, prompt, model, timestamp'
    });
    this.version(3).stores({
      // notes schema remains same as v1 regarding tags
      // nostrProfiles also uses 'tags' (string array) inherited from Note
      nostrProfiles: '++id, npub, name, *tags, createdAt, updatedAt, content, nip05, lastChecked'
    });
    this.version(4).stores({
      // No change to tags schema here
    });
    this.version(5).stores({
      // No change to tags schema here
      // nostrProfiles: '++id, npub, name, *tags, createdAt, updatedAt, content, nip05, lastChecked, nip05Verified, nip05VerifiedAt, isContact'
    });
    this.version(6).stores({
      directMessages: '++id, eventId, peerNpub, createdAt, &[peerNpub+createdAt]'
    });
    // Version 7: Introduce TagPages and migrate Notes to use tagPageIds
    this.version(7).stores({
      notes: '++id, title, *tagPageIds, createdAt, updatedAt, content',
      settings: 'id',
      lmCache: '++id',
      nostrProfiles: '++id, npub, name, *tagPageIds, createdAt, updatedAt, content, nip05, lastChecked, nip05Verified, nip05VerifiedAt, isContact',
      directMessages: '++id, eventId, peerNpub, createdAt, &[peerNpub+createdAt]',
      tagPages: '++id, &name, createdAt, updatedAt' // 'name' must be unique
    }).upgrade(async (tx) => {
      // Migration for notes
      await tx.table('notes').toCollection().modify(async (note: any) => { // Use 'any' for old structure
        if (note.tags && Array.isArray(note.tags) && note.tags.length > 0) {
          const tagPageIds: number[] = [];
          for (const tagName of note.tags) {
            if (typeof tagName === 'string' && tagName.trim() !== '') {
              let existingTagPage = await tx.table('tagPages').where('name').equalsIgnoreCase(tagName.trim()).first();
              if (!existingTagPage) {
                  const newTagPageId = await tx.table('tagPages').add({
                      name: tagName.trim(), // Store the first-encountered casing
                      createdAt: new Date(),
                      updatedAt: new Date()
                  });
                  tagPageIds.push(newTagPageId as number);
              } else {
                  tagPageIds.push(existingTagPage.id);
              }
            }
          }
          note.tagPageIds = [...new Set(tagPageIds)]; // Ensure unique IDs
        } else {
          note.tagPageIds = []; // Initialize if tags was empty or not present
        }
        delete note.tags; // Remove old tags field
      });

      // Migration for nostrProfiles (similar logic)
      await tx.table('nostrProfiles').toCollection().modify(async (profile: any) => {
        if (profile.tags && Array.isArray(profile.tags) && profile.tags.length > 0) {
          const tagPageIds: number[] = [];
          for (const tagName of profile.tags) {
            if (typeof tagName === 'string' && tagName.trim() !== '') {
              let existingTagPage = await tx.table('tagPages').where('name').equalsIgnoreCase(tagName.trim()).first();
              if (!existingTagPage) {
                  const newTagPageId = await tx.table('tagPages').add({
                      name: tagName.trim(),
                      createdAt: new Date(),
                      updatedAt: new Date()
                  });
                  tagPageIds.push(newTagPageId as number);
              } else {
                  tagPageIds.push(existingTagPage.id);
              }
            }
          }
          profile.tagPageIds = [...new Set(tagPageIds)];
        } else {
          profile.tagPageIds = [];
        }
        delete profile.tags;
      });
    });
  }

  async initializeSettings() {
    const settingsCount = await this.settings.count();
    if (settingsCount === 0) {
      await this.settings.add({
        id: 1,
        theme: 'light', // Default theme
      });
    }
  }
}

export const db = new NotentionDexie();
db.initializeSettings(); // Ensure settings are initialized when db is imported.
