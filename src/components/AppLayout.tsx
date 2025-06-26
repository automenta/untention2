import React from 'react';
import Sidebar, { SidebarProps } from './Sidebar';
import MarkdownEditor from './MarkdownEditor';
import SettingsPage from './SettingsPage';
import LMInteractionArea from './LMInteractionArea';
import { Note, NostrProfileNote } from '../db/db';
import { Bars3Icon, XMarkIcon as MenuCloseIcon, ShareIcon, DocumentPlusIcon } from '@heroicons/react/24/outline';
import ShareModal from './ShareModal';

// Define a more specific type for activeView in App.tsx and pass it down
export type ActiveViewType =
  | { type: 'note'; id: number | null }
  | { type: 'profile'; id: number | null }
  | { type: 'settings' }
  | { type: 'direct_messages' } // Added for DM page
  | { type: 'new_note_editor' }
  | { type: 'new_profile_editor' };

interface MainContentProps {
  activeView: ActiveViewType;
  DirectMessagesPageComponent?: React.FC<any>; // Optional DM Page component
  currentNote: Note | NostrProfileNote | null; // Can be a regular note or a profile note
  isEditing: boolean;
  onSaveNote: (id: number | undefined, title: string, content: string, tags: string[]) => void;
  onDeleteNoteOrProfile: (id: number) => void;
  onSetIsEditing: (editing: boolean) => void;
  onExitSettings: () => void; // To go back from settings page
  editorKey: string; // For MarkdownEditor re-mount
  ProfileViewComponent: React.FC<any>; // Specific props for NostrProfileView will be spread
  onEditProfileLocalFields: (profileId: number) => void;
  onRefetchProfileData: (npub: string) => void;
}

interface AppLayoutProps {
  sidebar: SidebarProps;
  mainContent: MainContentProps;
  onToggleSidebar: () => void;
}

