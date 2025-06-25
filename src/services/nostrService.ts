import {
  Relay,
  Event,
  EventTemplate,
  getEventHash,
  signEvent,
  nip04,
  nip19,
  generateSecretKey, // Already used in SettingsPage, but good to have here if needed
  getPublicKey,
} from 'nostr-tools';
import * as settingsService from './settingsService';
import { db } from '../db/db'; // For direct settings access if liveQuery is not suitable here

// Manage a single relay connection
let relay: Relay | null = null;
let relayUrl: string | null = null;

export const getRelay = async (): Promise<Relay | null> => {
  const settings = await db.settings.get(1);
  if (!settings?.nostrRelayUrl) {
    console.warn('Nostr relay URL not configured.');
    if (relay) { // Disconnect if URL is removed
        await relay.close();
        relay = null;
    }
    return null;
  }

  if (relay && settings.nostrRelayUrl === relayUrl && relay.connected) {
    return relay;
  }

  if (relay) { // Existing relay, but URL changed or disconnected
    await relay.close();
    relay = null;
  }

  try {
    relayUrl = settings.nostrRelayUrl;
    console.log(`Attempting to connect to Nostr relay: ${relayUrl}`);
    relay = await Relay.connect(relayUrl);

    relay.on('connect', () => {
      console.log(`Connected to ${relay?.url}`);
    });
    relay.on('disconnect', () => {
      console.log(`Disconnected from ${relay?.url}`);
      // Consider retry logic or nullifying relay here if auto-reconnect is not handled by Relay.connect
    });
    relay.on('error', (error: any) => {
      console.error(`Nostr relay error: ${error?.message || error}`);
      // Potentially close and nullify relay on certain errors
    });

    return relay;
  } catch (error) {
    console.error(`Failed to connect to Nostr relay ${settings.nostrRelayUrl}:`, error);
    if (relay) { // ensure it's closed if connect threw during/after partial connection
        await relay.close();
    }
    relay = null;
    relayUrl = null;
    return null;
  }
};

export const disconnectRelay = async () => {
    if (relay) {
        await relay.close();
        console.log(`Disconnected from ${relay.url}`);
        relay = null;
        relayUrl = null;
    }
};

export const publishNoteEvent = async (content: string, tags: string[][] = [], isPublic: boolean = true, recipientPubKey?: string): Promise<Event | null> => {
  const currentRelay = await getRelay();
  if (!currentRelay) {
    throw new Error('Nostr relay not connected.');
  }

  const privKeyHex = await settingsService.getNostrPrivKey();
  if (!privKeyHex) {
    throw new Error('Nostr private key not configured.');
  }
  const pubKeyHex = getPublicKey(privKeyHex);

  let finalContent = content;
  let eventTags = [...tags];

  if (!isPublic) {
    if (!recipientPubKey) {
      throw new Error('Recipient public key is required for private (NIP-04) messages.');
    }
    if (recipientPubKey === pubKeyHex) {
        throw new Error('Cannot send NIP-04 encrypted message to self using this method. Consider Kind 42 for self-notes.');
    }
    try {
      finalContent = await nip04.encrypt(privKeyHex, recipientPubKey, content);
      eventTags.push(['p', recipientPubKey]); // NIP-04 specifies 'p' tag for recipient
    } catch (e) {
      console.error("NIP-04 encryption failed:", e);
      throw new Error('Failed to encrypt message for NIP-04.');
    }
  }

  const eventTemplate: EventTemplate = {
    kind: 1, // Text note
    created_at: Math.floor(Date.now() / 1000),
    tags: eventTags,
    content: finalContent,
    pubkey: pubKeyHex, // This will be overridden by signEvent using the private key's public key
  };

  // Sign the event (this also calculates ID and sets pubkey)
  const signedEvent = signEvent(eventTemplate, privKeyHex);

  try {
    const pub = currentRelay.publish(signedEvent);
    await new Promise((resolve, reject) => {
        pub.on('ok', () => {
            console.log('Nostr event published successfully.');
            resolve(true);
        });
        pub.on('failed', (reason: any) => {
            console.error('Failed to publish Nostr event:', reason);
            reject(new Error(`Failed to publish Nostr event: ${reason}`));
        });
        // Add a timeout?
        setTimeout(() => reject(new Error("Publish timeout")), 10000);
    });
    return signedEvent;
  } catch (error) {
    console.error('Error publishing Nostr event:', error);
    throw error; // Re-throw to be caught by caller
  }
};

// Helper to check if Nostr is configured sufficiently for sharing
export const isNostrConfigured = async (): Promise<boolean> => {
    const settings = await db.settings.get(1);
    const privKey = await settingsService.getNostrPrivKey();
    return !!(settings?.nostrRelayUrl && privKey);
};

// For NIP-19 (bech32) encoding/decoding, if needed for display or input
export const npubToHex = (npub: string): string => {
    try {
        const { type, data } = nip19.decode(npub);
        if (type === 'npub') return data as string;
    } catch (e) {
        console.error("Failed to decode npub:", e);
    }
    throw new Error('Invalid npub string');
};

export const nsecToHex = (nsec: string): string => {
     try {
        const { type, data } = nip19.decode(nsec);
        if (type === 'nsec') return data as string;
    } catch (e) {
        console.error("Failed to decode nsec:", e);
    }
    throw new Error('Invalid nsec string');
};

export const pubKeyToNpub = (hex: string): string => {
    return nip19.npubEncode(hex);
};

export const privKeyToNsec = (hex: string): string => {
    return nip19.nsecEncode(hex);
};


// --- Future: Contact/Profile Management (as special Notes) ---
// This would involve:
// 1. Defining a special structure/tag for Profile Notes (e.g., kind: 0 for metadata, or custom tags on kind: 1)
// 2. Service functions to CRUD these Profile Notes.
// 3. UI in the Sidebar/dedicated area to list and manage contacts.
// 4. When sharing privately, a way to select contacts (their pubkeys) from these Profile Notes.

// Example: Storing a contact's profile (NIP-01 metadata) as a special note
// This is a conceptual placeholder.
/*
export const saveContactProfileNote = async (profileEvent: Event) => {
  if (profileEvent.kind !== 0) throw new Error("Not a NIP-01 profile event");
  const content = JSON.parse(profileEvent.content);
  const title = content.name || content.displayName || profileEvent.pubkey.substring(0, 10);

  // Could use a special tag like '#nostrProfile' or a dedicated field in the Note interface
  const noteContent = `Nostr Profile for ${title}\n\n${JSON.stringify(content, null, 2)}`;
  const tags = ['#nostrProfile', `#npub:${nip19.npubEncode(profileEvent.pubkey)}`];

  // Check if a profile note for this pubkey already exists and update it, or create new.
  // This requires querying notes, perhaps by a unique tag.
  // await noteService.createNote(title, noteContent, tags);
};
*/

// Placeholder for fetching NIP-05 identifiers if needed (requires async network call)
// export const resolveNip05Identifier = async (identifier: string): Promise<string | null> => { ... }


console.log("NostrService loaded. Ensure relay and keys are configured in Settings.");
