import { db, NostrProfileNote } from '../db/db';
import { Event, nip19, Filter } from 'nostr-tools';
import * as nostrService from './nostrService'; // For relay connection using SimplePool
import { queryProfile as nip05QueryProfile } from 'nostr-tools/nip05'; // NIP-05 utility
import { Observable } from 'dexie'; // Added for searchProfiles return type
import * as tagPageService from './tagPageService'; // Import tagPageService

// Define a placeholder ID for the 'nostrProfile' tag.
// This is a convention to ensure a consistent tag for all Nostr profiles.
// In a real app, you might want to ensure this tag is created on first run.
export const NOSTR_PROFILE_TAG_NAME = 'nostrProfile';
let nostrProfileTagPageId: number | null = null;

// Function to get or create the 'nostrProfile' tag page ID
async function getOrCreateNostrProfileTagPageId(): Promise<number> {
  if (nostrProfileTagPageId !== null) {
    return nostrProfileTagPageId;
  }
  const tagPage = await tagPageService.getTagPageByName(NOSTR_PROFILE_TAG_NAME, true);
  if (tagPage && tagPage.id) {
    nostrProfileTagPageId = tagPage.id;
    return tagPage.id;
  }
  // This should ideally not happen if createIfNotExist is true and DB is writable
  throw new Error(`Failed to get or create tag page for '${NOSTR_PROFILE_TAG_NAME}'`);
}


export const createOrUpdateProfileNote = async (
  profileData: Partial<NostrProfileNote>,
  npubToFetch?: string,
  fetchFromRelay: boolean = true, // Added flag to control fetching
): Promise<number | undefined> => {
  let existingProfile: NostrProfileNote | undefined;
  const targetNpub = profileData.npub || npubToFetch;

  if (!targetNpub) {
    throw new Error('npub is required to create or update a profile note.');
  }

  existingProfile = await getProfileNoteByNpub(targetNpub);

  let fetchedProfileData: Partial<NostrProfileNote> = {};
  // Fetch if new, or last check > 1 day ago, or if explicitly told to fetch (and npubToFetch is provided)
  let shouldFetch = fetchFromRelay && npubToFetch &&
    (!existingProfile || !existingProfile.lastChecked || Date.now() - existingProfile.lastChecked.getTime() > 24 * 60 * 60 * 1000);

  if (shouldFetch) {
    try {
      const fetched = await fetchProfileFromRelays(targetNpub); // Uses SimplePool via nostrService
      if (fetched) {
        fetchedProfileData = {
          name: fetched.name,
          picture: fetched.picture,
          about: fetched.about,
          nip05: fetched.nip05,
          lastChecked: new Date(),
          // nip05Verified and nip05VerifiedAt would be set here if verification is done during fetch
        };
        // If NIP-05 is present, try to verify it
        if (fetched.nip05) {
            const verificationResult = await verifyNip05(targetNpub, fetched.nip05);
            fetchedProfileData.nip05Verified = verificationResult.verified;
            fetchedProfileData.nip05VerifiedAt = new Date();
        }

      } else {
        fetchedProfileData.lastChecked = new Date(); // Mark as checked even if not found
      }
    } catch (error) {
      console.error(`Failed to fetch profile for ${targetNpub}:`, error);
      fetchedProfileData.lastChecked = new Date(); // Mark as checked even on error
    }
  } else if (npubToFetch) {
    // If not fetching, but npubToFetch was provided, still mark as checked if it's an update based on external data
    fetchedProfileData.lastChecked = existingProfile?.lastChecked || new Date();
  }


  const finalProfileData: NostrProfileNote = {
    ...(existingProfile || {}), // Base with existing data or empty object
    ...fetchedProfileData,      // Apply fetched data (includes lastChecked, potentially NIP-05 verification)
    ...profileData,            // Apply provided data (overrides fetched if conflicts, e.g. local alias)
    npub: targetNpub,          // Ensure npub is set
    updatedAt: new Date(),
  };

  // Ensure essential Note fields if creating new
  if (!existingProfile) {
    finalProfileData.title = profileData.title || fetchedProfileData.name || targetNpub.substring(0, 10);
    finalProfileData.content = profileData.content || fetchedProfileData.about || ''; // Local notes content
    finalProfileData.createdAt = new Date();
  } else {
    // If we fetched new data and the user didn't provide a specific title/content, update them from profile
    // Only update title from fetched name if title wasn't explicitly provided in profileData
    if (fetchedProfileData.name && !profileData.title && finalProfileData.title === (existingProfile.title || existingProfile.npub.substring(0,10))) {
        finalProfileData.title = fetchedProfileData.name;
    }
    // Only update content from fetched about if content wasn't explicitly provided in profileData
     if (fetchedProfileData.about && !profileData.content && finalProfileData.content === existingProfile.content) {
        finalProfileData.content = fetchedProfileData.about; // Local notes content can mirror 'about' if not set
    }
  }

  // Ensure 'nostrProfile' tag is always present for NostrProfileNotes
  const nostrProfileTagId = await getOrCreateNostrProfileTagPageId();
  const currentTagPageIds = new Set(finalProfileData.tagPageIds || []);
  currentTagPageIds.add(nostrProfileTagId);
  finalProfileData.tagPageIds = Array.from(currentTagPageIds);


  if (existingProfile?.id) {
    await db.nostrProfiles.update(existingProfile.id, finalProfileData);
    return existingProfile.id;
  } else {
    const { id, ...dataToInsert } = finalProfileData; // Ensure no 'id' is passed for new entries
    return db.nostrProfiles.add(dataToInsert as NostrProfileNote);
  }
};

