import React, { useState, useEffect, useMemo } from 'react';
import * as tagPageService from '../services/tagPageService'; // Use tagPageService
import { TagPageWithCount } from '../services/tagPageService'; // Correct import for TagPageWithCount
import { XMarkIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface TagManagementViewProps {
  isOpen: boolean;
  onClose: () => void;
}

type SortKey = 'name_asc' | 'name_desc' | 'count_asc' | 'count_desc';

const TagManagementView: React.FC<TagManagementViewProps> = ({ isOpen, onClose }) => {
  const [allTags, setAllTags] = useState<TagPageWithCount[]>([]); // Use TagPageWithCount
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name_asc');

  // States for modals
  const [tagToRename, setTagToRename] = useState<TagPageWithCount | null>(null); // Use TagPageWithCount
  const [newTagName, setNewTagName] = useState('');
  const [renameWarning, setRenameWarning] = useState('');

  const [tagToDelete, setTagToDelete] = useState<TagPageWithCount | null>(null); // Use TagPageWithCount

  // Fetch tags when component mounts or isOpen changes to true
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      // Use tagPageService.getAllTagPagesWithItemCounts() which returns a liveQuery
      const subscription = tagPageService.getAllTagPagesWithItemCounts().subscribe({
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
    if (!tagToRename || !newTagName.trim()) {
      setRenameWarning("New tag name cannot be empty.");
      return;
    }
    // Check if the new name is the same as the old name (case-insensitive)
    if (tagToRename.name.toLowerCase() === newTagName.trim().toLowerCase()) {
        setRenameWarning("New tag name is the same as the old name (case-insensitive). No change needed.");
        return;
    }

    try {
      await tagPageService.renameTagPage(tagToRename.id!, newTagName.trim()); // Use tagPageService
      setTagToRename(null);
      setNewTagName('');
      setRenameWarning('');
      // Tags will refresh via live query effect
    } catch (error: any) { // Catch error to display specific messages
      console.error("Error renaming tag:", error);
      // The renameTagPage service now handles the merge, so this specific error might not be thrown for conflicts
      // but rather for truly invalid operations.
      setRenameWarning("Failed to rename tag. Please try again.");
    }
  };

  const handleDelete = async () => {
    if (!tagToDelete) return;
    try {
      await tagPageService.deleteTagPageAndUnlink(tagToDelete.id!); // Use tagPageService
      setTagToDelete(null);
      // Tags will refresh
    } catch (error) {
      console.error("Error deleting tag:", error);
      // Optionally set an error message here
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
              <option value="count_desc">Sort by Items (Most)</option>
              <option value="count_asc">Sort by Items (Least)</option>
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
                <li key={tag.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600">
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-100">{tag.name}</span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({tag.count} item{tag.count === 1 ? '' : 's'})</span>
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

        {/* Rename Modal */}
      {tagToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Rename Tag</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Renaming tag: <span className="font-medium">"{tagToRename.name}"</span>
            </p>
            <input
              type="text"
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value);
                const trimmedNewName = e.target.value.trim();
                const existingTag = allTags.find(t => t.name.toLowerCase() === trimmedNewName.toLowerCase() && t.id !== tagToRename.id);
                if (existingTag) {
                  setRenameWarning(`Warning: Tag "${existingTag.name}" already exists. Renaming "${tagToRename.name}" to "${trimmedNewName}" will merge all associated items under "${existingTag.name}".`);
                } else if (trimmedNewName.toLowerCase() === tagToRename.name.toLowerCase()) {
                  setRenameWarning("New tag name is the same as the old name (case-insensitive). No change needed.");
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
                disabled={!newTagName.trim() || newTagName.trim().toLowerCase() === tagToRename.name.toLowerCase()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {allTags.some(t => t.name.toLowerCase() === newTagName.trim().toLowerCase() && t.id !== tagToRename.id) ? "Merge & Rename" : "Rename"}
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
              This will remove the tag from all {tagToDelete.count} associated item(s). This action cannot be undone.
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
