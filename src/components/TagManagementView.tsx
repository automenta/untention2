import React, { useState, useEffect, useMemo } from 'react';
import * as noteService from '../services/noteService';
import { TagWithCount } from '../services/noteService';
import { XMarkIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface TagManagementViewProps {
  isOpen: boolean;
  onClose: () => void;
}

type SortKey = 'name_asc' | 'name_desc' | 'count_asc' | 'count_desc';

const TagManagementView: React.FC<TagManagementViewProps> = ({ isOpen, onClose }) => {
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name_asc');

  // States for modals
  const [tagToRename, setTagToRename] = useState<TagWithCount | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [renameWarning, setRenameWarning] = useState('');

  const [tagToDelete, setTagToDelete] = useState<TagWithCount | null>(null);

  // Fetch tags when component mounts or isOpen changes to true
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      // noteService.getUniqueTagsWithCounts() returns a liveQuery
      // We need to subscribe to it or fetch its current value.
      // For a modal, fetching current value once might be okay,
      // or subscribe and unsubscribe. Let's fetch once for now.
      const liveQueryInstance = noteService.getUniqueTagsWithCounts();
      const subscription = liveQueryInstance.subscribe({
        next: (value) => {
          setAllTags(value);
          setIsLoading(false);
        },
        error: (err) => {
          console.error("Error fetching tags:", err);
          setIsLoading(false);
        }
      });
      return () => subscription.unsubscribe(); // Cleanup subscription
    }
  }, [isOpen]);

  const filteredAndSortedTags = useMemo(() => {
    let processedTags = [...allTags];

    if (searchTerm) {
      processedTags = processedTags.filter(tag =>
        tag.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    switch (sortKey) {
      case 'name_asc':
        processedTags.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name_desc':
        processedTags.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'count_asc':
        processedTags.sort((a, b) => a.count - b.count || a.name.localeCompare(b.name));
        break;
      case 'count_desc':
        processedTags.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        break;
    }
    return processedTags;
  }, [allTags, searchTerm, sortKey]);

  const handleRename = async () => {
    if (!tagToRename || !newTagName.trim() || tagToRename.name === newTagName.trim()) {
      setRenameWarning("New tag name cannot be empty or same as old name.");
      return;
    }
    // Check for merge conflicts / warnings
    if (allTags.some(t => t.name === newTagName.trim() && t.name !== tagToRename.name)) {
        // Could show a more specific warning here or handle in UI
    }
    try {
      await noteService.renameTag(tagToRename.name, newTagName.trim());
      setTagToRename(null);
      setNewTagName('');
      setRenameWarning('');
      // Tags will refresh via live query effect if still open, or on next open
    } catch (error) {
      console.error("Error renaming tag:", error);
      setRenameWarning("Failed to rename tag.");
    }
  };

  const handleDelete = async () => {
    if (!tagToDelete) return;
    try {
      await noteService.deleteTagFromNotes(tagToDelete.name);
      setTagToDelete(null);
      // Tags will refresh
    } catch (error) {
      console.error("Error deleting tag:", error);
    }
  };

  // Close modal with Escape key
   useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (tagToRename) setTagToRename(null);
        else if (tagToDelete) setTagToDelete(null);
        else onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, tagToRename, tagToDelete]);


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 transition-opacity p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Manage Tags</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Controls: Search and Sort */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-grow">
              <input
                type="text"
                placeholder="Filter tags..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
              />
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
            >
              <option value="name_asc">Sort by Name (A-Z)</option>
              <option value="name_desc">Sort by Name (Z-A)</option>
              <option value="count_desc">Sort by Notes (Most)</option>
              <option value="count_asc">Sort by Notes (Least)</option>
            </select>
          </div>
        </div>

        {/* Tag List */}
        <div className="flex-grow overflow-y-auto p-4">
          {isLoading && <p className="text-center text-gray-500 dark:text-gray-400">Loading tags...</p>}
          {!isLoading && filteredAndSortedTags.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-6">
              {allTags.length === 0 ? "No tags found. Add tags to your notes to manage them here." : "No tags match your filter."}
            </p>
          )}
          {!isLoading && filteredAndSortedTags.length > 0 && (
            <ul className="space-y-2">
              {filteredAndSortedTags.map(tag => (
                <li key={tag.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600">
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-100">{tag.name}</span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({tag.count} note{tag.count === 1 ? '' : 's'})</span>
                  </div>
                  <div className="space-x-2">
                    <button
                      onClick={() => { setTagToRename(tag); setNewTagName(tag.name); setRenameWarning(''); }}
                      className="p-1.5 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      title="Rename tag"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setTagToDelete(tag)}
                      className="p-1.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                      title="Delete tag"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer (optional, could have a close button here too) */}
        {/* <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Close
          </button>
        </div> */}
      </div>

      {/* Rename Modal */}
      {tagToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Rename Tag</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Renaming tag: <span className="font-medium">{tagToRename.name}</span>
            </p>
            <input
              type="text"
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value);
                if (allTags.some(t => t.name === e.target.value.trim() && t.name !== tagToRename.name)) {
                  setRenameWarning(`Warning: Tag '${e.target.value.trim()}' already exists. This will merge notes under the existing tag.`);
                } else {
                  setRenameWarning('');
                }
              }}
              placeholder="New tag name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {renameWarning && <p className="text-xs text-orange-600 dark:text-orange-400">{renameWarning}</p>}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setTagToRename(null); setNewTagName(''); setRenameWarning(''); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!newTagName.trim() || newTagName.trim() === tagToRename.name && !allTags.some(t => t.name === newTagName.trim() && t.name !== tagToRename.name) } // Disable if same or empty, unless it's a merge case for case change
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {tagToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Tag</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to delete the tag <span className="font-medium">"{tagToDelete.name}"</span>?
              This will remove the tag from all {tagToDelete.count} associated note(s). This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setTagToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-gray-200 dark:bg-gray-600 dark:hover:bg-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Delete Tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagManagementView;