export const getProfileNoteByNpub = (npub: string): Promise<NostrProfileNote | undefined> => {
  return db.nostrProfiles.where('npub').equals(npub).first();
};

export const getProfileNoteById = (id: number): Promise<NostrProfileNote | undefined> => {
  return db.nostrProfiles.get(id);
};

import { liveQuery } from 'dexie'; // Ensure liveQuery is imported

export const getAllProfileNotes = () => {
  return liveQuery(() =>
    db.nostrProfiles.orderBy('name').toArray()
    .then(profiles => profiles.sort((a, b) => { // Sorting here as orderBy might not cover all cases of name/title/npub
      const nameA = a.name || a.title || a.npub;
      const nameB = b.name || b.title || b.npub;
      return nameA.localeCompare(nameB);
    }))
  );
};

// Function to get NostrProfileNotes by a specific TagPage ID
export const getNostrProfilesByTagPageId = (tagPageId: number) => {
  return liveQuery(() => // Wrap in liveQuery for consistency
    db.nostrProfiles
      .where('tagPageIds')
      .equals(tagPageId)
      .toArray()
      .then(profiles => profiles.sort((a, b) => {
        const nameA = a.name || a.title || a.npub;
        const nameB = b.name || b.title || b.npub;
        return nameA.localeCompare(nameB);
      }))
  );
};

export const deleteProfileNoteById = (id: number): Promise<void> => {
  return db.nostrProfiles.delete(id);
};

export const deleteProfileNoteByNpub = async (npub: string): Promise<boolean> => {
    const profile = await getProfileNoteByNpub(npub);
    if (profile && profile.id) {
        await db.nostrProfiles.delete(profile.id);
        return true;
    }
    return false;
};

// Fetches Kind 0 profile event from configured relays using SimplePool
export const fetchProfileFromRelays = async (
  npub: string,
): Promise<Partial<NostrProfileNote> | null> => {
  const pubkeyHex = nostrService.npubToHex(npub);
  if (!pubkeyHex) {
    console.error("Invalid npub provided for profile fetch:", npub);
    return null;
  }

  // Ensure relay pool is using current settings (nostrService handles this)
  if (!await nostrService.ensureRelayPoolConnected()) {
     console.warn('Cannot fetch profile, relays not configured/connected for npub:', npub);
     return null;
  }

  const filter: Filter = { kinds: [0], authors: [pubkeyHex], limit: 1 };

  try {
    // nostrService.fetchEvents will use SimplePool.list()
    // SimplePool.list usually returns the most recent events first by default if supported by relays.
    // We ask for one event, expecting it to be the latest kind 0.
    const events = await nostrService.fetchEvents([filter]);
    if (events && events.length > 0) {
      // Assuming the first event is the latest/most relevant due to limit:1 and typical relay behavior
      const event = events.sort((a,b) => b.created_at - a.created_at)[0];
      if (event.kind === 0) {
        const profileContent = JSON.parse(event.content);
        return {
          npub: npub,
          name: profileContent.name || profileContent.display_name || profileContent.displayName,
          picture: profileContent.picture,
          about: profileContent.about,
          nip05: profileContent.nip05,
          // Other NIP-01 fields can be extracted here
        };
      }
    }
    console.log(`No kind 0 profile event found for ${npub} on configured relays.`);
    return null;
  } catch (error) {
    console.error(`Error fetching profile for ${npub} from relays:`, error);
    return null;
  }
};

