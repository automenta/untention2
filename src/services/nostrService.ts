import {
  Event,
  EventTemplate,
  nip04,
  nip19,
  // getPublicKey, // No longer used directly in this file
  SimplePool,
  Filter,
  finalizeEvent
  // relayInit, // Not used with SimplePool typically, and might be from older nostr-tools
  // Relay // Type not used directly
} from 'nostr-tools';
import * as settingsService from './settingsService';
import { db } from '../db/db';

// Helper function to convert hex string to Uint8Array
function hexToUint8Array(hexString: string): Uint8Array {
  if (hexString.length % 2 !== 0) {
    // Ensure even length for valid hex string
    console.error("Invalid hex string: must have an even number of characters.", hexString);
    throw new Error("Invalid hex string format.");
  }
  const byteArray = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    byteArray[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    if (isNaN(byteArray[i/2])) {
        console.error("Invalid character in hex string:", hexString);
        throw new Error("Invalid character in hex string.");
    }
  }
  return byteArray;
}

// Helper function to convert Uint8Array to hex string (Commented out as it seems unused due to nostr-tools types)
// function uint8ArrayToHex(bytes: Uint8Array): string {
//   return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
// }

// Initialize a single SimplePool instance
const pool = new SimplePool();

// Keep track of the relay URLs currently configured for the pool
let currentRelayUrls: string[] = [];

// Function to get the configured relay URLs from settings
const getConfiguredRelayUrls = async (): Promise<string[]> => {
  const settings = await db.settings.get(1);
  if (settings?.nostrRelayUrl) {
    // SimplePool expects an array of URLs
    return settings.nostrRelayUrl.split(',').map(url => url.trim()).filter(url => url);
  }
  return [];
};

// Ensures the pool is connected to the currently configured relays
// This should be called before operations that require relay interaction if relays might have changed.
export const ensureRelayPoolConnected = async () => {
  const newRelayUrls = await getConfiguredRelayUrls();

  // Check if relay configuration has changed
  const urlsChanged =
    newRelayUrls.length !== currentRelayUrls.length ||
    newRelayUrls.some(url => !currentRelayUrls.includes(url));

  if (urlsChanged) {
    console.log('Relay configuration changed. Updating pool connections.');
    // Close connections to old relays not in the new list (SimplePool doesn't explicitly support removing relays,
    // but it handles disconnections gracefully. Re-creating or re-ensuring might be an option if issues arise)
    // For now, SimplePool's ensureRelay method will handle new connections.
    // We might need to close all connections if a relay is removed, though SimplePool aims to simplify this.
    // pool.close(currentRelayUrls.filter(url => !newRelayUrls.includes(url))); // Not a direct API, manage manually if needed

    currentRelayUrls = newRelayUrls;
    // SimplePool's methods like .get, .list, .publish automatically manage connections
    // to relays passed to them or previously ensured.
    // We can "ensure" relays are known to the pool, though it typically connects on demand.
    // newRelayUrls.forEach(url => pool.ensureRelay(url)); // ensureRelay can be used to pre-connect or check status.
  }

  if (currentRelayUrls.length === 0) {
    console.warn('Nostr relay URLs not configured.');
    return false;
  }
  return true;
};

// Disconnects from all relays known to the pool.
export const disconnectRelayPool = async () => {
  if (currentRelayUrls.length > 0) {
    console.log(`Disconnecting from relays: ${currentRelayUrls.join(', ')}`);
    await pool.close(currentRelayUrls); // Pass current relays to close
    currentRelayUrls = [];
  }
};

// Generalized function to publish any event
export const publishEvent = async (eventTemplate: EventTemplate): Promise<Event | null> => {
  if (!await ensureRelayPoolConnected() || currentRelayUrls.length === 0) {
    throw new Error('Nostr relays not connected or configured.');
  }

  const privKeyHex = await settingsService.getNostrPrivKey();
  if (!privKeyHex) {
    throw new Error('Nostr private key not configured.');
  }

  // finalizeEvent calculates ID, sets pubkey, and signs the event
  const privKeyBytes = hexToUint8Array(privKeyHex);
  const signedEvent = finalizeEvent(eventTemplate, privKeyBytes);

  try {
    const pubs = pool.publish(currentRelayUrls, signedEvent);
    // Promise.any waits for the first successful publish, Promise.all waits for all
    // For simplicity, let's use Promise.all to try publishing to all configured relays
    // and consider it successful if at least one works. More robust error handling might be needed.
    const outcomes = await Promise.allSettled(pubs);

    const successful = outcomes.filter(o => o.status === 'fulfilled');
    if (successful.length > 0) {
      console.log(`Nostr event ${signedEvent.id} published successfully to at least one relay.`);
      return signedEvent;
    } else {
      const reasons = outcomes.filter(o => o.status === 'rejected').map((o: any) => o.reason);
      console.error('Failed to publish Nostr event to any relay:', reasons);
      throw new Error(`Failed to publish Nostr event: ${reasons.join(', ')}`);
    }
  } catch (error) {
    console.error('Error publishing Nostr event:', error);
    throw error;
  }
};


