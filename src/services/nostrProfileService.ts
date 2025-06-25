import { db, NostrProfileNote } from '../db/db';
import { Relay, Event, nip19, Filter } from 'nostr-tools';
import * as nostrService from './nostrService'; // For relay connection
import { getNoteById, updateNote as updateGenericNote, createNote as createGenericNote } from './noteService'; // For potential note linking if needed

const PROFILE_FETCH_TIMEOUT_MS = 5000; // 5 seconds timeout for fetching profile

export const createOrUpdateProfileNote = async (
  profileData: Partial<NostrProfileNote>,
  npubToFetch?: string
): Promise<number | undefined> => {
  let existingProfile: NostrProfileNote | undefined;
  const targetNpub = profileData.npub || npubToFetch;

  if (!targetNpub) {
    throw new Error('npub is required to create or update a profile note.');
  }

  existingProfile = await getProfileNoteByNpub(targetNpub);

  let fetchedProfileData: Partial<NostrProfileNote> = {};
  let shouldFetch = !existingProfile || (existingProfile && (!existingProfile.lastChecked || Date.now() - existingProfile.lastChecked.getTime() > 24 * 60 * 60 * 1000)); // Fetch if new or last check > 1 day ago

  if (npubToFetch && shouldFetch) {
    try {
      const settings = await db.settings.get(1);
      if (settings?.nostrRelayUrl) {
        const fetched = await fetchProfileFromRelay(targetNpub, settings.nostrRelayUrl);
        if (fetched) {
          fetchedProfileData = {
            name: fetched.name,
            picture: fetched.picture,
            about: fetched.about,
            nip05: fetched.nip05,
            lastChecked: new Date(),
          };
        } else {
          fetchedProfileData.lastChecked = new Date(); // Mark as checked even if not found
        }
      } else {
        console.warn("No Nostr relay configured to fetch profile for", targetNpub);
        fetchedProfileData.lastChecked = new Date(); // Mark as checked
      }
    } catch (error) {
      console.error(`Failed to fetch profile for ${targetNpub}:`, error);
      fetchedProfileData.lastChecked = new Date(); // Mark as checked even on error
    }
  }

  const finalProfileData: NostrProfileNote = {
    ...(existingProfile || {}), // Base with existing data or empty object
    ...fetchedProfileData,      // Apply fetched data
    ...profileData,            // Apply provided data (overrides fetched if conflicts)
    npub: targetNpub,          // Ensure npub is set
    updatedAt: new Date(),
  };

  // Ensure essential Note fields if creating new
  if (!existingProfile) {
    finalProfileData.title = profileData.title || fetchedProfileData.name || targetNpub.substring(0, 10);
    finalProfileData.content = profileData.content || fetchedProfileData.about || '';
    finalProfileData.tags = profileData.tags || ['nostrProfile'];
    finalProfileData.createdAt = new Date();
  } else {
    // If we fetched new data and the user didn't provide a specific title/content, update them from profile
    if (fetchedProfileData.name && !profileData.title) finalProfileData.title = fetchedProfileData.name;
    if (fetchedProfileData.about && !profileData.content) finalProfileData.content = fetchedProfileData.about;
  }


  if (existingProfile?.id) {
    await db.nostrProfiles.update(existingProfile.id, finalProfileData);
    return existingProfile.id;
  } else {
    // Remove id if it somehow got on finalProfileData from spread
    const { id, ...dataToInsert } = finalProfileData;
    return db.nostrProfiles.add(dataToInsert as NostrProfileNote);
  }
};

export const getProfileNoteByNpub = (npub: string): Promise<NostrProfileNote | undefined> => {
  return db.nostrProfiles.where('npub').equals(npub).first();
};

export const getProfileNoteById = (id: number): Promise<NostrProfileNote | undefined> => {
  return db.nostrProfiles.get(id);
};

export const getAllProfileNotes = () => {
  return db.nostrProfiles.orderBy('name').toArray(); // Simple array, can use liveQuery in component
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

export const fetchProfileFromRelay = async (
  npub: string,
  relayUrl?: string // Optional: if not provided, uses configured relay
): Promise<Partial<NostrProfileNote> | null> => {
  let relayToUse: Relay | null = null;
  let tempRelay = false;

  const pubkeyHex = nostrService.npubToHex(npub);

  if (relayUrl) {
    try {
      relayToUse = await Relay.connect(relayUrl);
      tempRelay = true;
    } catch (e) {
      console.error(`Temporary connection to ${relayUrl} failed for profile fetch:`, e);
      return null;
    }
  } else {
    relayToUse = await nostrService.getRelay();
  }

  if (!relayToUse) {
    console.warn('No relay available to fetch Nostr profile for', npub);
    return null;
  }

  try {
    const filter: Filter = { kinds: [0], authors: [pubkeyHex], limit: 1 };
    const event = await new Promise<Event | null>((resolve, reject) => {
      const sub = relayToUse!.subscribe([filter], {
        onevent: (event: Event) => {
          resolve(event);
          sub.close();
        },
        oneose: () => {
          resolve(null); // EOSE means no event found
          sub.close();
        },
        // TODO: Add onclosed, onerror?
      });
      setTimeout(() => {
        sub.close();
        reject(new Error('Profile fetch timed out'));
      }, PROFILE_FETCH_TIMEOUT_MS);
    });

    if (event && event.kind === 0) {
      const profileContent = JSON.parse(event.content);
      return {
        npub: npub, // ensure npub is part of the returned object
        name: profileContent.name || profileContent.display_name || profileContent.displayName,
        picture: profileContent.picture,
        about: profileContent.about,
        nip05: profileContent.nip05,
        // Potentially add: website, lud06, lud16 from profileContent
      };
    }
    return null;
  } catch (error) {
    console.error(`Error fetching profile for ${npub} from ${relayToUse.url}:`, error);
    return null;
  } finally {
    if (tempRelay && relayToUse) {
      await relayToUse.close();
    }
  }
};

// Helper to convert NIP-05 to npub (basic, needs more robust validation and error handling)
// This is a placeholder for more complex NIP-05 resolution logic
export const resolveNip05ToNpub = async (nip05Identifier: string, relayUrl?: string): Promise<string | null> => {
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