// Verifies NIP-05 identifier and returns the pubkey if valid
export const verifyNip05 = async (npubToVerify: string, nip05Identifier: string): Promise<{verified: boolean, pubkeyHex?: string | null}> => {
  if (!nip05Identifier || !nip05Identifier.includes('@')) {
    return { verified: false, pubkeyHex: null };
  }

  try {
    const profile = await nip05QueryProfile(nip05Identifier); // Uses nostr-tools/nip05
    if (profile && profile.pubkey) {
      const expectedPubkeyHex = nostrService.npubToHex(npubToVerify);
      if (profile.pubkey === expectedPubkeyHex) {
        console.log(`NIP-05 verified for ${nip05Identifier} (pubkey: ${profile.pubkey})`);
        return { verified: true, pubkeyHex: profile.pubkey };
      } else {
        console.warn(`NIP-05 mismatch for ${nip05Identifier}: expected ${expectedPubkeyHex}, got ${profile.pubkey}`);
        return { verified: false, pubkeyHex: profile.pubkey };
      }
    } else {
      console.warn(`NIP-05 lookup failed for ${nip05Identifier} or no pubkey returned.`);
      return { verified: false, pubkeyHex: null };
    }
  } catch (error) {
    console.error(`Error verifying NIP-05 ${nip05Identifier}:`, error);
    return { verified: false, pubkeyHex: null };
  }
};


// Old resolveNip05ToNpub, can be deprecated or refactored to use verifyNip05
export const resolveNip05ToNpub = async (nip05Identifier: string): Promise<string | null> => {
  if (!nip05Identifier.includes('@')) return null;
  const [name, domain] = nip05Identifier.split('@');

  try {
    const response = await fetch(`https://${domain}/.well-known/nostr.json?name=${name}`);
    if (!response.ok) {
      console.error(`NIP-05 lookup failed for ${nip05Identifier}: ${response.status}`);
      return null;
    }
    const data = await response.json();
    const pubkeyHex = data.names?.[name];
    if (pubkeyHex) {
      return nip19.npubEncode(pubkeyHex);
    }
  } catch (error) {
    console.error(`Error resolving NIP-05 ${nip05Identifier}:`, error);
  }
  return null;
};

export const searchProfiles = (term: string): Observable<NostrProfileNote[]> => {
  if (!term.trim()) {
    // If the term is empty, return all profiles, consistent with how getAllProfileNotes works.
    // Or, if getAllProfileNotes already returns an Observable, we can directly return its call.
    // Assuming getAllProfileNotes() returns liveQuery observable.
    return getAllProfileNotes();
  }
  const lowerTerm = term.toLowerCase();
  return liveQuery(() =>
    db.nostrProfiles
      .filter(profile =>
        (profile.name && profile.name.toLowerCase().includes(lowerTerm)) ||
        (profile.title && profile.title.toLowerCase().includes(lowerTerm)) || // Search by local title/alias
        (profile.npub && profile.npub.toLowerCase().includes(lowerTerm)) ||
        (profile.about && profile.about.toLowerCase().includes(lowerTerm)) || // Search by about content
        (profile.nip05 && profile.nip05.toLowerCase().includes(lowerTerm))    // Search by NIP-05
      )
      .toArray()
      .then(profiles => profiles.sort((a, b) => { // Sort results
        const nameA = a.name || a.title || a.npub;
        const nameB = b.name || b.title || b.npub;
        return nameA.localeCompare(nameB);
      }))
  );
};