// Specific function for publishing a kind 1 note (replaces old publishNoteEvent)
export const publishKind1Note = async (content: string, tags: string[][] = []): Promise<Event | null> => {
    const privKeyHex = await settingsService.getNostrPrivKey();
    if (!privKeyHex) {
        throw new Error('Nostr private key not configured.');
    }
    // const pubKeyHex = getPublicKey(privKeyHex); // Unused

    const eventTemplate: EventTemplate = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: tags,
        content: content,
        // pubkey: pubKeyHex, // Removed: finalizeEvent sets this
    };
    return publishEvent(eventTemplate);
};

// Function to publish a kind 0 profile event
export const publishProfileEvent = async (profileContent: { name?: string, about?: string, picture?: string, nip05?: string, [key: string]: any }): Promise<Event | null> => {
  const privKeyHex = await settingsService.getNostrPrivKey();
  if (!privKeyHex) {
    throw new Error('Nostr private key not configured.');
  }
  // const pubKeyHex = getPublicKey(privKeyHex); // Unused

  const eventTemplate: EventTemplate = {
    kind: 0, // Profile metadata
    created_at: Math.floor(Date.now() / 1000),
    tags: [], // NIP-01 doesn't specify tags for kind 0, but some clients might use them
    content: JSON.stringify(profileContent),
    // pubkey: pubKeyHex, // Removed: finalizeEvent sets this
  };
  return publishEvent(eventTemplate);
};


// Function to send a NIP-04 encrypted direct message (Kind 4)
export const sendEncryptedDirectMessage = async (recipientPubKeyHex: string, plainText: string): Promise<Event | null> => {
  const privKeyHex = await settingsService.getNostrPrivKey();
  if (!privKeyHex) {
    throw new Error('Nostr private key not configured.');
  }
  // const pubKeyHex = getPublicKey(privKeyHex); // Not needed here, finalizeEvent uses privKeyHex

  // if (recipientPubKeyHex === pubKeyHex) { // This check is fine
  //   throw new Error('Cannot send NIP-04 encrypted message to self using this method.');
  // }

  let encryptedContent: string;
  try {
    const privKeyBytes = hexToUint8Array(privKeyHex);
    // recipientPubKeyHex is already hex, nip04.encrypt expects hex for recipient pubkey
    encryptedContent = nip04.encrypt(privKeyBytes, recipientPubKeyHex, plainText);
  } catch (e) {
    console.error("NIP-04 encryption failed:", e);
    throw new Error('Failed to encrypt message for NIP-04.');
  }

  const eventTemplate: EventTemplate = {
    kind: 4, // Encrypted Direct Message
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubKeyHex]], // NIP-04 specifies 'p' tag for recipient
    content: encryptedContent,
    // pubkey: pubKeyHex, // Removed: finalizeEvent sets this
  };
  return publishEvent(eventTemplate);
};


// Helper to check if Nostr is configured (private key and at least one relay URL)
export const isNostrUserConfigured = async (): Promise<boolean> => {
    const settings = await db.settings.get(1);
    const privKey = await settingsService.getNostrPrivKey();
    return !!(settings?.nostrRelayUrl && privKey);
};

// For NIP-19 (bech32) encoding/decoding, if needed for display or input
export const npubToHex = (npub: string): string => {
    try {
        const decoded = nip19.decode(npub);
        if (decoded.type === 'npub') {
            return decoded.data as unknown as string; // Force cast, assuming it's string
        }
    } catch (e) {
        console.error(`Failed to decode npub ${npub}:`, e);
    }
    throw new Error('Invalid npub string.');
};

export const nsecToHex = (nsec: string): string => {
     try {
        const decoded = nip19.decode(nsec);
        if (decoded.type === 'nsec') {
            return decoded.data as unknown as string; // Force cast, assuming it's string
        }
    } catch (e) {
        console.error(`Failed to decode nsec ${nsec}:`, e);
    }
    throw new Error('Invalid nsec string.');
};

export const pubKeyToNpub = (hex: string): string => {
    return nip19.npubEncode(hex);
};

export const privKeyToNsec = (hex: string): string => {
    return nip19.nsecEncode(hex);
};

