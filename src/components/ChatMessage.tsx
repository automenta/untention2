import React from 'react';
import { DirectMessage } from '../db/db';

interface ChatMessageProps {
  message: DirectMessage;
  isSender: boolean; // True if the current user is the sender of this message
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isSender }) => {
  const alignment = isSender ? 'justify-end' : 'justify-start';
  const bgColor = isSender ? 'bg-blue-500 dark:bg-blue-700' : 'bg-gray-200 dark:bg-gray-600';
  const textColor = isSender ? 'text-white dark:text-gray-100' : 'text-gray-800 dark:text-gray-100';

  return (
    <div className={`flex ${alignment} mb-2`}>
      <div className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg shadow ${bgColor} ${textColor}`}>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p className={`text-xs mt-1 ${isSender ? 'text-blue-200 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'} text-right`}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
};

export default ChatMessage;
