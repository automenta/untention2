import React, { useState } from 'react';
import * as nostrProfileService from '../services/nostrProfileService';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useToastContext } from '../contexts/ToastContext'; // Import useToastContext

interface AddNostrContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContactAdded: (profileId: number) => void;
}

const AddNostrContactModal: React.FC<AddNostrContactModalProps> = ({ isOpen, onClose, onContactAdded }) => {
  const [identifier, setIdentifier] = useState(''); // Can be npub or NIP-05
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null); // For input validation errors
  const { addToast } = useToastContext(); // Use toast context

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setIsLoading(true);

    let npub = identifier;
    if (identifier.includes('@')) { // Basic check for NIP-05
      try {
        const resolvedNpub = await nostrProfileService.resolveNip05ToNpub(identifier);
        if (!resolvedNpub) {
          addToast(`Could not resolve NIP-05: ${identifier}`, 'error');
          setIsLoading(false);
          return;
        }
        npub = resolvedNpub;
      } catch (err: any) {
        addToast(`Error resolving NIP-05: ${err.message}`, 'error');
        setIsLoading(false);
        return;
      }
    } else {
      try {
        const decoded = nostrService.nip19.decode(identifier); // Using nostrService's re-exported nip19
        if (decoded.type !== 'npub') {
          setValidationError('Invalid npub format. Identifier is not a recognizable npub.');
          setIsLoading(false);
          return;
        }
        npub = identifier; // It's a valid npub string
      } catch (e) {
        setValidationError('Invalid npub format. Must start with "npub1..." or be a NIP-05 (user@domain.com).');
        setIsLoading(false);
        return;
      }
    }

    try {
      // Attempt to fetch and store the profile.
      // createOrUpdateProfileNote will fetch from relay if it's a new npub.
      // Ensure isContact is true when adding through this modal
      const profileId = await nostrProfileService.createOrUpdateProfileNote(
        { title: `Profile: ${npub.substring(0,12)}...`, isContact: true }, // Set isContact to true
        npub,
        true // Fetch Kind 0 if new or stale
      );
      if (profileId) {
        addToast('Contact added successfully!', 'success');
        onContactAdded(profileId);
        setIdentifier('');
        onClose();
      } else {
        addToast('Failed to add contact. Profile ID not returned.', 'error');
      }
    } catch (err: any) {
      console.error("Error adding Nostr contact:", err);
      addToast(`Failed to add contact: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md m-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Add Nostr Contact</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {validationError && <p className="text-red-500 dark:text-red-400 text-sm mb-3 p-2 bg-red-100 dark:bg-red-900 rounded">{validationError}</p>}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="nostrIdentifier" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nostr Pubkey (npub) or NIP-05 Address
            </label>
            <input
              type="text"
              id="nostrIdentifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="npub1... or user@domain.com"
              required
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddNostrContactModal;
