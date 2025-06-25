import React, { useState, useEffect, useRef, useCallback } from 'react';
import SimpleMDE from 'easymde'; // Correct import
import 'easymde/dist/easymde.min.css'; // Correct CSS import
import './MarkdownEditor.css';
import { Note, NostrProfileNote } from '../db/db';
import { TrashIcon, ShareIcon as ShareOutlineIcon, CheckIcon } from '@heroicons/react/24/outline';

interface MarkdownEditorProps {
  note: Note | NostrProfileNote | null;
  onSave: (id: number | undefined, title: string, content: string, tags: string[]) => void;
  onDelete?: (id: number) => void;
  onShare?: () => void;
  isProfileEditing?: boolean;
  editorKey: string; // Force re-render / re-init when key changes (e.g. new note)
}

const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  note,
  onSave,
  onDelete,
  onShare,
  isProfileEditing = false,
  editorKey, // Use this key to re-initialize SimpleMDE when the note fundamentally changes
}) => {
  const [title, setTitle] = useState('');
  const [currentContent, setCurrentContent] = useState(''); // Content for SimpleMDE
  const [tags, setTags] = useState<string[]>([]);
  const [isAutoSaved, setIsAutoSaved] = useState(false);

  const simpleMdeInstance = useRef<SimpleMDE | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const initializeEditor = useCallback((initialContentValue: string) => {
    if (simpleMdeInstance.current) {
        simpleMdeInstance.current.toTextArea(); // Destroy existing instance
        simpleMdeInstance.current = null;
    }
    if (textAreaRef.current) {
      const mde = new SimpleMDE({
        element: textAreaRef.current,
        initialValue: initialContentValue,
        autofocus: !isProfileEditing, // Autofocus content for notes, not for profile title
        spellChecker: false,
        toolbar: [
          "bold", "italic", "heading", "|",
          "quote", "unordered-list", "ordered-list", "|",
          "link", "image", "|",
          "preview", "side-by-side", "fullscreen", "|",
          "guide"
        ],
        status: false,
      });
      mde.codemirror.on("change", () => {
        setCurrentContent(mde.value());
        setIsAutoSaved(false);
      });
      simpleMdeInstance.current = mde;
    }
  }, [isProfileEditing]); // Add isProfileEditing dependency

  useEffect(() => {
    const noteTitle = note?.title || (isProfileEditing ? 'Edit Profile Notes' : '');
    const noteContent = note?.content || '';
    const noteTags = note?.tags || (isProfileEditing ? (note && 'npub' in note ? (note.tags.includes('nostrProfile') ? note.tags : [...note.tags, 'nostrProfile']) : ['nostrProfile']) : []);

    setTitle(noteTitle);
    setCurrentContent(noteContent); // Update state for MDE
    setTags(noteTags);

    initializeEditor(noteContent);

    if (isProfileEditing && titleInputRef.current) {
        titleInputRef.current.focus(); // Focus title for profile editing
    } else if (!isProfileEditing && !note?.id && titleInputRef.current) {
        titleInputRef.current.focus(); // Focus title for new notes
    } else if (!isProfileEditing && simpleMdeInstance.current) {
        simpleMdeInstance.current.codemirror.focus(); // Focus content for existing notes
    }

    return () => {
      if (simpleMdeInstance.current) {
        simpleMdeInstance.current.toTextArea();
        simpleMdeInstance.current = null;
      }
    };
  }, [editorKey, note, isProfileEditing, initializeEditor]); // editorKey ensures re-init

  // Debounced auto-save for content changes
  useEffect(() => {
    const handler = setTimeout(() => {
      if (currentContent !== (note?.content || '') || title !== (note?.title || '') || JSON.stringify(tags) !== JSON.stringify(note?.tags || [])) {
         // Only save if there's an actual change from the initial prop values or if it's a new item without an ID yet.
         // For new items (note?.id is undefined), this auto-save will effectively create it if user types something.
         // Or, we can rely on explicit save for new items. Let's prefer explicit save for new items.
        if (note?.id || (isProfileEditing && note?.id)) { // Auto-save existing items or profile's local notes
            onSave(note?.id, title, currentContent, tags);
            setIsAutoSaved(true);
            setTimeout(() => setIsAutoSaved(false), 2000);
        }
      }
    }, 1500);

    return () => clearTimeout(handler);
  }, [currentContent, title, tags, note, onSave, isProfileEditing]);

  const handleManualSave = () => {
    onSave(note?.id, title, currentContent, tags);
    setIsAutoSaved(true);
    setTimeout(() => setIsAutoSaved(false), 2000);
  };

  const handleDeleteClick = () => {
    if (note?.id && onDelete) {
      const confirmMessage = isProfileEditing
        ? `Are you sure you want to delete the local alias & notes for this contact? The Nostr profile data from the relay will not be affected.`
        : `Are you sure you want to delete "${title || 'this note'}"?`;
      if (window.confirm(confirmMessage)) {
        onDelete(note.id);
      }
    }
  };

  return (
    <div className="markdown-editor-container flex flex-col h-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      <div className="p-3 border-b dark:border-gray-700">
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setIsAutoSaved(false); }}
          placeholder={isProfileEditing ? "Local Alias (optional)" : "Note Title"}
          className="w-full text-xl md:text-2xl font-semibold bg-transparent focus:outline-none mb-2 dark:text-white"
        />
        {!isProfileEditing && (
          <input
            type="text"
            value={tags.join(', ')}
            onChange={(e) => { setTags(e.target.value.split(',').map(t => t.trim()).filter(t => t)); setIsAutoSaved(false); }}
            placeholder="Tags (comma-separated)"
            className="w-full text-sm bg-transparent focus:outline-none text-gray-500 dark:text-gray-400"
          />
        )}
        {isProfileEditing && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            You are editing the local alias and private notes for this Nostr contact.
            External profile data (name, picture, etc.) is fetched from the relay.
          </p>
        )}
      </div>

      <div className="flex-grow overflow-y-auto relative editor-area-wrapper">
        <textarea ref={textAreaRef} /> {/* SimpleMDE will attach here */}
      </div>

      <div className="p-2 border-t dark:border-gray-700 flex justify-between items-center">
        <div className="text-xs text-green-500 dark:text-green-400 transition-opacity duration-500 h-5">
          {isAutoSaved && <span className="flex items-center"><CheckIcon className="h-4 w-4 mr-1"/> Saved</span>}
        </div>
        <div className="flex space-x-2">
          {onShare && !isProfileEditing && ( // Share only for regular notes
            <button
              onClick={onShare}
              className="p-1.5 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 rounded-md hover:bg-purple-100 dark:hover:bg-gray-700"
              title="Share Note"
            >
              <ShareOutlineIcon className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={handleManualSave}
            className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Save (Ctrl+S)"
          >
            Save
          </button>
          {note?.id && onDelete && (
            <button
              onClick={handleDeleteClick}
              className="p-1.5 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 rounded-md hover:bg-red-100 dark:hover:bg-gray-700"
              title={isProfileEditing ? "Delete Local Alias & Notes" : "Delete Note"}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarkdownEditor;
