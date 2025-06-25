import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as nostrService from '../services/nostrService';
import * as nostrProfileService from '../services/nostrProfileService';
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface ShareModalProps {
  noteTitle: string;
  noteContent: string;
  noteTags: string[];
  isOpen: boolean;
  onClose: () => void;
  onShared?: (eventId: string) => void;
}

const ShareModal: React.FC<ShareModalProps> = ({
  noteTitle,
  noteContent,
  noteTags,
  isOpen,
  onClose,
  onShared,
}) => {
  const [isPublic, setIsPublic] = useState(true);
  const [selectedNpub, setSelectedNpub] = useState<string>('');
  const [customNpubInput, setCustomNpubInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isNostrReady, setIsNostrReady] = useState(false);

  const nostrProfiles = useLiveQuery(nostrProfileService.getAllProfileNotes, [], []) || [];

  useEffect(() => {
    if (isOpen) {
      setIsLoading(false);
      setError(null);
      setStatus(null);
      // Keep selectedNpub or customNpubInput as user might be correcting an error
      // setIsPublic(true); // Don't reset this, user might want to retry private
      nostrService.isNostrConfigured().then(setIsNostrReady);
    }
  }, [isOpen]);

  const handleShare = async () => {
    if (!isNostrReady) {
      setError("Nostr is not configured. Please check your settings (Relay & Private Key).");
      return;
    }

    const recipientIdentifier = selectedNpub || customNpubInput;
    if (!isPublic && !recipientIdentifier.trim()) {
      setError('Recipient is required for private sharing. Select a contact or enter their npub/hex key.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus('Preparing to share...');

    let finalRecipientPubKeyHex: string | undefined = undefined;
    if (!isPublic && recipientIdentifier.trim()) {
      try {
        if (recipientIdentifier.startsWith('npub')) {
          finalRecipientPubKeyHex = nostrService.npubToHex(recipientIdentifier);
        } else if (recipientIdentifier.match(/^[a-f0-9]{64}$/)) {
          finalRecipientPubKeyHex = recipientIdentifier;
        } else {
          throw new Error("Invalid public key format. Use npub or 64-char hex.");
        }
      } catch (e: any) {
        setError(`Invalid recipient public key: ${e.message}`);
        setIsLoading(false);
        setStatus(null);
        return;
      }
    }

    const contentToShare = `# ${noteTitle}\n\n${noteContent}`;
    const nostrEventTags: string[][] = noteTags.map(tag => ['t', tag.replace(/^#/, '')]);

    try {
      setStatus(isPublic ? 'Publishing public note...' : 'Encrypting and publishing private note...');
      const publishedEvent = await nostrService.publishNoteEvent(
        contentToShare,
        nostrEventTags,
        isPublic,
        finalRecipientPubKeyHex
      );

      if (publishedEvent) {
        setStatus(`Successfully shared! Event ID: ${publishedEvent.id.substring(0,10)}...`);
        if (onShared) onShared(publishedEvent.id);
        setTimeout(onClose, 3000); // Close modal after success
      } else {
        throw new Error("Publish operation did not return an event.");
      }
    } catch (e: any) {
      setError(`Failed to share: ${e.message}`);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow-xl w-full max-w-lg transform transition-all">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white truncate pr-2" title={noteTitle}>Share Note: {noteTitle.length > 30 ? `${noteTitle.substring(0,27)}...` : noteTitle}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-gray-400">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {!isNostrReady && (
          <div className="p-3 my-2 text-sm text-yellow-800 bg-yellow-100 rounded-md dark:bg-yellow-900 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700">
            Nostr is not configured. Please set your Relay URL and Private Key in Settings to enable sharing.
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Visibility:</span>
            <button
              onClick={() => setIsPublic(true)}
              disabled={!isNostrReady || isLoading}
              className={`px-3 py-1.5 text-sm rounded-md ${isPublic ? 'bg-blue-600 text-white ring-2 ring-blue-400' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
            >
              Public
            </button>
            <button
              onClick={() => setIsPublic(false)}
              disabled={!isNostrReady || isLoading}
              className={`px-3 py-1.5 text-sm rounded-md ${!isPublic ? 'bg-indigo-600 text-white ring-2 ring-indigo-400' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
            >
              Private (NIP-04)
            </button>
          </div>

          {!isPublic && (
            <div className="space-y-3 p-3 border dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-700/30">
              <div>
                <label htmlFor="recipientContact" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Select Contact:
                </label>
                <div className="relative">
                  <select
                    id="recipientContact"
                    value={selectedNpub}
                    onChange={(e) => { setSelectedNpub(e.target.value); setCustomNpubInput(''); setError(null); }}
                    disabled={!isNostrReady || isLoading || nostrProfiles.length === 0}
                    className="w-full appearance-none px-3 py-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 pr-8 disabled:opacity-70"
                  >
                    <option value="">{nostrProfiles.length === 0 ? "No contacts saved" : "Select a contact..."}</option>
                    {nostrProfiles.map(profile => (
                      <option key={profile.npub} value={profile.npub}>
                        {profile.name || profile.title || profile.npub.substring(0, 15) + '...'} ({profile.npub.substring(0,10)}...)
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="h-5 w-5 text-gray-400 absolute right-2.5 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div className="text-center text-xs text-gray-500 dark:text-gray-400">OR</div>
              <div>
                <label htmlFor="customNpubInput" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Enter Recipient npub or Hex:
                </label>
                <input
                  type="text"
                  id="customNpubInput"
                  value={customNpubInput}
                  onChange={(e) => { setCustomNpubInput(e.target.value); setSelectedNpub(''); setError(null); }}
                  disabled={!isNostrReady || isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-70"
                  placeholder="npub1... or 64-char hex public key"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400 p-2 bg-red-100 dark:bg-red-900/50 rounded-md border border-red-300 dark:border-red-700">{error}</p>}
          {status && <p className="text-sm text-blue-600 dark:text-blue-400 p-2 bg-blue-100 dark:bg-blue-900/50 rounded-md border border-blue-300 dark:border-blue-700">{status}</p>}

          <div className="flex justify-end space-x-3 pt-3 border-t dark:border-gray-700 mt-5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-70"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-60"
              disabled={isLoading || !isNostrReady || (!isPublic && !(selectedNpub || customNpubInput).trim())}
            >
              {isLoading ? 'Sharing...' : 'Share via Nostr'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
