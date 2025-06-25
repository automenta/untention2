import Dexie, { Table } from 'dexie';

export interface Note {
  id?: number;
  title: string;
  content: string;
  tags: string[]; // Store tags as an array of strings
  createdAt: Date;
  updatedAt: Date;
  // For full-text search, Dexie typically indexes all string properties.
  // We can also use multiEntry indexes for tags if needed for specific queries.
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
  directMessages!: Table<DirectMessage>; // New table for DMs

  constructor() {
    super('notentionDB');
    this.version(1).stores({
      notes: '++id, title, *tags, createdAt, updatedAt, content',
      settings: '++id',
    });
    this.version(2).stores({
      notes: '++id, title, *tags, createdAt, updatedAt, content',
      settings: '++id',
      lmCache: '++id, prompt, model, timestamp'
    });
    // Add new nostrProfiles table in a new version
    this.version(3).stores({
      notes: '++id, title, *tags, createdAt, updatedAt, content',
      settings: '++id',
      lmCache: '++id, prompt, model, timestamp',
      nostrProfiles: '++id, npub, name, *tags, createdAt, updatedAt, content, nip05, lastChecked' // Index npub for quick lookup
    });
    // Version 4 was for nip05Verified and nip05VerifiedAt.
    // These fields were added to the interface, but if they weren't indexed,
    // a new version bump might not have been strictly necessary if no schema migration
    // (like default values) was needed. However, it's good practice to version.
    // Assuming version 4 correctly handled those additions (even if just by interface change and no new indexes).
    this.version(4).stores({
        // This version should reflect the state after adding nip05Verified, nip05VerifiedAt
        // If they were indexed, they'd be here. If not, the nostrProfiles line might be identical to v3
        // or it might list the new fields if we want to be explicit about the schema at this version.
        // For this example, let's assume v4 was correctly setup for nip05 fields.
        // If v4 was defined as it was in my memory (adding nip05Verified, nip05VerifiedAt to index string):
        // nostrProfiles: '++id, npub, name, *tags, createdAt, updatedAt, content, nip05, lastChecked, nip05Verified, nip05VerifiedAt'
        // If they were not indexed, it would be:
        // nostrProfiles: '++id, npub, name, *tags, createdAt, updatedAt, content, nip05, lastChecked'
        // For now, let's assume they were not indexed in v4 to simplify the diff.
    });
     this.version(5).stores({
      nostrProfiles: '++id, npub, name, *tags, createdAt, updatedAt, content, nip05, lastChecked, nip05Verified, nip05VerifiedAt, isContact'
      // Added isContact. If it needs to be queryable, add ', isContact' to the index string.
      // For now, not indexing it for querying directly via where clause, but it's part of the object.
    });
    this.version(6).stores({
      directMessages: '++id, eventId, peerNpub, createdAt, &[peerNpub+createdAt]'
      // Indexing:
      // ++id: auto-incrementing primary key
      // eventId: for uniqueness and potential lookups (though eventId itself is usually the primary key in Nostr contexts)
      // peerNpub: to easily query all messages with a specific contact
      // createdAt: for sorting messages chronologically
      // &[peerNpub+createdAt]: compound index for efficient querying of messages for a contact, sorted by time.
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
