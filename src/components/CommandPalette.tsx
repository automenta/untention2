import React, { useState, useEffect, useRef, ReactNode } from 'react';
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  // DocumentPlusIcon, // Unused
  // UserPlusIcon, // Unused
  // Cog8ToothIcon, // Unused
  // SunIcon, // Unused
  // MoonIcon, // Unused
} from '@heroicons/react/24/outline';

// Define the structure for a command action
export interface CommandAction {
  id: string;
  name: string;
  section?: string; // Optional: for grouping commands
  shortcut?: string[]; // e.g., ['Ctrl', 'K']
  icon?: ReactNode;
  keywords?: string; // Additional keywords for searching
  perform: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  actions: CommandAction[];
  // Current theme needed for toggle theme icon -- removed as it's not used in this component directly
  // currentTheme?: 'light' | 'dark';
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, actions }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredActions, setFilteredActions] = useState<CommandAction[]>(actions);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // Update filtered actions and reset selection when search term or base actions change
    if (isOpen) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      const newFilteredActions = actions.filter(action =>
        action.name.toLowerCase().includes(lowerSearchTerm) ||
        (action.keywords && action.keywords.toLowerCase().includes(lowerSearchTerm)) ||
        (action.section && action.section.toLowerCase().includes(lowerSearchTerm))
      );
      setFilteredActions(newFilteredActions);
      setSelectedIndex(0); // Reset selection when search results change
    }
  }, [searchTerm, actions, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm(''); // Reset search term when opening
      setSelectedIndex(0); // Reset selected index
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]); // Only on open

  useEffect(() => {
    // Scroll selected item into view
    if (isOpen && filteredActions.length > 0 && listRef.current) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLLIElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({
          block: 'nearest',
          // behavior: 'smooth' // Can be too slow with fast key presses
        });
      }
    }
  }, [selectedIndex, isOpen, filteredActions.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        onClose();
        return;
      }

      // Don't trap keys like Enter if search input is the target and it's empty
      // (allows submitting forms if any were in the palette, though not currently used)
      // However, arrow keys should always navigate.
      if (document.activeElement === inputRef.current && event.key === 'Enter' && !searchTerm && filteredActions.length === 0) {
        return;
      }

      if (filteredActions.length === 0 && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter')) {
        event.preventDefault(); // Prevent any default browser action if no items
        return;
      }
      if (filteredActions.length === 0) return;


      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prevIndex) => (prevIndex + 1) % filteredActions.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prevIndex) => (prevIndex - 1 + filteredActions.length) % filteredActions.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (filteredActions[selectedIndex]) {
          filteredActions[selectedIndex].perform();
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, filteredActions, selectedIndex, searchTerm]); // Added searchTerm

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 transition-opacity">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 transform transition-all">
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700">
          <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 mx-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search commands..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-12 py-3 px-2 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none placeholder-gray-500 dark:placeholder-gray-400 text-sm"
          />
          <button
            onClick={onClose}
            className="p-2 m-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close command palette"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="p-2 max-h-96 overflow-y-auto" ref={listRef as any /* TODO: type listRef correctly or find alternative for scrolling without direct ul ref if problematic */}>
          {filteredActions.length > 0 ? (
            <ul > {/* Removed listRef from here, will use child node refs if needed for scrolling, or rely on item focus */}
              {filteredActions.map((action, index) => (
                <li
                  key={action.id}
                  id={`command-palette-item-${index}`} // For scrollIntoView if needed directly
                  className={`p-2 rounded-md cursor-pointer flex items-center space-x-3 group
                    ${index === selectedIndex
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600'
                    }`}
                  onClick={() => {
                    action.perform();
                    onClose(); // Close palette after performing action
                  }}
                  onMouseEnter={() => setSelectedIndex(index)} // Optional: update selection on hover
                >
                  {action.icon && <span className={`w-5 h-5 ${index === selectedIndex ? 'text-white' : 'text-gray-500 dark:text-gray-400 group-hover:text-white'}`}>{action.icon}</span>}
                  <span className="flex-grow">{action.name}</span>
                  {action.shortcut && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {action.shortcut.map(key => (
                        <kbd key={key} className="font-sans bg-gray-200 dark:bg-gray-600 rounded px-1.5 py-0.5 ml-1">{key}</kbd>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400 py-10 px-4">
              <p className="text-sm">No results found for "<span className="font-semibold">{searchTerm}</span>".</p>
            </div>
          )}
        </div>
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
          <span>Navigate: <kbd className="font-sans bg-gray-200 dark:bg-gray-600 rounded px-1.5 py-0.5">↑</kbd> <kbd className="font-sans bg-gray-200 dark:bg-gray-600 rounded px-1.5 py-0.5">↓</kbd></span>
          <span>Select: <kbd className="font-sans bg-gray-200 dark:bg-gray-600 rounded px-1.5 py-0.5">Enter</kbd></span>
          <span>Close: <kbd className="font-sans bg-gray-200 dark:bg-gray-600 rounded px-1.5 py-0.5">Esc</kbd></span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
