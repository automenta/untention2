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
} from '@heroicons/react/24/outline';
import { useHotkeys } from 'react-hotkeys-hook'; // Import useHotkeys
import AddNostrContactModal from './components/AddNostrContactModal';
import NostrProfileView from './components/NostrProfileView';
import DirectMessagesPage from './pages/DirectMessagesPage'; // Import DM Page
import { db, Note, NostrProfileNote, DirectMessage, TagPage } from './db/db'; // Added TagPage
import * as noteService from './services/noteService';
import * as nostrProfileService from './services/nostrProfileService';
import * as nostrService from './services/nostrService'; // For Kind 3 fetch
import * as settingsService from './services/settingsService'; // To check for theme and nostr pubkey
import * as tagPageService from './services/tagPageService'; // Import tagPageService
import { TagPageWithCount } from './services/tagPageService'; // Import type

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
  const [theme, setTheme] = useState<'light' | 'dark'>(
    localStorage.getItem('theme') as 'light' | 'dark' || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768); // Open by default on desktop

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

  const commandActions: CommandAction[] = [
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
      keywords: 'dm chat private message',
      perform: () => {
        handleShowDirectMessages();
        if (window.innerWidth < 768 && isSidebarOpen) setIsSidebarOpen(false);
      },
      icon: <ChatBubbleLeftRightIcon className="w-5 h-5" />,
    },
    // Future actions:
    // - Find/Search Notes (would need a way to then display results or integrate with existing search)
    // - Find/Search Contacts
    // - Specific LM tools if available
    // - Insert template/tag (more complex)
  ];

  // Re-generate commandActions if theme changes so the "Toggle Theme" name and icon updates
  // This is a bit of a workaround; ideally, CommandPalette would re-render specific items.
  // However, given the current structure, regenerating the actions array is simpler.
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
      keywords: 'dm chat private message',
      perform: () => {
        handleShowDirectMessages();
        if (window.innerWidth < 768 && isSidebarOpen) setIsSidebarOpen(false);
      },
      icon: <ChatBubbleLeftRightIcon className="w-5 h-5" />,
    },
  ], [theme, isSidebarOpen]); // Add isSidebarOpen as dependency if its state affects perform functions indirectly


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
        let profile = await nostrProfileService.getProfileNoteById(activeView.id);
        setCurrentNote(profile || null); // Display from DB first

        if (profile && navigator.onLine) { // If profile exists and online
          // Stale if not checked in the last 15 minutes, or if nostrProfileService itself would refetch (e.g. > 24h)
          const isStaleByTime = !profile.lastChecked || (Date.now() - new Date(profile.lastChecked).getTime() > 15 * 60 * 1000); // 15 minutes

          // The createOrUpdateProfileNote has its own internal 24h check for fetching.
          // We trigger an attempt if our shorter 15min window is met,
          // or rely on its internal logic if it's just to update lastChecked.
          if (isStaleByTime) {
            try {
              // Attempt to refresh. The 'true' flag suggests a fetch should be attempted.
              // The service method itself will decide based on its own more comprehensive staleness rules (e.g. 24h for kind0).
              // This call will update the DB.
              await nostrProfileService.createOrUpdateProfileNote({ npub: profile.npub }, profile.npub, true);

              // Re-fetch from DB to get the potentially updated profile
              const refreshedProfile = await nostrProfileService.getProfileNoteById(activeView.id);
              setCurrentNote(refreshedProfile || null);
            } catch (error) {
              console.warn("Failed to automatically refresh profile in App.tsx:", error);
              // Profile from DB (before refresh attempt) is already set, so UI is consistent
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
    let itemToSelectAfterSave: Note | NostrProfileNote | null = null;

    if (activeView.type === 'profile' && id) {
      const existingProfile = await nostrProfileService.getProfileNoteById(id);
      if (existingProfile) {
        // Convert tags (string names) to tagPageIds for saving
        const tagPageIds: number[] = [];
        for (const tagName of tags) {
          const tagPage = await tagPageService.getTagPageByName(tagName, true);
          if (tagPage && tagPage.id) {
            tagPageIds.push(tagPage.id);
          }
        }
        await nostrProfileService.createOrUpdateProfileNote({ ...existingProfile, title, content, tagPageIds: [...new Set(tagPageIds)] });
        itemToSelectAfterSave = await nostrProfileService.getProfileNoteById(id);
      }
    } else if (activeView.type === 'note' || activeView.type === 'new_note_editor') {
      if (id) {
        await noteService.updateNote(id, { title, content, tagInput: tags }); // noteService handles tagInput to tagPageIds conversion
        itemToSelectAfterSave = await noteService.getNoteById(id);
      } else {
        const newNoteId = await noteService.createNote(title, content, tags); // noteService handles tagInput to tagPageIds conversion
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
    <>
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
    </>
  );
}

export default App;
