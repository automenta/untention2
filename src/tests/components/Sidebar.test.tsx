import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../../components/Sidebar';
import { Note, NostrProfileNote } from '../../db/db';
import { TagPageWithCount } from '../../services/tagPageService';
import { describe, it, expect, vi } from 'vitest';

const mockNotes: Note[] = [
  { id: 1, title: 'Test Note 1', content: 'Content 1', createdAt: new Date(), updatedAt: new Date(), tagPageIds: [] },
  { id: 2, title: 'Test Note 2', content: 'Content 2', createdAt: new Date(), updatedAt: new Date(), tagPageIds: [] },
];

const mockProfiles: NostrProfileNote[] = [
  { id: 3, npub: 'npub1prof1', name: 'Profile 1', title: 'Profile 1', content: 'About 1', createdAt: new Date(), updatedAt: new Date(), tagPageIds: [] },
  { id: 4, npub: 'npub1prof2', name: 'Profile 2', title: 'Profile 2', content: 'About 2', createdAt: new Date(), updatedAt: new Date(), tagPageIds: [] },
];

const mockTagPages: TagPageWithCount[] = [
  { id: 1, name: 'Tag1', count: 2, isDefault: false, createdAt: new Date(), updatedAt: new Date() },
  { id: 2, name: 'Tag2', count: 1, isDefault: false, createdAt: new Date(), updatedAt: new Date() },
];

const mockOnSelectNote = vi.fn();
const mockOnCreateNewNote = vi.fn();
const mockOnCreateNewProfile = vi.fn();
const mockOnSelectTagPageId = vi.fn();
const mockOnShowSettings = vi.fn();
const mockOnShowDirectMessages = vi.fn();
const mockOnSearchChange = vi.fn();
const mockOnClose = vi.fn();

const defaultProps = {
  notes: mockNotes,
  nostrProfiles: mockProfiles,
  tagPagesWithCounts: mockTagPages,
  selectedNoteId: null,
  selectedProfileId: null,
  onSelectNote: mockOnSelectNote,
  onCreateNewNote: mockOnCreateNewNote,
  onCreateNewProfile: mockOnCreateNewProfile,
  onSelectTagPageId: mockOnSelectTagPageId,
  selectedTagPageId: null,
  onShowSettings: mockOnShowSettings,
  onShowDirectMessages: mockOnShowDirectMessages,
  onSearchChange: mockOnSearchChange,
  isOpen: true,
  onClose: mockOnClose,
};

describe('Sidebar Component', () => {
  it('renders without crashing', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Notention')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search notes & profiles...')).toBeInTheDocument();
  });

  it('renders notes, profiles, and tags', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('Test Note 1')).toBeInTheDocument();
    expect(screen.getByText('Profile 1')).toBeInTheDocument();
    expect(screen.getByTitle('Tag1 (2)')).toBeInTheDocument();
  });

  it('calls onCreateNewNote when "New Note" button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('New Note'));
    expect(mockOnCreateNewNote).toHaveBeenCalled();
  });

  it('calls onCreateNewProfile when "Add Nostr Contact" button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('Add Nostr Contact'));
    expect(mockOnCreateNewProfile).toHaveBeenCalled();
  });

  it('calls onSelectNote when a note is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('Test Note 1'));
    expect(mockOnSelectNote).toHaveBeenCalledWith(mockNotes[0].id, false);
  });

  it('calls onSelectTagPageId when "All Items" is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('All Items'));
    expect(mockOnSelectTagPageId).toHaveBeenCalledWith(null);
  });

  it('calls onSelectTagPageId when a specific tag is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Tag1 (2)'));
    expect(mockOnSelectTagPageId).toHaveBeenCalledWith(mockTagPages[0].id);
  });

  it('calls onShowSettings when settings button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Settings'));
    expect(mockOnShowSettings).toHaveBeenCalled();
  });

  it('calls onShowDirectMessages when DM button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByTitle('Direct Messages'));
    expect(mockOnShowDirectMessages).toHaveBeenCalled();
  });

  it('calls onSearchChange when search input changes', () => {
    render(<Sidebar {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText('Search notes & profiles...');
    fireEvent.change(searchInput, { target: { value: 'test search' } });
    expect(mockOnSearchChange).toHaveBeenCalledWith('test search');
  });
});
