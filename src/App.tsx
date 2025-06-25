import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import AppLayout from './components/AppLayout';
import AddNostrContactModal from './components/AddNostrContactModal';
import NostrProfileView from './components/NostrProfileView'; // For viewing profile details
import { db, Note, NostrProfileNote } from './db/db';
import * as noteService from './services/noteService';
import *  as nostrProfileService from './services/nostrProfileService';
import * as settingsService from './services/settingsService'; // To check for theme

type ActiveView =
  | { type: 'note'; id: number | null }
  | { type: 'profile'; id: number | null }
  | { type: 'settings' }
  | { type: 'new_note_editor' } // when 'New Note' is clicked but not yet saved
  | { type: 'new_profile_editor' }; // when 'Add Nostr Contact' is clicked

function App() {
  const [activeView, setActiveView] = useState<ActiveView>({ type: 'note', id: null });
  const [currentNote, setCurrentNote] = useState<Note | NostrProfileNote | null>(null);
  const [isEditing, setIsEditing] = useState(false); // For note/profile editor
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768); // Open by default on desktop

  // Live queries
  const notes = useLiveQuery(
    () => selectedTag
      ? noteService.getNotesByTag(selectedTag)
      : noteService.searchNotes(searchTerm),
    [searchTerm, selectedTag], []
  ) || [];

  const nostrProfiles = useLiveQuery(
    () => searchTerm
      ? db.nostrProfiles.filter(p => p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || p.npub.includes(searchTerm.toLowerCase()) || p.title.toLowerCase().includes(searchTerm.toLowerCase())).toArray()
      : nostrProfileService.getAllProfileNotes(),
    [searchTerm], []
  ) || [];

  const allTags = useLiveQuery(noteService.getAllTags, [], []) || [];
  const currentSettings = useLiveQuery(settingsService.getSettings, []);

  useEffect(() => {
    // Apply theme from settings
    if (currentSettings?.theme) {
      document.documentElement.classList.toggle('dark', currentSettings.theme === 'dark');
    }
  }, [currentSettings?.theme]);

  useEffect(() => {
    const loadInitialView = async () => {
      if (notes.length > 0 && activeView.id === null && activeView.type === 'note') {
        setActiveView({ type: 'note', id: notes[0].id! });
      } else if (notes.length === 0 && nostrProfiles.length > 0 && activeView.id === null && activeView.type === 'profile') {
         setActiveView({ type: 'profile', id: nostrProfiles[0].id! });
      }
    };
    loadInitialView();
  }, [notes, nostrProfiles]); // Only on initial load or when notes/profiles change from empty to non-empty

  useEffect(() => {
    const fetchActiveItem = async () => {
      setIsEditing(false); // Reset editing state when view changes
      if (activeView.type === 'note' && activeView.id !== null) {
        const note = await noteService.getNoteById(activeView.id);
        setCurrentNote(note || null);
        if (note) setIsEditing(true); // Auto-edit existing notes
      } else if (activeView.type === 'profile' && activeView.id !== null) {
        const profile = await nostrProfileService.getProfileNoteById(activeView.id);
        setCurrentNote(profile || null);
        // Profile view is separate, editing is specific to local fields
      } else if (activeView.type === 'new_note_editor') {
        setCurrentNote(null); // No current note for new
        setIsEditing(true);
      } else {
        setCurrentNote(null);
      }
    };
    fetchActiveItem();
  }, [activeView]);

  const handleSelectNote = (id: number, isProfile: boolean) => {
    setActiveView(isProfile ? { type: 'profile', id } : { type: 'note', id });
    setIsEditing(!isProfile); // Auto-edit notes, not profiles initially
  };

  const handleCreateNewNote = () => {
    setActiveView({ type: 'new_note_editor' });
    setCurrentNote(null); // Explicitly clear currentNote
    setIsEditing(true);
  };

  const handleCreateNewProfile = () => {
    setIsAddContactModalOpen(true);
  };

  const handleContactAdded = async (profileId: number) => {
    setIsAddContactModalOpen(false);
    const profile = await nostrProfileService.getProfileNoteById(profileId);
    if (profile) {
      setCurrentNote(profile);
      setActiveView({ type: 'profile', id: profileId });
    }
  };

  const handleSaveNote = async (id: number | undefined, title: string, content: string, tags: string[]) => {
    if (activeView.type === 'profile' && id) { // Editing local fields of a profile
      const existingProfile = await nostrProfileService.getProfileNoteById(id);
      if (existingProfile) {
        await nostrProfileService.createOrUpdateProfileNote({ ...existingProfile, title, content, tags });
        const updatedProfile = await nostrProfileService.getProfileNoteById(id);
        setCurrentNote(updatedProfile || null); // Refresh current note
      }
    } else if (activeView.type === 'note' || activeView.type === 'new_note_editor') { // Regular note
      if (id) { // Existing note
        await noteService.updateNote(id, { title, content, tags });
      } else { // New note
        const newNoteId = await noteService.createNote(title, content, tags);
        setActiveView({ type: 'note', id: newNoteId }); // Switch to the new note
      }
    }
    setIsEditing(false); // Exit editing mode after save
    // Data will refresh via live queries
  };

  const handleDeleteNoteOrProfile = async (id: number) => {
    if (activeView.type === 'note' && activeView.id === id) {
      await noteService.deleteNote(id);
    } else if (activeView.type === 'profile' && activeView.id === id) {
      const profile = currentNote as NostrProfileNote; // Should be safe given activeView.type
      await nostrProfileService.deleteProfileNoteById(id);
    }

    setCurrentNote(null);
    // Attempt to select next available item or clear view
    if (notes.length > 0) {
        setActiveView({ type: 'note', id: notes[0].id! });
    } else if (nostrProfiles.length > 0) {
        setActiveView({ type: 'profile', id: nostrProfiles[0].id! });
    } else {
        setActiveView({ type: 'note', id: null }); // Fallback to empty note view
    }
  };

  const handleRefetchProfile = async (npub: string) => {
    if (activeView.type === 'profile' && activeView.id) {
        try {
            await nostrProfileService.createOrUpdateProfileNote({}, npub); // This will trigger fetch
            const updatedProfile = await nostrProfileService.getProfileNoteById(activeView.id);
            setCurrentNote(updatedProfile || null); // Refresh view
        } catch (error) {
            console.error("Error refetching profile:", error);
            // TODO: Show error to user
        }
    }
  };

  const handleShowSettings = () => setActiveView({ type: 'settings' });
  const handleExitSettings = () => setActiveView({ type: 'note', id: currentNote?.id || (notes.length > 0 ? notes[0].id : null) });

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const getEditorKey = () => {
    if (activeView.type === 'new_note_editor') return 'new-note';
    return currentNote?.id || 'no-note-selected';
  };


  return (
    <>
      <AppLayout
        sidebar={{
          notes: notes.filter(n => !n.tags.includes('nostrProfile')), // Filter out profiles from notes list
          nostrProfiles: nostrProfiles,
          tags: allTags,
          selectedNoteId: activeView.type === 'note' ? activeView.id : null,
          selectedProfileId: activeView.type === 'profile' ? activeView.id : null,
          onSelectNote: handleSelectNote,
          onCreateNewNote: handleCreateNewNote,
          onCreateNewProfile: handleCreateNewProfile,
          onSelectTag: setSelectedTag,
          selectedTag: selectedTag,
          onShowSettings: handleShowSettings,
          onSearchChange: setSearchTerm,
          isOpen: isSidebarOpen,
          onClose: () => setIsSidebarOpen(false),
        }}
        mainContent={{
          activeView,
          currentNote,
          isEditing,
          onSaveNote: handleSaveNote,
          onDeleteNoteOrProfile: handleDeleteNoteOrProfile,
          onSetIsEditing: setIsEditing,
          onExitSettings: handleExitSettings,
          editorKey: getEditorKey().toString(),
          ProfileViewComponent: NostrProfileView, // Pass the component itself
          onEditProfileLocalFields: (profileId) => { // For NostrProfileView edit button
            setActiveView({type: 'profile', id: profileId });
            setIsEditing(true); // Enable editor for local fields
          },
          onRefetchProfileData: handleRefetchProfile,
        }}
        onToggleSidebar={toggleSidebar}
      />
      <AddNostrContactModal
        isOpen={isAddContactModalOpen}
        onClose={() => setIsAddContactModalOpen(false)}
        onContactAdded={handleContactAdded}
      />
    </>
  );
}

export default App;
