import React from 'react';
import { Note } from '../db/db';
import { PlusIcon, TagIcon, Cog6ToothIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

interface SidebarProps {
  notes: Note[];
  tags: string[];
  selectedNoteId: number | null;
  onSelectNote: (id: number) => void;
  onCreateNewNote: () => void;
  onSelectTag: (tag: string) => void; // For filtering by tag
  selectedTag: string | null;
  onShowSettings: () => void;
  onSearchChange: (term: string) => void;
  isOpen: boolean; // For mobile control
  onClose: () => void; // For mobile control
}

const Sidebar: React.FC<SidebarProps> = ({
  notes,
  tags,
  selectedNoteId,
  onSelectNote,
  onCreateNewNote,
  onSelectTag,
  selectedTag,
  onShowSettings,
  onSearchChange,
  isOpen,
  onClose,
}) => {
  // Close sidebar when a note or tag is selected on mobile
  const handleItemClick = <T extends any[]>(action: (...args: T) => void, ...args: T) => {
    action(...args);
    if (window.innerWidth < 768 && isOpen) { // md breakpoint
      onClose();
    }
  };

  return (
    // Base classes for fixed position on mobile, relative on desktop
    <div className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-50 dark:bg-gray-800 h-screen p-4 flex flex-col border-r dark:border-gray-700 transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:flex-shrink-0`}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white">Notention</h1>
        {/* Close button for mobile */}
        <button className="md:hidden p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white" onClick={onClose}>
            <MenuCloseIcon className="h-6 w-6" />
        </button>
        <button
          // Hide settings button on mobile if close button is shown, or keep it - user preference
          // For now, keep it, but it's less critical on mobile if sidebar is primary nav
          onClick={onShowSettings}
          className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
          title="Settings"
        >
          <Cog6ToothIcon className="h-6 w-6" />
        </button>
      </div>

      <input
        type="search"
        placeholder="Search notes..."
        className="w-full px-3 py-2 mb-4 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <button
        onClick={onCreateNewNote}
        className="w-full flex items-center justify-center px-4 py-2 mb-4 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
      >
        <PlusIcon className="h-5 w-5 mr-2" />
        New Note
      </button>

      <div className="mb-4">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Notes</h2>
        <ul className="space-y-1 overflow-y-auto max-h-60">
          {notes.map(note => (
            <li key={note.id}>
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); note.id && handleItemClick(onSelectNote, note.id); }}
                className={`block px-3 py-2 rounded-md text-sm truncate ${
                  selectedNoteId === note.id
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
            <p className="text-xs text-gray-400 dark:text-gray-500 px-3">No notes yet.</p>
          )}
        </ul>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Tags</h2>
        {tags.length > 0 ? (
          <ul className="space-y-1 overflow-y-auto max-h-40">
            <li> {/* All notes filter */}
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); handleItemClick(onSelectTag, ''); }}
                className={`block px-3 py-2 rounded-md text-sm ${
                  selectedTag === null || selectedTag === ''
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                <TagIcon className="h-4 w-4 mr-2 inline-block align-text-bottom" />
                All Tags
              </a>
            </li>
            {tags.map(tag => (
              <li key={tag}>
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleItemClick(onSelectTag, tag); }}
                  className={`block px-3 py-2 rounded-md text-sm ${
                    selectedTag === tag
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-700 dark:text-white'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                   <TagIcon className="h-4 w-4 mr-2 inline-block align-text-bottom" />
                  {tag}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 px-3">No tags yet.</p>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
