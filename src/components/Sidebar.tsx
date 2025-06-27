import React from 'react';
import { Note, NostrProfileNote } from '../db/db';
import { PlusIcon, TagIcon, Cog6ToothIcon, DocumentTextIcon, UserCircleIcon, XMarkIcon as MenuCloseIcon } from '@heroicons/react/24/outline'; // Added UserCircleIcon

import { TagPageWithCount } from '../services/tagPageService'; // Import type

interface SidebarProps {
  notes: Note[];
  nostrProfiles: NostrProfileNote[];
  tagPagesWithCounts: TagPageWithCount[]; // Replaced by tagPagesWithCounts
  selectedNoteId: number | null;
  selectedProfileId: number | null; // To distinguish selected profile
  onSelectNote: (id: number, isProfile: boolean) => void; // Modified to indicate if it's a profile
  onCreateNewNote: () => void;
  onCreateNewProfile?: () => void; // Optional: if adding profiles directly from sidebar
  onSelectTagPageId: (tagPageId: number | null) => void; // Replaced by onSelectTagPageId
  selectedTagPageId: number | null; // Replaced by selectedTagPageId
  onShowSettings: () => void;
  onShowDirectMessages?: () => void; // Added for DM navigation
  onSearchChange: (term: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  nostrProfiles,
  tagPagesWithCounts,
  selectedNoteId,
  selectedProfileId,
  onSelectNote,
  onCreateNewNote,
  onCreateNewProfile,
  onSelectTagPageId,
  selectedTagPageId,
  onShowSettings,
  onShowDirectMessages, // Destructure new prop
  onSearchChange,
  isOpen,
  onClose,
}) => {
  const handleItemClick = <T extends any[]>(action: (...args: T) => void, ...args: T) => {
    action(...args);
    if (window.innerWidth < 768 && isOpen) {
      onClose();
    }
  };

  return (
    <div className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-50 dark:bg-gray-800 h-screen p-4 flex flex-col border-r dark:border-gray-700 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:flex-shrink-0`}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white">Notention</h1>
        <div className="flex items-center space-x-2">
            {onShowDirectMessages && (
                 <button
                    onClick={() => handleItemClick(onShowDirectMessages)}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                    title="Direct Messages"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-3.86 8.25-8.625 8.25S3.75 16.556 3.75 12D3.75 7.444 7.61 3.75 12.375 3.75S21 7.444 21 12z" />
                    </svg>
                </button>
            )}
            <button
              onClick={() => handleItemClick(onShowSettings)}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
              title="Settings"
            >
              <Cog6ToothIcon className="h-6 w-6" />
            </button>
            <button className="md:hidden p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose}>
                <MenuCloseIcon className="h-6 w-6" />
            </button>
        </div>
      </div>

      <input
        type="search"
        placeholder="Search notes & profiles..."
        className="w-full px-3 py-2 mb-4 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <button
        onClick={onCreateNewNote}
        className="w-full flex items-center justify-center px-4 py-2 mb-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
      >
        <PlusIcon className="h-5 w-5 mr-2" />
        New Note
      </button>
      {onCreateNewProfile && ( // Conditionally render "Add Profile" button
         <button
            onClick={onCreateNewProfile}
            className="w-full flex items-center justify-center px-4 py-2 mb-4 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
          <UserCircleIcon className="h-5 w-5 mr-2" />
          Add Nostr Contact
        </button>
      )}

      <div className="flex-grow overflow-y-auto space-y-4">
        <div>
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notes</h2>
          <ul className="space-y-1 max-h-48 overflow-y-auto"> {/* Max height for this section */}
            {notes.map(note => (
              <li key={`note-${note.id}`}>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); note.id && handleItemClick(onSelectNote, note.id, false); }}
                  className={`block px-3 py-2 rounded-md text-sm truncate ${
                    selectedNoteId === note.id && !selectedProfileId
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-white'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  title={note.title}
                >
                  <DocumentTextIcon className="h-4 w-4 mr-2 inline-block align-text-bottom" />
                  {note.title || "Untitled Note"}
                </a>
              </li>
            ))}
            {notes.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 px-3 italic">No notes yet. Click "New Note" above to create one.</p>
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Nostr Contacts</h2>
          <ul className="space-y-1 max-h-48 overflow-y-auto"> {/* Max height for this section */}
            {nostrProfiles.map(profile => (
              <li key={`profile-${profile.id}`}>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); profile.id && handleItemClick(onSelectNote, profile.id, true); }}
                  className={`block px-3 py-2 rounded-md text-sm truncate ${
                    selectedProfileId === profile.id
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-700 dark:text-white'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                  title={profile.name || profile.npub}
                >
                  <UserCircleIcon className="h-4 w-4 mr-2 inline-block align-text-bottom" />
                  {profile.name || profile.title || profile.npub.substring(0,12) + "..."}
                </a>
              </li>
            ))}
            {nostrProfiles.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 px-3 italic">No contacts yet. Click "Add Nostr Contact" above.</p>
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Tags</h2>
          {tagPagesWithCounts.length > 0 ? (
            <ul className="space-y-1 max-h-32 overflow-y-auto"> {/* Max height for tags */}
              <li>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleItemClick(onSelectTagPageId, null); }} // Pass null for "All Tags"
                  className={`block px-3 py-2 rounded-md text-sm ${
                    selectedTagPageId === null
                      ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  <TagIcon className="h-4 w-4 mr-2 inline-block align-text-bottom" />
                  All Items
                </a>
              </li>
              {tagPagesWithCounts.map(tagPage => (
                <li key={tagPage.id}>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); handleItemClick(onSelectTagPageId, tagPage.id); }}
                    className={`block px-3 py-2 rounded-md text-sm ${
                      selectedTagPageId === tagPage.id
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-white'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                    title={`${tagPage.name} (${tagPage.count})`}
                  >
                     <TagIcon className="h-4 w-4 mr-2 inline-block align-text-bottom" />
                    {tagPage.name} <span className="text-xs opacity-75">({tagPage.count})</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 px-3 italic">No tags found. Add tags to notes or contacts.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