// Function to fetch events using SimplePool's get method (for single event by ID)
export const fetchSingleEventById = async (eventId: string): Promise<Event | null> => {
  if (!await ensureRelayPoolConnected() || currentRelayUrls.length === 0) {
    console.warn('Nostr relays not configured or not connected.');
    return null;
  }
  try {
    // Note: SimplePool.get might take time or timeout if relay is slow or event doesn't exist.
    // Default timeout for SimplePool.get is rather short (around 3-4 seconds per relay).
    const event = await pool.get(currentRelayUrls, { ids: [eventId] });
    return event;
  } catch (error) {
    console.error(`Error fetching event ${eventId}:`, error);
    return null;
  }
};

// Function to fetch events using SimplePool's list method (for multiple events with filters)
export const fetchEvents = async (filters: Filter[]): Promise<Event[]> => {
  if (!await ensureRelayPoolConnected() || currentRelayUrls.length === 0) {
    console.warn('Nostr relays not configured or not connected.');
    return [];
  }
  try {
    // SimplePool.list will query all specified relays and return events.
    // It waits for EOSE from all relays or times out.
    const events = await (pool as any).list(currentRelayUrls, filters); // Cast pool to any for list method
    return events;
  } catch (error) {
    console.error('Error fetching events:', error);
    return [];
  }
};

// Function to publish a kind 3 contact list
export interface ContactListEntry {
  pubkey: string; // hex pubkey
  relay?: string; // recommended relay URL
  petname?: string; // local alias/petname for the contact
}
export const publishKind3ContactList = async (contacts: ContactListEntry[]): Promise<Event | null> => {
  const privKeyHex = await settingsService.getNostrPrivKey();
  if (!privKeyHex) {
    throw new Error('Nostr private key not configured.');
  }
  // const pubKeyHex = getPublicKey(privKeyHex); // Unused

  const tags: string[][] = contacts.map(contact => {
    const tag = ['p', contact.pubkey];
    if (contact.relay) {
      tag.push(contact.relay);
    } else {
      // NIP-02 states the third entry can be empty if no relay is recommended.
      // However, some clients might expect it. If petname is 4th, an empty relay might be needed.
      // For simplicity, if petname is to be the 4th element, and no relay, we might need an empty string.
      // Let's check NIP-02 again: ["p", <pubkey hex>, <main relay URL>, <petname>]
      // If only petname, then ["p", <pubkey hex>, "", <petname>] might be common.
      // If only relay, then ["p", <pubkey hex>, <main relay URL>]
      // If neither, just ["p", <pubkey hex>]
      // If both, ["p", <pubkey hex>, <main relay URL>, <petname>]
      // The nostr-tools `finalizeEvent` doesn't strictly enforce this structure for tags beyond the first two elements.
      // We will ensure the relay slot is present if a petname is, even if empty.
      if (contact.petname) tag.push(''); // Add empty string for relay if petname is present but relay is not
    }
    if (contact.petname) {
      tag.push(contact.petname);
    }
    return tag;
  });

  // NIP-02: "The kind 3 event content MAY be an empty string or a JSON object..."
  // For maximum compatibility, an empty string is safer if all info is in tags.
  // Some clients store {"<pubkey>": {"name": "<petname>", "relay": "<relay_url>"}} in content.
  // We will use an empty string for now, relying on tags.
  const eventTemplate: EventTemplate = {
    kind: 3,
    created_at: Math.floor(Date.now() / 1000),
    tags: tags,
    content: "", // Or JSON.stringify if choosing that format
    // pubkey: pubKeyHex, // Removed: finalizeEvent sets this
  };
  return publishEvent(eventTemplate);
};

// Function to fetch the latest kind 3 contact list for a user
export const fetchKind3ContactListEvent = async (pubkeyHex: string): Promise<Event | null> => {
  if (!pubkeyHex) {
    throw new Error('Pubkey is required to fetch contact list.');
  }
  const filters: Filter[] = [{ kinds: [3], authors: [pubkeyHex], limit: 1 }];
  const events = await fetchEvents(filters);
  if (events && events.length > 0) {
    // SimplePool.list should return events sorted by created_at descending by default from most relays.
    // To be sure, explicitly sort if necessary, though limit:1 on a replaceable event usually does the trick.
    return events.sort((a, b) => b.created_at - a.created_at)[0];
  }
  return null;
};

// Subscription to Direct Messages (Kind 4)
// This will be a long-lived subscription, so it needs careful management.
// It might be better managed within a React context or a dedicated Zustand/Redux store if complex.
// For now, a simple service-level subscription.

// Define a type for the callback that processes incoming DMs
export type DirectMessageCallback = (event: Event, decryptedContent: string, senderNpub: string) => void;

let dmSub: any | null = null; // Holds the SimplePool subscription object

