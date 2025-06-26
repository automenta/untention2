import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, NostrProfileNote } from '../db/db';
import * as nostrService from '../services/nostrService';
import * as settingsService from '../services/settingsService';
import * as nostrProfileService from '../services/nostrProfileService';
import { nip19 } from 'nostr-tools/nip19';
import { Event } from 'nostr-tools/pure';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, ArrowPathIcon, UserPlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface NostrContactsManagerProps {
  userNpub: string; // User's own npub
  onClose: () => void;
}

const NostrContactsManager: React.FC<NostrContactsManagerProps> = ({ userNpub, onClose }) => {
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [newContactNpub, setNewContactNpub] = useState('');
  const [newContactPetname, setNewContactPetname] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const contacts = useLiveQuery(
    () => db.nostrProfiles.where('isContact').equals(1).sortBy('title'),
    []
  ) || [];

  const userHexPubkey = userNpub ? nostrService.npubToHex(userNpub) : '';

  const showMessage = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleFetchContactsFromRelay = useCallback(async () => {
    if (!userHexPubkey) {
      showMessage('error', 'User public key not available.');
      return;
    }
    setIsLoading(true);
    showMessage('success', 'Fetching contact list from relay...');
    try {
      const kind3Event = await nostrService.fetchKind3ContactListEvent(userHexPubkey);
      if (kind3Event && kind3Event.tags) {
        let contactsProcessed = 0;
        for (const tag of kind3Event.tags) {
          if (tag[0] === 'p' && tag[1]) {
            const contactHexPubkey = tag[1];
            const contactNpub = nip19.npubEncode(contactHexPubkey);
            const relayUrl = tag[2] || undefined; // NIP-02: recommended relay URL
            const petname = tag[3] || undefined; // NIP-02: petname

            await nostrProfileService.createOrUpdateProfileNote(
              {
                npub: contactNpub,
                title: petname || contactNpub.substring(0,10), // Use petname as title if available
                // We could store relayUrl from kind3 if desired, e.g. in a custom field or local notes.
              },
              contactNpub, // npubToFetch for potential kind0 lookup
              true // fetch their kind0 if stale
            );
            contactsProcessed++;
          }
        }
        showMessage('success', `Contact list fetched. ${contactsProcessed} contacts processed.`);
      } else {
        showMessage('success', 'No contact list (Kind 3) found on relay or it was empty.');
      }
    } catch (error: any) {
      showMessage('error', `Failed to fetch contacts: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [userHexPubkey]);

  const handlePublishContactsToRelay = async () => {
    if (!contacts || contacts.length === 0) {
      showMessage('error', 'No contacts to publish. Add some contacts first.');
      return;
    }
    setIsLoading(true);
    showMessage('success', 'Publishing contact list to relay...');
    try {
      const contactListEntries: nostrService.ContactListEntry[] = contacts.map(c => ({
        pubkey: nostrService.npubToHex(c.npub),
        petname: c.title !== c.npub.substring(0,10) ? c.title : (c.name || undefined), // Use local title as petname
        // TODO: Add relay hint if stored
      }));
      const publishedEvent = await nostrService.publishKind3ContactList(contactListEntries);
      if (publishedEvent) {
        showMessage('success', 'Contact list published successfully!');
      } else {
        showMessage('error', 'Failed to publish contact list.');
      }
    } catch (error: any) {
      showMessage('error', `Error publishing contacts: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddContact = async () => {
    if (!newContactNpub.trim()) {
      showMessage('error', 'Contact npub or nprofile cannot be empty.');
      return;
    }
    let npubToAdd = newContactNpub.trim();
    let hexPubkeyToAdd = '';

    try {
        if (npubToAdd.startsWith('nprofile')) {
            const decoded = nip19.decode(npubToAdd);
            if (decoded.type === 'nprofile' && decoded.data.pubkey) {
                hexPubkeyToAdd = decoded.data.pubkey;
                npubToAdd = nip19.npubEncode(hexPubkeyToAdd);
            } else {
                throw new Error('Invalid nprofile format');
            }
        } else if (npubToAdd.startsWith('npub')) {
            hexPubkeyToAdd = nip19.decode(npubToAdd).data as string;
        } else {
             // Assume it's a hex pubkey if not npub/nprofile
            if (npubToAdd.match(/^[a-f0-9]{64}$/)) {
                hexPubkeyToAdd = npubToAdd;
                npubToAdd = nip19.npubEncode(hexPubkeyToAdd);
            } else {
                throw new Error('Invalid public key format. Use npub, nprofile, or hex.');
            }
        }

        // Check if contact already exists
        const existing = await nostrProfileService.getProfileNoteByNpub(npubToAdd);
        if (existing && existing.isContact) {
            showMessage('error', 'This contact is already in your list.');
            return;
        }

        await nostrProfileService.createOrUpdateProfileNote(
            {
                npub: npubToAdd,
                title: newContactPetname.trim() || npubToAdd.substring(0,10),
                isContact: true
            },
            npubToAdd,
            true // Fetch profile info
        );
        showMessage('success', `Contact ${newContactPetname || npubToAdd.substring(0,10)} added.`);
        setNewContactNpub('');
        setNewContactPetname('');
    } catch (error: any) {
        showMessage('error', `Failed to add contact: ${error.message}`);
    }
  };

  const handleRemoveContact = async (profileId: number, npub: string) => {
    try {
      // Just mark as not a contact, don't delete the profile entry unless desired
      // await nostrProfileService.deleteProfileNoteById(profileId);
      const profile = await db.nostrProfiles.get(profileId);
      if (profile) {
        await db.nostrProfiles.update(profileId, { isContact: false, updatedAt: new Date() });
        showMessage('success', `Contact ${profile.title || profile.name} removed from list.`);
        // Advise user to republish their list
        setStatusMessage({type: 'success', text: `Contact ${profile.title || profile.name} removed. Publish your list to update relays.`});

      }
    } catch (error: any) {
      showMessage('error', `Failed to remove contact: ${error.message}`);
    }
    };

  const handleDownloadContacts = () => {
    if (!contacts || contacts.length === 0) {
      showMessage('error', 'No contacts to download.');
      return;
    }
    const contactListEntries: nostrService.ContactListEntry[] = contacts.map(c => ({
        pubkey: nostrService.npubToHex(c.npub),
        petname: c.title !== c.npub.substring(0,10) ? c.title : (c.name || undefined),
         // relay: c.relayHint || undefined, // TODO: store relay hints
    }));
     const kind3EventDraft: Event = { // Not fully signed, just for JSON structure
        kind: 3,
        created_at: Math.floor(Date.now() / 1000),
        tags: contactListEntries.map(contact => {
            const tag = ['p', contact.pubkey];
            if (contact.relay) tag.push(contact.relay);
            else if (contact.petname) tag.push('');
            if (contact.petname) tag.push(contact.petname);
            return tag;
        }),
        content: "",
        pubkey: userHexPubkey, // placeholder
        id: '', // placeholder
        sig: '', // placeholder
    };

    const jsonStr = JSON.stringify(kind3EventDraft, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nostr_contacts_kind3.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showMessage('success', 'Contacts JSON download initiated.');
  };

  const handleUploadContacts = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.kind !== 3 || !Array.isArray(json.tags)) {
          throw new Error('Invalid Kind 3 event format.');
        }
        setIsLoading(true);
        let contactsProcessed = 0;
        for (const tag of json.tags) {
          if (tag[0] === 'p' && tag[1]) {
            const contactHexPubkey = tag[1];
            const contactNpub = nip19.npubEncode(contactHexPubkey);
            const relayUrl = tag[2] || undefined;
            const petname = tag[3] || undefined;

            await nostrProfileService.createOrUpdateProfileNote(
              { npub: contactNpub, title: petname || contactNpub.substring(0,10), isContact: true },
              contactNpub,
              true
            );
            contactsProcessed++;
          }
        }
        showMessage('success', `Imported ${contactsProcessed} contacts from JSON. Consider publishing your list.`);
        setIsLoading(false);
      } catch (error: any) {
        showMessage('error', `Error importing contacts: ${error.message}`);
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
  };

  const handleRefreshAllContactProfiles = async () => {
    if (contacts.length === 0) {
      showMessage('error', "No contacts to refresh.");
      return;
    }
    setIsLoading(true);
    showMessage('success', `Refreshing profiles for ${contacts.length} contact(s)...`);
    let successCount = 0;
    let failCount = 0;

    for (const contact of contacts) {
      try {
        // Use createOrUpdateProfileNote with fetchFromRelay = true to force a fetch if stale or not recently checked.
        // The service function itself checks the lastChecked time.
        await nostrProfileService.createOrUpdateProfileNote(
          { npub: contact.npub }, // Minimal data, mainly to trigger the fetch logic
          contact.npub,
          true // Explicitly request fetch from relay
        );
        successCount++;
      } catch (error) {
        console.error(`Failed to refresh profile for ${contact.npub}:`, error);
        failCount++;
      }
    }
    setIsLoading(false);
    showMessage('success', `Profile refresh complete. ${successCount} succeeded, ${failCount} failed.`);
  };


  useEffect(() => {
    // Optionally auto-fetch contacts when component mounts if list is empty and user is set
    if (userHexPubkey && (!contacts || contacts.length === 0)) {
      // handleFetchContactsFromRelay(); // Decide if auto-fetch is desired
    }
  }, [userHexPubkey, contacts, handleFetchContactsFromRelay]);


  return (
    <div className="p-4 md:p-6 bg-white dark:bg-gray-800 shadow-lg rounded-lg max-w-2xl mx-auto my-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Manage Nostr Contacts (Kind 3)</h2>
        <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      {statusMessage && (
        <div className={`mb-3 p-3 rounded-md text-sm ${statusMessage.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200' : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200'}`}>
          {statusMessage.text}
        </div>
      )}

      {/* Add New Contact Form */}
      <div className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
        <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-300">Add New Contact</h3>
        <div className="space-y-3">
          <input
            type="text"
            value={newContactNpub}
            onChange={(e) => setNewContactNpub(e.target.value)}
            placeholder="Enter npub, nprofile, or hex pubkey"
            className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <input
            type="text"
            value={newContactPetname}
            onChange={(e) => setNewContactPetname(e.target.value)}
            placeholder="Petname/Alias (optional)"
            className="w-full p-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <button
            onClick={handleAddContact}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
          >
            <UserPlusIcon className="h-5 w-5 mr-2" /> Add Contact
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <button
          onClick={handleRefreshAllContactProfiles}
          disabled={isLoading || contacts.length === 0}
          className="col-span-full px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 disabled:bg-gray-400 flex items-center justify-center"
        >
          <ArrowPathIcon className="h-5 w-5 mr-2" /> Refresh All Contact Profiles (Kind 0)
        </button>
        <button
          onClick={handleFetchContactsFromRelay}
          disabled={isLoading || !userHexPubkey}
          className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:bg-gray-400 flex items-center justify-center"
        >
          <ArrowDownTrayIcon className="h-5 w-5 mr-2" /> Fetch from Relay
        </button>
        <button
          onClick={handlePublishContactsToRelay}
          disabled={isLoading || !userHexPubkey || contacts.length === 0}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center"
        >
          <ArrowUpTrayIcon className="h-5 w-5 mr-2" /> Publish to Relay
        </button>
        <button
          onClick={handleDownloadContacts}
          disabled={contacts.length === 0}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400 flex items-center justify-center"
        >
          Download JSON
        </button>
        <div>
            <label htmlFor="uploadContacts"
                className="cursor-pointer px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-400 flex items-center justify-center">
                Upload JSON
            </label>
            <input
                type="file"
                id="uploadContacts"
                accept=".json"
                onChange={handleUploadContacts}
                className="hidden"
                disabled={isLoading}
            />
        </div>
      </div>

      {/* Contact List Display */}
      <div className="max-h-96 overflow-y-auto">
        <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-300">Your Contacts ({contacts.length})</h3>
        {contacts.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No contacts added yet. Fetch from relay or add manually.</p>}
        <ul className="space-y-2">
          {contacts.map(contact => (
            <li key={contact.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-100">{contact.title || contact.name || 'Unnamed'}</p>
                <p className="text-xs text-blue-500 dark:text-blue-400 break-all">{contact.npub}</p>
              </div>
              <button
                onClick={() => contact.id && handleRemoveContact(contact.id, contact.npub)}
                disabled={isLoading}
                className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:red-300 disabled:text-gray-400"
                title="Remove from local list"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default NostrContactsManager;
