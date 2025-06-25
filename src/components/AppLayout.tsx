import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import MarkdownEditor from './MarkdownEditor';
import { Note, db, Settings } from '../db/db';
import * as noteService from '../services/noteService';
import * as settingsService from '../services/settingsService';
import { useLiveQuery } from 'dexie-react-hooks';
import { useHotkeys } from 'react-hotkeys-hook';
import sanitizeHtml from 'sanitize-html';
import LMInteractionArea from './LMInteractionArea';
import SettingsPage from './SettingsPage'; // Import the SettingsPage component
import ShareModal from './ShareModal'; // Import the ShareModal component


import { Bars3Icon, XMarkIcon as MenuCloseIcon } from '@heroicons/react/24/outline'; // For menu toggle

const AppLayout: React.FC = () => {
  const [currentNoteId, setCurrentNoteId] = useState<number | null>(null);
  const [currentNoteContent, setCurrentNoteContent] = useState<string>('');
  const [currentNoteTitle, setCurrentNoteTitle] = useState<string>('');
  const [currentNoteTags, setCurrentNoteTags] = useState<string[]>([]);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<boolean>(false); // For toggling settings view
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile sidebar toggle

  const notes = useLiveQuery(
    () => {
      if (selectedTag) return noteService.getNotesByTag(selectedTag);
      if (searchTerm) return noteService.searchNotes(searchTerm);
      return noteService.getAllNotes('updatedAt', true);
    },
    [searchTerm, selectedTag],
    [] // Default value
  ) as Note[] | undefined;

  const allTags = useLiveQuery(noteService.getAllTags, [], []) as string[] | undefined;
  const settings = useLiveQuery(settingsService.getSettings, []) as Settings | undefined;

  useEffect(() => {
    if (settings?.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings?.theme]);

  const loadNote = useCallback(async (id: number) => {
    const note = await noteService.getNoteById(id);
    if (note) {
      setCurrentNoteId(note.id!);
      setCurrentNoteTitle(note.title);
      setCurrentNoteContent(note.content);
      setCurrentNoteTags(note.tags);
      setShowSettings(false); // Switch out of settings view if a note is loaded
    }
  }, []);

  useEffect(() => {
    // Load first note by default or if current note is deleted/filtered out
    if (notes && notes.length > 0 && (!currentNoteId || !notes.find(n => n.id === currentNoteId))) {
      loadNote(notes[0].id!);
    } else if (notes && notes.length === 0) {
      // No notes, clear editor
      setCurrentNoteId(null);
      setCurrentNoteTitle('');
      setCurrentNoteContent('');
      setCurrentNoteTags([]);
    }
  }, [notes, currentNoteId, loadNote]);

  const handleCreateNewNote = async () => {
    const newNoteId = await noteService.createNote('Untitled Note', '');
    if (notes && notes.length === 0) { // if it's the very first note
       await loadNote(newNoteId);
    } // else, the new note will appear at the top and useEffect will handle loading it.
    setSelectedTag(null); // Clear tag filter
    setSearchTerm(''); // Clear search
  };

  const debouncedSaveNote = useCallback(
    // Basic debounce
    (() => {
      let timer: NodeJS.Timeout;
      return (id: number, title: string, content: string, tags: string[]) => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          if (id) {
            await noteService.updateNote(id, { title, content, tags });
          }
        }, 1000); // Auto-save after 1 second of inactivity
      };
    })(),
    []
  );

  useEffect(() => {
    if (currentNoteId) {
      debouncedSaveNote(currentNoteId, currentNoteTitle, currentNoteContent, currentNoteTags);
    }
  }, [currentNoteTitle, currentNoteContent, currentNoteTags, currentNoteId, debouncedSaveNote]);

  const handleContentChange = (content: string) => {
    setCurrentNoteContent(content);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentNoteTitle(e.target.value);
  };

  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Simple comma-separated tags for now
    const tagsArray = e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    setCurrentNoteTags(tagsArray);
  };

  const handleExportNote = (format: 'md' | 'json') => {
    if (!currentNoteId) return;
    const noteToExport = { title: currentNoteTitle, content: currentNoteContent, tags: currentNoteTags, createdAt: new Date(), updatedAt: new Date() }; // Mock dates for export

    let dataStr;
    let filename;

    if (format === 'md') {
      dataStr = `# ${noteToExport.title}\n\nTags: ${noteToExport.tags.join(', ')}\n\n${noteToExport.content}`;
      filename = `${noteToExport.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'note'}.md`;
    } else { // json
      dataStr = JSON.stringify(noteToExport, null, 2);
      filename = `${noteToExport.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'note'}.json`;
    }

    const blob = new Blob([dataStr], { type: format === 'md' ? 'text/markdown' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Hotkeys
  useHotkeys('ctrl+s', (e) => {
    e.preventDefault();
    if (currentNoteId) {
      noteService.updateNote(currentNoteId, { title: currentNoteTitle, content: currentNoteContent, tags: currentNoteTags });
      // Could add a small "Saved!" notification here
    }
  }, { enableOnFormTags: ['input', 'textarea'] }, [currentNoteId, currentNoteTitle, currentNoteContent, currentNoteTags]);

  useHotkeys('ctrl+t', (e) => {
    e.preventDefault();
    handleCreateNewNote();
  }, { enableOnFormTags: ['input', 'textarea'] });

  // Ctrl+Enter for LM prompt (to be implemented later)
  // useHotkeys('ctrl+enter', () => { /* ... */ }, { enableOnFormTags: ['textarea'] });

  const currentView = () => {
    if (showSettings) {
      return <SettingsPage />;
    }

    if (currentNoteId === null && (!notes || notes.length === 0)) {
        return (
            <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
                <DocumentTextIcon className="h-16 w-16 text-gray-400 mb-4" />
                <h2 className="text-xl font-medium text-gray-600 dark:text-gray-300">No notes yet</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-4">Create a new note to get started.</p>
                <button
                    onClick={handleCreateNewNote}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                    Create Note
                </button>
            </div>
        );
    }

    if (currentNoteId === null && notes && notes.length > 0) {
        return (
             <div className="flex-1 p-8 flex flex-col items-center justify-center">
                <p className="text-gray-500 dark:text-gray-400">Select a note to view or edit.</p>
            </div>
        );
    }


    return (
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Editor Area */}
        <div className="p-4 border-b dark:border-gray-700">
          <input
            type="text"
            value={currentNoteTitle}
            onChange={handleTitleChange}
            placeholder="Note Title"
            className="w-full text-2xl font-semibold bg-transparent focus:outline-none pb-2 dark:text-white"
          />
          <input
            type="text"
            value={currentNoteTags.join(', ')}
            onChange={handleTagsChange}
            placeholder="Tags (comma-separated)"
            className="w-full text-sm bg-transparent focus:outline-none text-gray-500 dark:text-gray-400"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          <MarkdownEditor
            value={currentNoteContent}
            onChange={handleContentChange}
            placeholder="Start writing your note..."
          />
        </div>
        <div className="p-2 border-t dark:border-gray-700 flex justify-end space-x-2">
            <button
                onClick={() => handleExportNote('md')}
                className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded"
            >
                Export MD
            </button>
            <button
                onClick={() => handleExportNote('json')}
                className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded"
            >
                Export JSON
            </button>
            <button
                onClick={() => setShowShareModal(true)}
                className="px-3 py-1 text-xs text-white bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50"
                disabled={!currentNoteId}
                title="Share via Nostr"
            >
                Share
            </button>
        </div>

        {/* LM Interaction Area */}
        <div className="h-1/3 min-h-[200px] flex-shrink-0"> {/* Ensure it has a minimum height and doesn't shrink too much */}
          <LMInteractionArea currentNoteContent={currentNoteContent} />
        </div>
      </div>
    );
  };


  return (
    <div className="flex h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-white overflow-hidden">
      {/* Mobile Menu Button - positioned over the content area */}
      <button
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-gray-100 dark:bg-gray-700 rounded-md text-gray-600 dark:text-gray-300"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <MenuCloseIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
      </button>

      <Sidebar
        notes={notes || []}
        tags={allTags || []}
        selectedNoteId={currentNoteId}
        onSelectNote={loadNote}
        onCreateNewNote={handleCreateNewNote}
        onSelectTag={(tag) => { setSelectedTag(tag || null); setSearchTerm(''); setShowSettings(false); }}
        selectedTag={selectedTag}
        onShowSettings={() => { setShowSettings(true); setCurrentNoteId(null); setIsSidebarOpen(false);}}
        onSearchChange={(term) => { setSearchTerm(term); setSelectedTag(null); setShowSettings(false); }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      {/* Overlay for mobile when sidebar is open */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black opacity-50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}
      <main className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${isSidebarOpen ? 'md:ml-0' : 'md:ml-0'}`}> {/* Adjust margin if sidebar pushes content: ml-0 md:ml-64 if sidebar is not fixed on md */}
        {/* Add padding to main content if menu button is fixed and might overlap */}
        <div className="pt-12 md:pt-0 flex-1 flex flex-col overflow-hidden">
            {currentView()}
        </div>
      </main>
      {currentNoteId && showShareModal && (
        <ShareModal
          noteTitle={currentNoteTitle}
          noteContent={currentNoteContent}
          noteTags={currentNoteTags}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onShared={(eventId) => {
            console.log("Note shared with event ID:", eventId);
            // Could add a small notification here
          }}
        />
      )}
    </div>
  );
};

export default AppLayout;