export const subscribeToDirectMessages = async (
  myPubkeyHex: string,
  onDmReceived: DirectMessageCallback
): Promise<() => void> => {
  if (!myPubkeyHex) {
    console.warn("Cannot subscribe to DMs without user's public key.");
    return () => {}; // Return no-op cleanup
  }
  if (!await ensureRelayPoolConnected() || currentRelayUrls.length === 0) {
    console.warn('Nostr relays not configured or not connected for DM subscription.');
    return () => {};
  }

  // Unsubscribe from any existing DM subscription first
  if (dmSub) {
    console.log("Closing existing DM subscription before creating a new one.");
    dmSub.unsub();
    dmSub = null;
  }

  const privKeyHex = await settingsService.getNostrPrivKey();
  if (!privKeyHex) {
    console.warn("Private key not available, cannot decrypt incoming DMs.");
    // We can still subscribe, but won't be able to decrypt. Or choose not to subscribe.
    // For now, proceed with subscription, decryption will fail gracefully.
  }

  const dmFilters: Filter[] = [
    { kinds: [4], '#p': [myPubkeyHex], since: Math.floor(Date.now() / 1000) - (60*60*24*1) } // Filter for DMs to me in the last day
    // Potentially also subscribe to DMs I sent, if needed for sync across devices, though usually not required just for receiving.
    // { kinds: [4], authors: [myPubkeyHex], since: ... }
  ];

  console.log(`Subscribing to Kind 4 DMs for pubkey: ${myPubkeyHex} on relays: ${currentRelayUrls.join(', ')}`);

  dmSub = pool.subscribeMany(
    currentRelayUrls,
    dmFilters,
    {
      onevent: async (event: Event) => {
        console.log("Received potential DM event:", event);
        // Ensure it's a kind 4 and has a 'p' tag (though filter should handle this)
        if (event.kind === 4 && event.tags.some(tag => tag[0] === 'p' && tag[1] === myPubkeyHex)) {
          // This event is addressed to me. The sender is event.pubkey.
          const senderHex = event.pubkey;

          if (!privKeyHex) {
            console.warn(`Received DM (id: ${event.id}) but cannot decrypt, private key missing.`);
            // onDmReceived(event, "[Encrypted - Private Key Missing]", pubKeyToNpub(senderHex));
            return;
          }

          try {
            const privKeyBytes = hexToUint8Array(privKeyHex);
            // senderHex is already hex, nip04.decrypt expects hex for sender pubkey
            const decryptedContent = nip04.decrypt(privKeyBytes, senderHex, event.content);
            console.log(`Decrypted DM from ${pubKeyToNpub(senderHex)}:`, decryptedContent);
            onDmReceived(event, decryptedContent, pubKeyToNpub(senderHex));
          } catch (e) {
            console.error(`Failed to decrypt DM (id: ${event.id}) from ${pubKeyToNpub(senderHex)}:`, e);
            // onDmReceived(event, "[Decryption Failed]", pubKeyToNpub(senderHex));
          }
        } else if (event.kind === 4 && event.pubkey === myPubkeyHex) {
            // This is a DM I sent. We might want to process this if we need to sync sent messages
            // that were published by another client. For now, focusing on receiving.
            // The 'p' tag will point to the recipient.
            const recipientTag = event.tags.find(tag => tag[0] === 'p');
            if (recipientTag && recipientTag[1] && privKeyHex) {
                try {
                    const privKeyBytes = hexToUint8Array(privKeyHex);
                    // recipientTag[1] is already hex
                    const decryptedContent = nip04.decrypt(privKeyBytes, recipientTag[1], event.content);
                    console.log(`Received self-sent DM (id: ${event.id}) to ${pubKeyToNpub(recipientTag[1])}:`, decryptedContent);
                    // Typically, the onDmReceived callback would handle saving to DB.
                    // The callback needs to know it's a self-sent message.
                    // For now, let's assume onDmReceived is primarily for incoming messages from others.
                    // Or, the callback can differentiate.
                } catch (e) {
                     console.error(`Failed to decrypt self-sent DM (id: ${event.id}):`, e);
                }
            }
        }
      },
      oneose: () => {
        console.log(`DM subscription EOSE received for pubkey ${myPubkeyHex}. Listening for real-time DMs.`);
      },
      onclose: (reason: any) => {
        console.log(`DM subscription closed for pubkey ${myPubkeyHex}. Reason:`, reason);
      }
    }
  );

  // Return an unsubscribe function
  return () => {
    if (dmSub) {
      console.log(`Unsubscribing from DMs for pubkey: ${myPubkeyHex}`);
      dmSub.unsub();
      dmSub = null;
    }
  };
};


console.log("NostrService loaded. Ensure relay and keys are configured in Settings.");