const AppLayout: React.FC<AppLayoutProps> = ({ sidebar, mainContent, onToggleSidebar }) => {
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);

  const {
    activeView,
    currentNote, // This is the item to be displayed or edited
    isEditing,
    onSaveNote,
    onDeleteNoteOrProfile,
    // onSetIsEditing, // Might not be needed if editor visibility is derived
    onExitSettings,
    editorKey,
    ProfileViewComponent,
    DirectMessagesPageComponent, // Destructure DM Page Component
    onEditProfileLocalFields,
    onRefetchProfileData,
  } = mainContent;

  const itemToDisplayOrEdit = currentNote as NostrProfileNote | Note | null;

  const isProfileActive = activeView.type === 'profile' && itemToDisplayOrEdit && 'npub' in itemToDisplayOrEdit;
  const isNoteActive = (activeView.type === 'note' || activeView.type === 'new_note_editor') && (itemToDisplayOrEdit || activeView.type === 'new_note_editor');

  // Show editor if:
  // 1. A regular note is active and we are in editing state.
  // 2. A new note is being created.
  // 3. A profile is active AND we are specifically editing its local fields.
  const showEditor = (isNoteActive && isEditing) || (isProfileActive && isEditing);

  let pageTitle = "Notention";
  if (activeView.type === 'settings') {
    pageTitle = "Settings";
  } else if (itemToDisplayOrEdit) {
    pageTitle = itemToDisplayOrEdit.title || (isProfileActive ? (itemToDisplayOrEdit as NostrProfileNote).name || 'Profile' : 'Untitled Note');
  } else if (activeView.type === 'new_note_editor') {
    pageTitle = "New Note";
  }

  const handleDelete = () => {
    if (itemToDisplayOrEdit?.id) {
      onDeleteNoteOrProfile(itemToDisplayOrEdit.id);
    }
  };

  const canShare = activeView.type === 'note' && itemToDisplayOrEdit && itemToDisplayOrEdit.id && !('npub' in itemToDisplayOrEdit);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Mobile Menu Button - standard position */}
       <button
        className="md:hidden fixed top-3 left-3 z-40 p-2 bg-gray-200 dark:bg-gray-700 rounded-md text-gray-700 dark:text-gray-200 shadow"
        onClick={onToggleSidebar}
      >
        {sidebar.isOpen ? <MenuCloseIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
      </button>

      <Sidebar {...sidebar} />

      {/* Overlay for mobile when sidebar is open */}
      {sidebar.isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black opacity-50 md:hidden"
          onClick={sidebar.onClose} // Use onClose from sidebar props
        ></div>
      )}

      <main className={`flex-1 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out md:ml-0 ${sidebar.isOpen && window.innerWidth < 768 ? 'translate-x-64' : ''}`}>
        {/* Header for mobile, containing title and potentially share button */}
        <div className="bg-white dark:bg-gray-800 shadow-sm md:hidden p-3 flex justify-between items-center border-b dark:border-gray-700 min-h-[57px]">
          {/* Placeholder for menu button alignment, actual button is fixed */}
          <div className="w-8 h-8"></div>
          <span className="text-lg font-semibold text-gray-700 dark:text-gray-200 truncate px-2">
            {pageTitle}
          </span>
          {canShare ? (
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              title="Share Note"
            >
              <ShareIcon className="h-5 w-5" />
            </button>
          ) : <div className="w-8 h-5"></div> /* Placeholder for alignment */}
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
          {activeView.type === 'settings' && <SettingsPage onExit={onExitSettings} />}

          {activeView.type === 'direct_messages' && DirectMessagesPageComponent && (
            <DirectMessagesPageComponent />
          )}

          {showEditor && activeView.type !== 'direct_messages' && ( // Ensure editor doesn't show on DM page
            <div className="h-full flex flex-col">
              <MarkdownEditor
                key={editorKey}
                note={itemToDisplayOrEdit}
                onSave={onSaveNote}
                onDelete={itemToDisplayOrEdit?.id ? handleDelete : undefined}
                onShare={canShare ? () => setIsShareModalOpen(true) : undefined}
                isProfileEditing={isProfileActive && isEditing}
              />
              {/* LM Interaction only for actual notes or when editor is up for a new note (not for profile's local notes) */}
              {isNoteActive && !isProfileActive &&
                <div className="h-1/3 min-h-[200px] flex-shrink-0 border-t dark:border-gray-700">
                    <LMInteractionArea currentNoteContent={itemToDisplayOrEdit?.content || ''} />
                </div>
              }
            </div>
          )}

          {isProfileActive && !isEditing && itemToDisplayOrEdit && (
            <ProfileViewComponent
              profile={itemToDisplayOrEdit as NostrProfileNote}
              onEditLocalFields={onEditProfileLocalFields}
              onDelete={(profileId: number) => onDeleteNoteOrProfile(profileId)}
              onRefetchProfile={onRefetchProfileData}
            />
          )}

          {!itemToDisplayOrEdit && activeView.type !== 'settings' && activeView.type !== 'new_note_editor' && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400 h-full flex flex-col justify-center items-center">
              <DocumentPlusIcon className="h-12 w-12 text-gray-400 mb-3"/>
              <p className="mb-3">Select an item from the sidebar or create something new.</p>
              <div className="space-x-2">
                <button
                    onClick={sidebar.onCreateNewNote}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                    New Note
                </button>
                {sidebar.onCreateNewProfile && (
                     <button
                        onClick={sidebar.onCreateNewProfile}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                    >
                        Add Nostr Contact
                    </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {isShareModalOpen && itemToDisplayOrEdit && canShare && (
        <ShareModal
          // Pass only necessary fields for a Note to ShareModal
          noteTitle={itemToDisplayOrEdit.title}
          noteContent={itemToDisplayOrEdit.content}
          noteTags={itemToDisplayOrEdit.tags}
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
           onShared={(eventId) => { console.log("Note shared with event ID:", eventId);}} // Placeholder
        />
      )}
    </div>
  );
};

export default AppLayout;
