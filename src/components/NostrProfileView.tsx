import React, { useState, useEffect, useCallback } from 'react';
import { NostrProfileNote } from '../db/db';
import * as nostrProfileService from '../services/nostrProfileService';
import { PencilIcon, TrashIcon, CheckCircleIcon, XCircleIcon, ClockIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';

interface NostrProfileViewProps {
  profile: NostrProfileNote;
  onEditLocalFields: (profileId: number) => void;
  onDelete: (profileId: number, npub: string) => void;
  onRefetchProfile: (npub: string) => Promise<void>; // Make it async to await updates
  // Callback to inform parent about profile update (e.g. after NIP-05 check)
  onProfileUpdated?: (updatedProfile: NostrProfileNote) => void;
}

type Nip05Status = 'idle' | 'checking' | 'verified' | 'failed' | 'not_present';

const NostrProfileView: React.FC<NostrProfileViewProps> = ({ profile, onEditLocalFields, onDelete, onRefetchProfile, onProfileUpdated }) => {
  const [nip05VerificationStatus, setNip05VerificationStatus] = useState<Nip05Status>('idle');

  const { id, npub, name, picture, about, nip05, title, content, lastChecked, tags, nip05Verified, nip05VerifiedAt } = profile || {};

  const verifyNip05Identifier = useCallback(async () => {
    if (!nip05 || !npub) {
      setNip05VerificationStatus('not_present');
      return;
    }

    // If already checked recently (e.g., within last hour), use stored status
    if (nip05Verified !== undefined && nip05VerifiedAt && (Date.now() - new Date(nip05VerifiedAt).getTime()) < 60 * 60 * 1000) {
      setNip05VerificationStatus(nip05Verified ? 'verified' : 'failed');
      return;
    }

    setNip05VerificationStatus('checking');
    try {
      const result = await nostrProfileService.verifyNip05(npub, nip05);
      setNip05VerificationStatus(result.verified ? 'verified' : 'failed');

      // Update the profile in DB with verification result
      if (id) {
        const updatedFields: Partial<NostrProfileNote> = {
          nip05Verified: result.verified,
          nip05VerifiedAt: new Date(),
        };
        // Use createOrUpdateProfileNote to update, ensuring not to trigger a new fetch
        await nostrProfileService.createOrUpdateProfileNote(
            { ...profile, ...updatedFields, npub }, // provide existing profile data plus updates
            npub,
            false // Do not re-fetch from relay
        );
        if (onProfileUpdated && profile) {
            onProfileUpdated({ ...profile, ...updatedFields } as NostrProfileNote);
        }
      }
    } catch (error) {
      console.error("Error verifying NIP-05 in component:", error);
      setNip05VerificationStatus('failed');
    }
  }, [npub, nip05, id, profile, nip05Verified, nip05VerifiedAt, onProfileUpdated]);

  useEffect(() => {
    if (profile && nip05) {
      verifyNip05Identifier();
    } else {
      setNip05VerificationStatus('not_present');
    }
  }, [profile, nip05, verifyNip05Identifier]);


  if (!profile) return <div className="p-4 text-center text-gray-500 dark:text-gray-400">No profile selected or profile data missing.</div>;

  const handleEdit = () => {
    if (id) onEditLocalFields(id);
  };

  const handleDelete = () => {
    if (id) onDelete(id, npub);
  };

  const handleRefetch = async () => {
    setNip05VerificationStatus('idle'); // Reset status before refetch
    await onRefetchProfile(npub);
    // Verification will re-trigger via useEffect if nip05 is present in new profile data
  };

  const renderNip05StatusIcon = () => {
    switch (nip05VerificationStatus) {
      case 'checking':
        return <ClockIcon className="h-4 w-4 text-yellow-500 animate-spin" title="Checking NIP-05..." />;
      case 'verified':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" title="NIP-05 Verified" />;
      case 'failed':
        return <XCircleIcon className="h-4 w-4 text-red-500" title="NIP-05 Verification Failed" />;
      case 'idle':
         return <QuestionMarkCircleIcon className="h-4 w-4 text-gray-400" title="NIP-05 status unknown" />;
      case 'not_present':
      default:
        return null;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 h-full overflow-y-auto bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4 min-w-0"> {/* Added min-w-0 for flex child truncation */}
          {picture && <img src={picture} alt={name || npub} className="w-16 h-16 rounded-full object-cover border border-gray-300 dark:border-gray-600 flex-shrink-0" />}
          <div className="min-w-0"> {/* Added min-w-0 for flex child truncation */}
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white truncate">{name || title || 'Unnamed Profile'}</h1>
            <p className="text-sm text-blue-600 dark:text-blue-400 break-all" title={npub}>{npub.substring(0, 20)}...</p>
            {nip05 && (
              <div className="flex items-center space-x-1">
                <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{nip05}</p>
                {renderNip05StatusIcon()}
              </div>
            )}
          </div>
        </div>
        <div className="flex space-x-2 flex-shrink-0 self-start sm:self-center">
           <button
            onClick={handleRefetch}
            className="p-2 text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-100 dark:bg-blue-900 rounded-md hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
            title="Refetch Profile Data from Relay"
          >
            Refresh Profile
          </button>
          <button
            onClick={handleEdit}
            className="p-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            title="Edit local notes for this profile"
          >
            <PencilIcon className="h-5 w-5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 bg-red-100 dark:bg-red-900 rounded-md hover:bg-red-200 dark:hover:bg-red-700 transition-colors"
            title="Delete this profile"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* NIP-01 'about' section */}
      {about && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2 border-b pb-1 dark:border-gray-700">Profile Bio (from Nostr)</h2>
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap break-words">
            {/* Basic rendering of 'about'. Could be Markdown if specified by NIPs. */}
            {about}
          </div>
        </section>
      )}

      {/* Local Notes Section (using 'title' and 'content' from Note base) */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2 border-b pb-1 dark:border-gray-700">
          Local Alias & Notes
          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">(Editable - click pencil icon)</span>
        </h2>
        {title && title !== (name || npub.substring(0,10)) && ( // Show if different from fetched name or default
             <p className="text-md font-medium text-gray-800 dark:text-gray-200 mb-1"><strong>Alias:</strong> {title}</p>
        )}
        {content && content !== about && ( // Show if different from fetched about
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                {content}
            </div>
        )}
        {(!content || content === about) && (!title || title === (name || npub.substring(0,10))) && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No local alias or notes added for this profile yet.</p>
        )}
      </section>

      {tags && tags.length > 0 && (
        <section>
          <h3 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-1">Tags:</h3>
          <div className="flex flex-wrap gap-2">
            {tags.filter(t => t !== 'nostrProfile').map(tag => ( // Exclude default 'nostrProfile' tag
              <span key={tag} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {lastChecked && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-right">
          Profile data last checked: {new Date(lastChecked).toLocaleString()}
        </p>
      )}
    </div>
  );
};

export default NostrProfileView;
