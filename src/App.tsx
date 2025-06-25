import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import AppLayout from './components/AppLayout';
import AddNostrContactModal from './components/AddNostrContactModal';
import NostrProfileView from './components/NostrProfileView';
import DirectMessagesPage from './pages/DirectMessagesPage'; // Import DM Page
import { db, Note, NostrProfileNote, DirectMessage } from './db/db';
import * as noteService from './services/noteService';
import *  as nostrProfileService from './services/nostrProfileService';
import * as nostrService from './services/nostrService'; // For Kind 3 fetch
import * as settingsService from './services/settingsService'; // To check for theme and nostr pubkey

type ActiveView =
  | { type: 'note'; id: number | null }
  | { type: 'profile'; id: number | null }
  | { type: 'settings' }
  | { type: 'direct_messages' } // New view for DMs
  | { type: 'new_note_editor' } // when 'New Note' is clicked but not yet saved
  | { type: 'new_profile_editor' }; // when 'Add Nostr Contact' is clicked

function App() {
  const [activeView, setActiveView] = useState<ActiveView>({ type: 'direct_messages' }); // Default to DMs or notes
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

  // Effect for fetching user's Kind 3 contact list on startup
  useEffect(() => {
    const fetchUserContacts = async () => {
      if (currentSettings?.nostrPubKey) {
        try {
          console.log("Attempting to fetch user's Kind 3 contact list...");
          const kind3Event = await nostrService.fetchKind3ContactListEvent(currentSettings.nostrPubKey);
          if (kind3Event && kind3Event.tags) {
            let contactsProcessed = 0;
            for (const tag of kind3Event.tags) {
              if (tag[0] === 'p' && tag[1]) {
                const contactHexPubkey = tag[1];
                const contactNpub = nostrService.pubKeyToNpub(contactHexPubkey); // Use nostrService for consistency
                const petname = tag[3] || undefined;

                // Check if profile exists, if not, create with isContact: true
                // If exists, ensure isContact: true
                const existingProfile = await nostrProfileService.getProfileNoteByNpub(contactNpub);
                if (existingProfile) {
                  if (!existingProfile.isContact || (petname && existingProfile.title !== petname)) {
                    await nostrProfileService.createOrUpdateProfileNote(
                      { ...existingProfile, title: petname || existingProfile.title, isContact: true },
                      contactNpub,
                      !existingProfile.lastChecked || Date.now() - new Date(existingProfile.lastChecked).getTime() > 24 * 60 * 60 * 1000 // Fetch if stale
                    );
                  }
                } else {
                  await nostrProfileService.createOrUpdateProfileNote(
                    { npub: contactNpub, title: petname || contactNpub.substring(0,10), isContact: true },
                    contactNpub,
                    true // Fetch kind0 for new contact
                  );
                }
                contactsProcessed++;
              }
            }
            if (contactsProcessed > 0) {
                console.log(`User's Kind 3 contact list processed: ${contactsProcessed} contacts updated/added.`);
            } else {
                console.log("User's Kind 3 contact list found but contained no processable 'p' tags.");
            }
          } else {
            console.log("No Kind 3 contact list found for the user or it's empty.");
          }
        } catch (error) {
          console.error("Failed to fetch or process user's Kind 3 contact list:", error);
        }
      } else {
        console.log("Nostr pubkey not configured, skipping Kind 3 contact list fetch.");
      }
    };

    // Only run once when currentSettings (and thus nostrPubKey) becomes available
    if (currentSettings && currentSettings.nostrPubKey) {
        // Check if contacts have already been loaded to prevent multiple fetches if App re-renders
        const alreadyLoaded = sessionStorage.getItem('nostrContactsLoaded');
        if (!alreadyLoaded) {
            fetchUserContacts();
            sessionStorage.setItem('nostrContactsLoaded', 'true');
        }
    }
  }, [currentSettings]);


  useEffect(() => {
    const loadInitialView = async () => {
      if (notes.length > 0 && activeView.id === null && activeView.type === 'note') {
        setActiveView({ type: 'note', id: notes[0].id! });
      } else if (notes.length === 0 && nostrProfiles.length > 0 && activeView.id === null && activeView.type === 'profile') { // Check this condition
         setActiveView({ type: 'profile', id: nostrProfiles[0].id! });
      } else if (activeView.type === 'note' && activeView.id === null && notes.length === 0 && nostrProfiles.length === 0) {
        // If everything is empty, ensure it doesn't try to set an ID.
        // This might already be handled by currentNote becoming null.
      }
    };
    loadInitialView();
  }, [notes, nostrProfiles, activeView.id, activeView.type]); // Adjusted dependencies


  useEffect(() => {
    const fetchActiveItem = async () => {
      setIsEditing(false); // Reset editing state when view changes
      if (activeView.type === 'note' && activeView.id !== null) {
        const note = await noteService.getNoteById(activeView.id);
        setCurrentNote(note || null);
        if (note) setIsEditing(true);
      } else if (activeView.type === 'profile' && activeView.id !== null) {
        const profile = await nostrProfileService.getProfileNoteById(activeView.id);
        setCurrentNote(profile || null);
      } else if (activeView.type === 'new_note_editor') {
        setCurrentNote(null);
        setIsEditing(true);
      } else if (activeView.type !== 'direct_messages' && activeView.type !== 'settings') { // Don't nullify for DM or settings
        setCurrentNote(null);
      }
    };
    fetchActiveItem();
  }, [activeView]);

  // DM Subscription is now handled within DirectMessagesPage.tsx itself
  // The global DM subscription logic previously planned for App.tsx is better scoped there.

  const handleSelectNote = (id: number, isProfile: boolean) => {
    setActiveView(isProfile ? { type: 'profile', id } : { type: 'note', id });
    if (!isProfile) setIsEditing(true); // Auto-edit notes
  };

  const handleCreateNewNote = () => {
    setActiveView({ type: 'new_note_editor' });
    setCurrentNote(null);
    setIsEditing(true);
  };

  const handleCreateNewProfile = () => {
    setIsAddContactModalOpen(true);
  };

  const handleShowDirectMessages = () => {
    setActiveView({ type: 'direct_messages' });
    setCurrentNote(null); // Clear any active note/profile when switching to DMs
    setIsEditing(false);
  };

  const handleContactAdded = async (profileId: number) => {
    setIsAddContactModalOpen(false);
    const profile = await nostrProfileService.getProfileNoteById(profileId);
    if (profile) {
      // Do not automatically set currentNote or activeView here,
      // let the user navigate to the profile if they wish.
      // Potentially, if the DM page is active, we could switch to a chat with this new contact.
      if(activeView.type === 'direct_messages') {
        // Future enhancement: select this contact in DM page
      }
    }
  };

  const handleSaveNote = async (id: number | undefined, title: string, content: string, tags: string[]) => {
    let itemToSelectAfterSave: Note | NostrProfileNote | null = null;

    if (activeView.type === 'profile' && id) {
      const existingProfile = await nostrProfileService.getProfileNoteById(id);
      if (existingProfile) {
        await nostrProfileService.createOrUpdateProfileNote({ ...existingProfile, title, content, tags });
        itemToSelectAfterSave = await nostrProfileService.getProfileNoteById(id);
      }
    } else if (activeView.type === 'note' || activeView.type === 'new_note_editor') {
      if (id) {
        await noteService.updateNote(id, { title, content, tags });
        itemToSelectAfterSave = await noteService.getNoteById(id);
      } else {
        const newNoteId = await noteService.createNote(title, content, tags);
        itemToSelectAfterSave = await noteService.getNoteById(newNoteId);
        if (itemToSelectAfterSave) setActiveView({ type: 'note', id: newNoteId });
      }
    }

    setCurrentNote(itemToSelectAfterSave || null);
    setIsEditing(false); // Exit editing mode
  };

  const handleDeleteNoteOrProfile = async (id: number) => {
    if (activeView.type === 'note' && activeView.id === id) {
      await noteService.deleteNote(id);
    } else if (activeView.type === 'profile' && activeView.id === id) {
      await nostrProfileService.deleteProfileNoteById(id);
    }

    setCurrentNote(null);
    // Select next available item or clear view
    const remainingNotes = await noteService.searchNotes(''); // Get all notes
    const remainingProfiles = await nostrProfileService.getAllProfileNotes();

    if (remainingNotes.length > 0) {
        setActiveView({ type: 'note', id: remainingNotes[0].id! });
    } else if (remainingProfiles.length > 0) {
        setActiveView({ type: 'profile', id: remainingProfiles[0].id! });
    } else {
        setActiveView({ type: 'note', id: null });
    }
  };

  const handleRefetchProfile = async (npub: string) => {
    if (activeView.type === 'profile' && activeView.id) {
        try {
            // Force fetch by setting fetchFromRelay to true in createOrUpdateProfileNote
            await nostrProfileService.createOrUpdateProfileNote({ npub }, npub, true);
            const updatedProfile = await nostrProfileService.getProfileNoteById(activeView.id);
            setCurrentNote(updatedProfile || null);
        } catch (error) {
            console.error("Error refetching profile:", error);
        }
    }
  };

  const handleShowSettings = () => setActiveView({ type: 'settings' });
  const handleExitSettings = () => {
     // Default to DMs if no other view was active, or to the last note/profile
    if (currentNote && activeView.type !== 'settings') { // activeView might be 'profile' or 'note'
        setActiveView(activeView);
    } else if (notes.length > 0) {
        setActiveView({type: 'note', id: notes[0].id});
    } else {
        setActiveView({type: 'direct_messages'});
    }
  }

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
          onShowDirectMessages: handleShowDirectMessages, // Pass handler for DMs
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
          ProfileViewComponent: NostrProfileView,
          DirectMessagesPageComponent: DirectMessagesPage, // Pass DM Page
          onEditProfileLocalFields: (profileId) => {
            setActiveView({type: 'profile', id: profileId });
            setIsEditing(true);
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
