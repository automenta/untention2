import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, NostrProfileNote } from '../db/db';
import * as nostrService from '../services/nostrService';
import * as settingsService from '../services/settingsService';
import * as nostrProfileService from '../services/nostrProfileService';
import { nip19 } from 'nostr-tools/nip19';
import { Event } from 'nostr-tools/pure';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, ArrowPathIcon, UserPlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '../contexts/ToastContext'; // Import useToastContext

interface NostrContactsManagerProps {
  userNpub: string; // User's own npub
  onClose: () => void;
}

const NostrContactsManager: React.FC<NostrContactsManagerProps> = ({ userNpub, onClose }) => {
  const [newContactNpub, setNewContactNpub] = useState('');
  const [newContactPetname, setNewContactPetname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToastContext(); // Use toast context

  const contacts = useLiveQuery(
    () => db.nostrProfiles.where('isContact').equals(1).sortBy('title'),
    []
  ) || [];

  const userHexPubkey = userNpub ? nostrService.npubToHex(userNpub) : '';

  const handleFetchContactsFromRelay = useCallback(async () => {
    if (!userHexPubkey) {
      addToast('User public key not available.', 'error');
      return;
    }
    setIsLoading(true);
    addToast('Fetching contact list from relay...', 'info');
    try {
      const kind3Event = await nostrService.fetchKind3ContactListEvent(userHexPubkey);
      if (kind3Event && kind3Event.tags) {
        let contactsProcessed = 0;
        for (const tag of kind3Event.tags) {
          if (tag[0] === 'p' && tag[1]) {
            const contactHexPubkey = tag[1];
            const contactNpub = nip19.npubEncode(contactHexPubkey);
            // const relayUrl = tag[2] || undefined; // NIP-02: recommended relay URL
            const petname = tag[3] || undefined; // NIP-02: petname

            await nostrProfileService.createOrUpdateProfileNote(
              {
                npub: contactNpub,
                title: petname || contactNpub.substring(0,10), // Use petname as title if available
                isContact: true, // Ensure fetched contacts are marked as such
                // We could store relayUrl from kind3 if desired, e.g. in a custom field or local notes.
              },
              contactNpub, // npubToFetch for potential kind0 lookup
              true // fetch their kind0 if stale
            );
            contactsProcessed++;
          }
        }
        addToast(`Contact list fetched. ${contactsProcessed} contacts processed.`, 'success');
      } else {
        addToast('No contact list (Kind 3) found on relay or it was empty.', 'info');
      }
    } catch (error: any) {
      addToast(`Failed to fetch contacts: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [userHexPubkey, addToast]);

  const handlePublishContactsToRelay = async () => {
    if (!contacts || contacts.length === 0) {
      addToast('No contacts to publish. Add some contacts first.', 'error');
      return;
    }
    setIsLoading(true);
    addToast('Publishing contact list to relay...', 'info');
    try {
      const contactListEntries: nostrService.ContactListEntry[] = contacts.map(c => ({
        pubkey: nostrService.npubToHex(c.npub),
        petname: c.title !== c.npub.substring(0,10) ? c.title : (c.name || undefined), // Use local title as petname
        // TODO: Add relay hint if stored
      }));
      const publishedEvent = await nostrService.publishKind3ContactList(contactListEntries);
      if (publishedEvent) {
        addToast('Contact list published successfully!', 'success');
      } else {
        addToast('Failed to publish contact list.', 'error');
      }
    } catch (error: any) {
      addToast(`Error publishing contacts: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddContact = async () => {
    if (!newContactNpub.trim()) {
      addToast('Contact npub or nprofile cannot be empty.', 'error');
      return;
    }
    let npubToAdd = newContactNpub.trim();
    // let hexPubkeyToAdd = ''; // Not directly needed if using npubToAdd consistently

    try {
        if (npubToAdd.startsWith('nprofile')) {
            const decoded = nip19.decode(npubToAdd);
            if (decoded.type === 'nprofile' && decoded.data.pubkey) {
                // hexPubkeyToAdd = decoded.data.pubkey;
                npubToAdd = nip19.npubEncode(decoded.data.pubkey);
            } else {
                throw new Error('Invalid nprofile format');
            }
        } else if (npubToAdd.startsWith('npub')) {
            // hexPubkeyToAdd = nip19.decode(npubToAdd).data as string; // validation by decode
            nip19.decode(npubToAdd).data as string; // just validate
        } else {
            if (npubToAdd.match(/^[a-f0-9]{64}$/)) { // Assume it's a hex pubkey
                // hexPubkeyToAdd = npubToAdd;
                npubToAdd = nip19.npubEncode(npubToAdd);
            } else {
                throw new Error('Invalid public key format. Use npub, nprofile, or hex.');
            }
        }

        const existing = await nostrProfileService.getProfileNoteByNpub(npubToAdd);
        if (existing && existing.isContact) {
            addToast('This contact is already in your list.', 'error');
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
        addToast(`Contact ${newContactPetname || npubToAdd.substring(0,10)} added.`, 'success');
        setNewContactNpub('');
        setNewContactPetname('');
    } catch (error: any) {
        addToast(`Failed to add contact: ${error.message}`, 'error');
    }
  };

  const handleRemoveContact = async (profileId: number, npub: string) => {
    try {
      const profile = await db.nostrProfiles.get(profileId);
      if (profile) {
        await db.nostrProfiles.update(profileId, { isContact: false, updatedAt: new Date() });
        addToast(`Contact ${profile.title || profile.name || npub.substring(0,10)} removed from list. Consider publishing your updated list.`, 'success');
      }
    } catch (error: any) {
      addToast(`Failed to remove contact: ${error.message}`, 'error');
    }
    };

  const handleDownloadContacts = () => {
    if (!contacts || contacts.length === 0) {
      addToast('No contacts to download.', 'error');
      return;
    }
    const contactListEntries: nostrService.ContactListEntry[] = contacts.map(c => ({
        pubkey: nostrService.npubToHex(c.npub),
        petname: c.title !== c.npub.substring(0,10) ? c.title : (c.name || undefined),
    }));
     const kind3EventDraft: Event = {
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
        pubkey: userHexPubkey,
        id: '',
        sig: '',
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
    addToast('Contacts JSON download initiated.', 'success');
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
            // const relayUrl = tag[2] || undefined;
            const petname = tag[3] || undefined;

            await nostrProfileService.createOrUpdateProfileNote(
              { npub: contactNpub, title: petname || contactNpub.substring(0,10), isContact: true },
              contactNpub,
              true
            );
            contactsProcessed++;
          }
        }
        addToast(`Imported ${contactsProcessed} contacts from JSON. Consider publishing your list.`, 'success');
        setIsLoading(false);
      } catch (error: any) {
        addToast(`Error importing contacts: ${error.message}`, 'error');
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleRefreshAllContactProfiles = async () => {
    if (contacts.length === 0) {
      addToast("No contacts to refresh.", 'error');
      return;
    }
    setIsLoading(true);
    addToast(`Refreshing profiles for ${contacts.length} contact(s)...`, 'info');
    let successCount = 0;
    let failCount = 0;

    for (const contact of contacts) {
      try {
        await nostrProfileService.createOrUpdateProfileNote(
          { npub: contact.npub },
          contact.npub,
          true
        );
        successCount++;
      } catch (error) {
        console.error(`Failed to refresh profile for ${contact.npub}:`, error);
        failCount++;
      }
    }
    setIsLoading(false);
    addToast(`Profile refresh complete. ${successCount} succeeded, ${failCount} failed.`, 'success');
  };


  useEffect(() => {
    if (userHexPubkey && (!contacts || contacts.length === 0)) {
      // handleFetchContactsFromRelay(); // Auto-fetch can be noisy with toasts, user can click manually.
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

      {/* Remove local statusMessage display, toasts will handle it */}

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
