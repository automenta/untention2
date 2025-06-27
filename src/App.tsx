import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import AppLayout from './components/AppLayout';
import CommandPalette, { CommandAction } from './components/CommandPalette'; // Import CommandPalette
import {
  DocumentPlusIcon,
  UserPlusIcon,
  Cog8ToothIcon,
  SunIcon,
  MoonIcon,
  ChatBubbleLeftRightIcon,
  TagIcon, // Added for Manage Tags
  TrashIcon, // Added for Clear Cache
} from '@heroicons/react/24/outline';
import { useHotkeys } from 'react-hotkeys-hook'; // Import useHotkeys
import AddNostrContactModal from './components/AddNostrContactModal';
import NostrProfileView from './components/NostrProfileView';
import DirectMessagesPage from './pages/DirectMessagesPage'; // Import DM Page
import TagManagementView from './components/TagManagementView'; // Added for Manage Tags
import { db, Note, NostrProfileNote, DirectMessage, TagPage } from './db/db';
import * as noteService from './services/noteService';
import * as nostrProfileService from './services/nostrProfileService';
import { FullToastProvider, useToastContext } from './contexts/ToastContext'; // Import ToastProvider and useToastContext
import ToastContainer from './components/ToastContainer'; // Import ToastContainer
import * as nostrService from './services/nostrService'; // For Kind 3 fetch
import * as settingsService from './services/settingsService'; // To check for theme and nostr pubkey
import * as tagPageService from './services/tagPageService'; // Import tagPageService
import { TagPageWithCount } from './services/tagPageService'; // Import type
import * as lmCacheService from './services/lmCacheService'; // Added for Clear LM Cache

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
  const [selectedTagPageId, setSelectedTagPageId] = useState<number | null>(null);

  const [isAddContactModalOpen, setIsAddContactModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false); // State for Command Palette
  const [isTagManagementViewOpen, setIsTagManagementViewOpen] = useState(false); // State for TagManagementView
  const [theme, setTheme] = useState<'light' | 'dark'>(
    localStorage.getItem('theme') as 'light' | 'dark' || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768); // Open by default on desktop

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const { addToast } = useToastContext();

  // Keyboard shortcut for Command Palette
  useHotkeys('ctrl+k, cmd+k', (event) => {
    event.preventDefault(); // Prevent browser's default find action or other conflicts
    setIsCommandPaletteOpen(prev => !prev);
  }, { preventDefault: true }, [setIsCommandPaletteOpen]);


  // Live queries
  const notes = useLiveQuery(
    () => selectedTagPageId !== null
      ? noteService.getNotesByTagPageId(selectedTagPageId)
      : noteService.searchNotes(searchTerm),
    [searchTerm, selectedTagPageId], []
  ) || [];

  // Fetch all Nostr profiles. Client-side filter will be applied below if a tag is selected.
  const allNostrProfiles = useLiveQuery(
    () => searchTerm
      ? nostrProfileService.searchProfiles(searchTerm) // Assuming searchProfiles exists
      : nostrProfileService.getAllProfileNotes(),
    [searchTerm], // selectedTagPageId is not a direct dependency for the DB query here
    []
  ) || [];

  // Apply client-side filtering for Nostr profiles based on selectedTagPageId
  const nostrProfiles = React.useMemo(() => {
    if (selectedTagPageId === null) {
      return allNostrProfiles;
    }
    return allNostrProfiles.filter(profile =>
      profile.tagPageIds && profile.tagPageIds.includes(selectedTagPageId)
    );
  }, [allNostrProfiles, selectedTagPageId]);


  // Fetch all TagPages with their item counts for the sidebar
  const allTagPagesWithCounts = useLiveQuery(
    tagPageService.getAllTagPagesWithItemCounts,
    [], // No direct dependencies for the query itself, liveQuery handles updates from Dexie
    [] // Initial empty array
  ) || [];

  const currentSettings = useLiveQuery(settingsService.getSettings, []);

  useEffect(() => {
    // Apply theme from settings OR local theme state
    const themeToApply = currentSettings?.theme || theme;
    if (themeToApply) {
      document.documentElement.classList.toggle('dark', themeToApply === 'dark');
      localStorage.setItem('theme', themeToApply); // Save to localStorage
      if (currentSettings && currentSettings.theme !== themeToApply) {
        // If settingsService has a theme, and it's different, update settingsService
        // This syncs theme changes from command palette back to settings
        settingsService.updateSettings({ theme: themeToApply });
      }
    }
  }, [theme, currentSettings?.theme]);


  function toggleTheme() {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  }

  // Define handlers used in commandActions *before* commandActions definition
  function handleCreateNewNote() {
    setActiveView({ type: 'new_note_editor' });
    setCurrentNote(null);
    setIsEditing(true);
  }

  function handleCreateNewProfile() {
    setIsAddContactModalOpen(true);
  }

  function handleShowSettings() {
    setActiveView({ type: 'settings' });
  }

  function handleShowDirectMessages() {
    setActiveView({ type: 'direct_messages' });
    setCurrentNote(null); // Clear any active note/profile when switching to DMs
    setIsEditing(false);
  }

  function handleShowTagManagementView() {
    setIsTagManagementViewOpen(true);
  }

  async function handleClearLmCache() {
    if (window.confirm("Are you sure you want to clear the LM response cache? This cannot be undone.")) {
      try {
        await lmCacheService.clearLMCache();
        addToast('LM response cache cleared successfully.', 'success');
      } catch (error) {
        addToast(`Failed to clear LM cache: ${(error as Error).message}`, 'error');
        console.error("Failed to clear LM cache:", error);
      }
    }
  }

  // Regenerate commandActions if theme changes so the "Toggle Theme" name and icon updates
  // Also depends on isSidebarOpen for closing sidebar logic.
  const memoizedCommandActions = React.useMemo(() => [
    {
      id: 'new-note',
      name: 'New Note',
      keywords: 'create document text',
      perform: () => {
        handleCreateNewNote();
        if (window.innerWidth < 768 && isSidebarOpen) setIsSidebarOpen(false);
      },
      icon: <DocumentPlusIcon className="w-5 h-5" />,
    },
    {
      id: 'add-nostr-contact',
      name: 'Add Nostr Contact',
      keywords: 'profile person new follow',
      perform: handleCreateNewProfile,
      icon: <UserPlusIcon className="w-5 h-5" />,
    },
    {
      id: 'open-settings',
      name: 'Open Settings',
      keywords: 'preferences configuration options',
      perform: () => {
        handleShowSettings();
        if (window.innerWidth < 768 && isSidebarOpen) setIsSidebarOpen(false);
      },
      icon: <Cog8ToothIcon className="w-5 h-5" />,
    },
    {
      id: 'toggle-theme',
      name: `Toggle Theme to ${theme === 'light' ? 'Dark' : 'Light'}`,
      keywords: 'dark light appearance mode style',
      perform: toggleTheme,
      icon: theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />,
    },
    {
      id: 'direct-messages',
      name: 'Direct Messages',
      keywords: 'dm chat private message nostr',
      perform: () => {
        handleShowDirectMessages();
        if (window.innerWidth < 768 && isSidebarOpen) setIsSidebarOpen(false);
      },
      icon: <ChatBubbleLeftRightIcon className="w-5 h-5" />,
    },
    {
      id: 'manage-tags',
      name: 'Manage Tags',
      keywords: 'tags categories labels organize',
      perform: () => {
        handleShowTagManagementView();
        // CommandPalette closes itself, no need to manage sidebar here explicitly for modal
      },
      icon: <TagIcon className="w-5 h-5" />,
    },
    {
      id: 'clear-lm-cache',
      name: 'Clear LM Cache',
      keywords: 'llm large language model cache memory clear delete reset',
      perform: handleClearLmCache,
      icon: <TrashIcon className="w-5 h-5" />,
    },
  ], [theme, isSidebarOpen, addToast]); // Added addToast to dependencies


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
           addToast(`Failed to load contacts: ${(error as Error).message}`, 'error');
        }
      } else {
         // This is a normal operational state, not an error.
         // console.log("Nostr pubkey not configured, skipping Kind 3 contact list fetch.");
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
        let profile = await nostrProfileService.getProfileNoteById(activeView.id);
        setCurrentNote(profile || null); // Display from DB first

        if (profile && navigator.onLine) { // If profile exists and online
          // Stale if not checked in the last 15 minutes, or if nostrProfileService itself would refetch (e.g. > 24h)
          const isStaleByTime = !profile.lastChecked || (Date.now() - new Date(profile.lastChecked).getTime() > 15 * 60 * 1000); // 15 minutes

          if (isStaleByTime) {
            setIsFetchingProfile(true);
            try {
              await nostrProfileService.createOrUpdateProfileNote({ npub: profile.npub }, profile.npub, true);
              const refreshedProfile = await nostrProfileService.getProfileNoteById(activeView.id);
              setCurrentNote(refreshedProfile || null);
              // addToast('Profile data refreshed.', 'success'); // Optional: can be noisy
            } catch (error) {
              console.error("Failed to automatically refresh profile in App.tsx:", error);
              addToast(`Failed to refresh profile: ${(error as Error).message}`, 'error');
            } finally {
              setIsFetchingProfile(false);
            }
          }
        }
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

  // const handleCreateNewNote = () => { // Moved up
  //   setActiveView({ type: 'new_note_editor' });
  //   setCurrentNote(null);
  //   setIsEditing(true);
  // };

  // const handleCreateNewProfile = () => { // Moved up
  //   setIsAddContactModalOpen(true);
  // };

  // const handleShowDirectMessages = () => { // Moved up
  //   setActiveView({ type: 'direct_messages' });
  //   setCurrentNote(null); // Clear any active note/profile when switching to DMs
  //   setIsEditing(false);
  // };

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
    setIsSaving(true);
    let itemToSelectAfterSave: Note | NostrProfileNote | null = null;
    let successMessage = '';

    try {
      if (activeView.type === 'profile' && id) {
        const existingProfile = await nostrProfileService.getProfileNoteById(id);
        if (existingProfile) {
          const tagPageIds: number[] = [];
          for (const tagName of tags) {
            const tagPage = await tagPageService.getTagPageByName(tagName, true);
            if (tagPage && tagPage.id) {
              tagPageIds.push(tagPage.id);
            }
          }
          await nostrProfileService.createOrUpdateProfileNote({ ...existingProfile, title, content, tagPageIds: [...new Set(tagPageIds)] });
          itemToSelectAfterSave = await nostrProfileService.getProfileNoteById(id);
          successMessage = 'Profile saved successfully.';
        } else {
          throw new Error('Profile not found for saving.');
        }
      } else if (activeView.type === 'note' || activeView.type === 'new_note_editor') {
        if (id) {
          await noteService.updateNote(id, { title, content, tagInput: tags });
          itemToSelectAfterSave = await noteService.getNoteById(id);
          successMessage = 'Note updated successfully.';
        } else {
          const newNoteId = await noteService.createNote(title, content, tags);
          itemToSelectAfterSave = await noteService.getNoteById(newNoteId);
          if (itemToSelectAfterSave) setActiveView({ type: 'note', id: newNoteId });
          successMessage = 'Note created successfully.';
        }
      }
      addToast(successMessage, 'success');
    } catch (error) {
      console.error('Error saving:', error);
      addToast(`Error saving: ${(error as Error).message}`, 'error');
    } finally {
      setIsSaving(false);
    }

    setCurrentNote(itemToSelectAfterSave || null);
    // Only exit editing mode if not creating a new note (which auto-navigates and might stay in edit mode)
    if (!(activeView.type === 'new_note_editor' && itemToSelectAfterSave)) {
        setIsEditing(false);
    }
  };

  const handleDeleteNoteOrProfile = async (id: number) => {
    setIsDeleting(true);
    try {
      if (activeView.type === 'note' && activeView.id === id) {
        await noteService.deleteNote(id);
        addToast('Note deleted successfully.', 'success');
      } else if (activeView.type === 'profile' && activeView.id === id) {
        await nostrProfileService.deleteProfileNoteById(id);
        addToast('Profile contact and local notes deleted successfully.', 'success');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      addToast(`Error deleting: ${(error as Error).message}`, 'error');
    } finally {
      setIsDeleting(false);
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
      setIsFetchingProfile(true);
      try {
        await nostrProfileService.createOrUpdateProfileNote({ npub }, npub, true);
        const updatedProfile = await nostrProfileService.getProfileNoteById(activeView.id);
        setCurrentNote(updatedProfile || null);
        addToast('Profile data refreshed.', 'success');
      } catch (error) {
        console.error("Error refetching profile:", error);
        addToast(`Failed to refresh profile: ${(error as Error).message}`, 'error');
      } finally {
        setIsFetchingProfile(false);
      }
    }
  };

  // const handleShowSettings = () => setActiveView({ type: 'settings' }); // Moved up
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
    <FullToastProvider>
      <ToastContainer />
      <AppLayout
        sidebar={{
          notes: notes,
          nostrProfiles: nostrProfiles,
          tagPagesWithCounts: allTagPagesWithCounts,
          selectedNoteId: activeView.type === 'note' ? activeView.id : null,
          selectedProfileId: activeView.type === 'profile' ? activeView.id : null,
          onSelectNote: handleSelectNote,
          onCreateNewNote: handleCreateNewNote,
          onCreateNewProfile: handleCreateNewProfile,
          onSelectTagPageId: setSelectedTagPageId,
          selectedTagPageId: selectedTagPageId,
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
          isSaving: isSaving,
          isDeleting: isDeleting,
          isFetchingProfile: isFetchingProfile, // Pass down
        }}
        onToggleSidebar={toggleSidebar}
      />
      <AddNostrContactModal
        isOpen={isAddContactModalOpen}
        onClose={() => setIsAddContactModalOpen(false)}
        onContactAdded={handleContactAdded}
      />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        actions={memoizedCommandActions}
        currentTheme={theme}
      />
      <TagManagementView
        isOpen={isTagManagementViewOpen}
        onClose={() => setIsTagManagementViewOpen(false)}
      />
    </FullToastProvider>
  );
}

export default App;
