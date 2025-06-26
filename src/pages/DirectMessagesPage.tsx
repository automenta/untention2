import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, NostrProfileNote, DirectMessage, Settings } from '../db/db';
import * as nostrService from '../services/nostrService';
import * as settingsService from '../services/settingsService';
import ChatMessage from '../components/ChatMessage';
import { ArrowLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';

const DirectMessagesPage: React.FC = () => {
  const [selectedContactNpub, setSelectedContactNpub] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [currentUserNpub, setCurrentUserNpub] = useState<string | null>(null);
  const [currentUserHexPubKey, setCurrentUserHexPubKey] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const settings = useLiveQuery(settingsService.getSettings) as Settings | undefined;

  useEffect(() => {
    if (settings?.nostrPubKey) {
      setCurrentUserHexPubKey(settings.nostrPubKey);
      setCurrentUserNpub(nostrService.pubKeyToNpub(settings.nostrPubKey));
    } else {
      setCurrentUserHexPubKey(null);
      setCurrentUserNpub(null);
    }
  }, [settings]);

  const contacts = useLiveQuery(
    () => db.nostrProfiles.where('isContact').equals(1).sortBy('title'),
    []
  ) || [];

  const messages = useLiveQuery(
    async () => {
      if (!selectedContactNpub) return [];
      // Query for messages where peerNpub is the selected contact
      return db.directMessages
        .where('[peerNpub+createdAt]')
        .between([selectedContactNpub, Dexie.minKey], [selectedContactNpub, Dexie.maxKey])
        .sortBy('createdAt');
    },
    [selectedContactNpub]
  ) || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // DM Subscription Handling
  useEffect(() => {
    let unsubscribeFunction: (() => void) | null = null;

    const handleNewDm = async (event: nostrService.Event, decryptedContent: string, senderNpub: string) => {
      if (!currentUserNpub) return;

      const newDm: DirectMessage = {
        eventId: event.id,
        peerNpub: senderNpub === currentUserNpub ? (event.tags.find(t => t[0] === 'p')?.[1] ? nostrService.pubKeyToNpub(event.tags.find(t => t[0] === 'p')![1]) : 'unknown') : senderNpub,
        isSender: senderNpub === currentUserNpub,
        content: decryptedContent,
        createdAt: new Date(event.created_at * 1000),
        tags: event.tags,
      };

      // Avoid duplicate additions
      const existing = await db.directMessages.get({ eventId: newDm.eventId });
      if (!existing) {
        try {
          await db.directMessages.add(newDm);
          console.log("New DM saved to DB:", newDm);
          // If the message is for the currently selected contact, it will re-render via useLiveQuery.
          // If it's for another contact, it will be available when that contact is selected.
          // Optionally, add a visual cue for new messages from other contacts.
        } catch (dbError) {
          console.error("Error saving DM to DB:", dbError);
        }
      }
    };

    if (currentUserHexPubKey) {
      nostrService.subscribeToDirectMessages(currentUserHexPubKey, handleNewDm)
        .then(unsub => {
          unsubscribeFunction = unsub;
        })
        .catch(err => console.error("Failed to subscribe to DMs:", err));
    }

    return () => {
      if (unsubscribeFunction) {
        console.log("Unsubscribing from DMs");
        unsubscribeFunction();
      }
    };
  }, [currentUserHexPubKey, currentUserNpub]);


  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedContactNpub || !currentUserHexPubKey) return;

    try {
      const recipientHexPubKey = nostrService.npubToHex(selectedContactNpub);
      const sentEvent = await nostrService.sendEncryptedDirectMessage(recipientHexPubKey, messageInput.trim());

      if (sentEvent && currentUserNpub) {
        // Add to local DB immediately
        const newDm: DirectMessage = {
          eventId: sentEvent.id,
          peerNpub: selectedContactNpub,
          isSender: true,
          content: messageInput.trim(),
          createdAt: new Date(sentEvent.created_at * 1000),
          tags: sentEvent.tags,
        };
        await db.directMessages.add(newDm);
        setMessageInput('');
        // scrollToBottom will be called by useEffect on messages update
      }
    } catch (error) {
      console.error('Failed to send DM:', error);
      // TODO: Show error to user
    }
  };

  const getContactDisplayName = (contact: NostrProfileNote) => {
    return contact.title || contact.name || contact.npub.substring(0, 10) + '...';
  }

  if (!currentUserNpub) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-4 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-200">
        <h1 className="text-2xl font-semibold mb-4">Direct Messages</h1>
        <p>Please configure your Nostr keys in Settings to use Direct Messages.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen antialiased text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-gray-900">
      {/* Contact List Sidebar */}
      <div className={`flex flex-col w-full md:w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700 transition-all duration-300 ease-in-out ${selectedContactNpub && 'hidden md:flex'}`}>
        <div className="flex items-center justify-between h-16 border-b dark:border-gray-700 p-4">
          <h1 className="text-xl font-semibold">Contacts</h1>
        </div>
        <div className="flex-grow overflow-y-auto">
          {contacts.length === 0 && <p className="p-4 text-sm text-gray-500">No contacts found. Add contacts via Settings.</p>}
          {contacts.map(contact => (
            <button
              key={contact.npub}
              onClick={() => setSelectedContactNpub(contact.npub)}
              className={`w-full flex items-center p-3 hover:bg-gray-200 dark:hover:bg-gray-700 ${selectedContactNpub === contact.npub ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
            >
              {contact.picture && <img src={contact.picture} alt={getContactDisplayName(contact)} className="w-8 h-8 rounded-full mr-3 object-cover"/>}
              {!contact.picture && <div className="w-8 h-8 rounded-full mr-3 bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm">{getContactDisplayName(contact).charAt(0).toUpperCase()}</div>}
              <span className="truncate">{getContactDisplayName(contact)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${!selectedContactNpub && 'hidden md:flex md:items-center md:justify-center'}`}>
        {!selectedContactNpub ? (
          <div className="text-center p-4">
            <p className="text-xl text-gray-500 dark:text-gray-400">Select a contact to start chatting.</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center h-16 border-b dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
              <button onClick={() => setSelectedContactNpub(null)} className="md:hidden p-2 mr-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100">
                <ArrowLeftIcon className="h-6 w-6" />
              </button>
              <h2 className="text-lg font-semibold truncate">
                {getContactDisplayName(contacts.find(c => c.npub === selectedContactNpub) || {npub: selectedContactNpub} as NostrProfileNote)}
              </h2>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 space-y-2 overflow-y-auto bg-gray-50 dark:bg-gray-850">
              {messages.map(msg => (
                <ChatMessage key={msg.id || msg.eventId} message={msg} isSender={msg.isSender} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t dark:border-gray-700">
              <div className="flex items-center">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && (handleSendMessage(), e.preventDefault())}
                  placeholder="Type your message..."
                  className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-l-md focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className="px-4 py-2 bg-blue-500 text-white rounded-r-md hover:bg-blue-600 disabled:bg-gray-400 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  <PaperAirplaneIcon className="h-5 w-5 transform rotate-45" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DirectMessagesPage;
