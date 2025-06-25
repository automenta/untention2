import React, { useState, useEffect } from 'react';
import * as nostrService from '../services/nostrService';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface ShareModalProps {
  noteTitle: string;
  noteContent: string;
  noteTags: string[];
  isOpen: boolean;
  onClose: () => void;
  onShared?: (eventId: string) => void; // Callback on successful share
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
  const [recipientPubKey, setRecipientPubKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isNostrReady, setIsNostrReady] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setIsLoading(false);
      setError(null);
      setStatus(null);
      setRecipientPubKey('');
      setIsPublic(true);
      nostrService.isNostrConfigured().then(setIsNostrReady);
    }
  }, [isOpen]);

  const handleShare = async () => {
    if (!isNostrReady) {
        setError("Nostr is not configured. Please check your settings (Relay & Private Key).");
        return;
    }
    if (!isPublic && !recipientPubKey.trim()) {
      setError('Recipient public key (npub or hex) is required for private sharing.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus('Preparing to share...');

    let finalRecipientPubKeyHex: string | undefined = undefined;
    if (!isPublic) {
        try {
            if (recipientPubKey.startsWith('npub')) {
                finalRecipientPubKeyHex = nostrService.npubToHex(recipientPubKey);
            } else if (recipientPubKey.match(/^[a-f0-9]{64}$/)) {
                finalRecipientPubKeyHex = recipientPubKey;
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

    // Construct content for Nostr. Could be just the note content, or structured.
    // For simplicity, let's share title + content. Tags can be Nostr event tags.
    const contentToShare = `# ${noteTitle}\n\n${noteContent}`;
    const nostrEventTags: string[][] = noteTags.map(tag => ['t', tag.replace(/^#/, '')]); // Convert #mytag to ['t', 'mytag']

    try {
      setStatus(isPublic ? 'Publishing public note...' : 'Encrypting and publishing private note...');
      const publishedEvent = await nostrService.publishNoteEvent(
        contentToShare,
        nostrEventTags,
        isPublic,
        finalRecipientPubKeyHex
      );

      if (publishedEvent) {
        setStatus(`Successfully shared! Event ID: ${publishedEvent.id}`);
        if (onShared) onShared(publishedEvent.id);
        setTimeout(() => {
            onClose(); // Close modal after a delay on success
        }, 2000);
      } else {
        throw new Error("Publish operation did not return an event.");
      }
    } catch (e: any) {
      console.error('Sharing error:', e);
      setError(`Failed to share: ${e.message}`);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md transform transition-all">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Share Note: {noteTitle}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {!isNostrReady && (
            <div className="p-3 my-2 text-sm text-yellow-700 bg-yellow-100 rounded-md dark:bg-yellow-900 dark:text-yellow-300">
                Nostr is not configured. Please set your Relay URL and Private Key in Settings.
            </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio text-blue-600 dark:text-blue-400"
                name="shareType"
                value="public"
                checked={isPublic}
                onChange={() => setIsPublic(true)}
                disabled={!isNostrReady}
              />
              <span className="ml-2 text-gray-700 dark:text-gray-300">Public Note</span>
            </label>
            <label className="inline-flex items-center ml-6">
              <input
                type="radio"
                className="form-radio text-blue-600 dark:text-blue-400"
                name="shareType"
                value="private"
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
                disabled={!isNostrReady}
              />
              <span className="ml-2 text-gray-700 dark:text-gray-300">Private (NIP-04 Encrypted)</span>
            </label>
          </div>

          {!isPublic && (
            <div>
              <label htmlFor="recipientPubKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Recipient Public Key (npub or hex)
              </label>
              <input
                type="text"
                id="recipientPubKey"
                value={recipientPubKey}
                onChange={(e) => setRecipientPubKey(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="npub1... or hex public key"
                disabled={!isNostrReady || isLoading}
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {status && <p className="text-sm text-blue-600 dark:text-blue-400">{status}</p>}

          <div className="flex justify-end space-x-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50"
              disabled={isLoading || !isNostrReady || (!isPublic && !recipientPubKey.trim())}
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
