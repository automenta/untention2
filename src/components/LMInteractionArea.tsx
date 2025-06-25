import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PaperAirplaneIcon, StopCircleIcon, SparklesIcon, ExclamationTriangleIcon, InformationCircleIcon, InboxArrowDownIcon } from '@heroicons/react/24/solid'; // Using solid for main action buttons
import * as lmService from '../services/lmService';
import * as lmCacheService from '../services/lmCacheService';
import { db } from '../db/db';
import { useHotkeys } from 'react-hotkeys-hook';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/atom-one-dark.css'; // Ensure this CSS is imported for code highlighting
import remarkGfm from 'remark-gfm';


interface LMInteractionAreaProps {
  currentNoteContent?: string;
}

interface ChatMessage {
  id: string; // Unique ID for each message for React key and updates
  type: 'human' | 'ai' | 'tool_call' | 'tool_result' | 'error' | 'info';
  content: string;
  toolName?: string;
}

const LMInteractionArea: React.FC<LMInteractionAreaProps> = ({ currentNoteContent }) => {
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputTokens, setInputTokens] = useState<number>(0);
  const [outputTokens, setOutputTokens] = useState<number>(0); // Tracks tokens for the current AI response being streamed/completed
  const [isCachedResponse, setIsCachedResponse] = useState<boolean>(false);

  const stopStreamingFunc = useRef<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null); // For auto-scrolling

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [chatHistory]);


  const handleSubmitPrompt = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setIsCachedResponse(false);
    const humanMessageId = `human-${Date.now()}`;
    setChatHistory(prev => [...prev, { id: humanMessageId, type: 'human', content: prompt }]);

    const currentPrompt = prompt; // Capture prompt at time of submission
    setPrompt(''); // Clear input field immediately

    const settings = await db.settings.get(1);
    const currentModel = settings?.lmModel || 'unknown_model';

    // Check cache
    const cached = await lmCacheService.getLMCacheByPrompt(currentPrompt, currentModel);
    if (cached) {
      setChatHistory(prev => [...prev, { id: `ai-cached-${Date.now()}`, type: 'ai', content: cached.response }]);
      setIsCachedResponse(true);
      setInputTokens(await lmService.countTokens(currentPrompt));
      setOutputTokens(await lmService.countTokens(cached.response));
      setIsLoading(false);
      return;
    }

    const systemContext = currentNoteContent
        ? `Note Context:\n${currentNoteContent.substring(0,1000)}\n---\nUser query:`
        : undefined;

    const llmHistory = chatHistory
      .filter(m => m.type === 'human' || m.type === 'ai')
      .slice(-6) // last 3 turns
      .map(m => ({ type: m.type, content: m.content }));

    let currentAIResponseId = `ai-${Date.now()}`;
    setChatHistory(prev => [...prev, { id: currentAIResponseId, type: 'ai', content: '' }]);
    let accumulatedResponse = "";
    let currentOutputTokens = 0;

    setInputTokens(await lmService.countTokens(currentPrompt + (systemContext || '')));

    try {
      stopStreamingFunc.current = await lmService.streamLLMResponse(
        currentPrompt,
        systemContext,
        llmHistory,
        async (chunk, type) => { // onChunk
          setIsLoading(true); // Keep loading true while chunks arrive
          if (type === 'content') {
            accumulatedResponse += chunk;
            currentOutputTokens = await lmService.countTokens(accumulatedResponse); // Update output tokens as content streams
            setOutputTokens(currentOutputTokens);
            setChatHistory(prev => prev.map(msg => msg.id === currentAIResponseId ? { ...msg, content: accumulatedResponse } : msg));
          } else {
            // For tool calls, results, errors, info, add them as separate messages
            setChatHistory(prev => [...prev, { id: `${type}-${Date.now()}`, type, content: chunk }]);
          }
        },
        async (finalFullResponse, finalType) => { // onStop
          setIsLoading(false);
          stopStreamingFunc.current = null;
          if (finalType === 'error') {
            setChatHistory(prev => prev.map(msg => msg.id === currentAIResponseId ? { ...msg, type: 'error', content: finalFullResponse } : msg));
          } else {
             // Ensure the final AI message is updated if it wasn't through chunks (e.g. agent's final output)
            if (accumulatedResponse !== finalFullResponse) {
                 setChatHistory(prev => prev.map(msg => msg.id === currentAIResponseId ? { ...msg, content: finalFullResponse } : msg));
                 accumulatedResponse = finalFullResponse;
            }
            currentOutputTokens = await lmService.countTokens(accumulatedResponse);
            setOutputTokens(currentOutputTokens);
            if (accumulatedResponse.trim() && !isCachedResponse) { // Don't re-cache if it was just loaded from cache
              await lmCacheService.addLMCacheEntry(currentPrompt, accumulatedResponse, currentModel);
            }
          }
        }
      );
    } catch (e: any) {
      setIsLoading(false);
      const errorMsgContent = `Setup Error: ${e.message}`;
      // Try to update the current AI message to be an error, or add a new one
      setChatHistory(prev => {
        const currentAIMsgIndex = prev.findIndex(m => m.id === currentAIResponseId);
        if (currentAIMsgIndex !== -1) {
          return prev.map(msg => msg.id === currentAIResponseId ? { ...msg, type: 'error', content: errorMsgContent } : msg);
        }
        return [...prev, { id: `error-${Date.now()}`, type: 'error', content: errorMsgContent }];
      });
    }
  }, [prompt, isLoading, currentNoteContent, chatHistory, isCachedResponse]);

  const handleStopGeneration = () => {
    if (stopStreamingFunc.current) {
      stopStreamingFunc.current(); // This should trigger AbortController in lmService
    }
    // isLoading state will be managed by onStop/onError callbacks from streamLLMResponse
  };

  useHotkeys('ctrl+enter, meta+enter', handleSubmitPrompt, { enableOnFormTags: ['textarea'] }, [handleSubmitPrompt]);

  const getMessageStyle = (type: ChatMessage['type']) => {
    // Tailwind styles for messages
    switch (type) {
      case 'human': return 'bg-blue-500 text-white dark:bg-blue-600 self-end';
      case 'ai': return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 self-start';
      case 'tool_call': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 self-start text-xs p-1.5 border border-purple-300 dark:border-purple-700';
      case 'tool_result': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 self-start text-xs p-1.5 border border-green-300 dark:border-green-700';
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 self-start border border-red-300 dark:border-red-700';
      case 'info': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 self-start text-xs p-1.5 border border-yellow-300 dark:border-yellow-700';
      default: return 'bg-gray-500 text-white self-start';
    }
  };

  const getMessageIcon = (type: ChatMessage['type'], toolName?: string) => {
    const iconClass = "h-4 w-4 mr-1.5 inline-block flex-shrink-0";
    if (type === 'tool_call') return <SparklesIcon className={`${iconClass} text-purple-500`} title={`Tool: ${toolName || 'Unknown'}`}/>;
    if (type === 'tool_result') return <SparklesIcon className={`${iconClass} text-green-500`} />;
    if (type === 'error') return <ExclamationTriangleIcon className={`${iconClass} text-red-500`} />;
    if (type === 'info') return <InformationCircleIcon className={`${iconClass} text-yellow-500`} />;
    return null;
  }

  return (
    <div className="flex flex-col h-full p-3 bg-gray-100 dark:bg-gray-850 border-t dark:border-gray-700/50">
      <div ref={messagesEndRef} className="flex-grow mb-2 space-y-3 overflow-y-auto pr-1">
        {chatHistory.map((msg) => (
          <div key={msg.id} className={`flex ${msg.type === 'human' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] md:max-w-[80%] p-2.5 rounded-lg shadow-sm ${getMessageStyle(msg.type)} flex items-start`}>
              {getMessageIcon(msg.type, msg.toolName)}
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}
                        className="prose dark:prose-invert prose-sm max-w-none leading-relaxed flex-grow min-w-0">
                {msg.content + ((isLoading && msg.type === 'ai' && chatHistory.slice(-1)[0]?.id === msg.id && msg.content) ? '▍' : '')}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {isLoading && chatHistory.slice(-1)[0]?.type !== 'ai' && (
             <div className="flex justify-start">
                <div className={`max-w-[90%] md:max-w-[80%] p-2.5 rounded-lg shadow-sm ${getMessageStyle('ai')}`}>
                    <span className="inline-block w-2 h-4 bg-gray-800 dark:bg-gray-200 animate-pulse ml-1"></span>
                </div>
            </div>
        )}
        <div /> {/* Invisible div to ensure messagesEndRef can scroll to the very bottom */}
      </div>

      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mb-1 px-1">
        <span>Input: {inputTokens} tokens</span>
        {isCachedResponse && <span className="flex items-center text-blue-500 dark:text-blue-400"><InboxArrowDownIcon className="h-3.5 w-3.5 mr-1"/>Cached</span>}
        <span>Output: {outputTokens} tokens</span>
      </div>

      <div className="flex items-end space-x-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Interact with LM... (Ctrl+Enter or Cmd+Enter)"
          className="flex-grow p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none dark:bg-gray-750 dark:text-white text-sm"
          rows={Math.min(6, Math.max(1, (prompt.match(/\n/g) || []).length + 2, Math.floor(prompt.length / 60) + 1))}
          disabled={isLoading && !stopStreamingFunc.current}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSubmitPrompt(); }}}
        />
        {isLoading ? (
          <button
            onClick={handleStopGeneration}
            className="p-2.5 text-white bg-red-600 hover:bg-red-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            title="Stop Generation"
            disabled={!stopStreamingFunc.current}
          >
            <StopCircleIcon className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={handleSubmitPrompt}
            className="p-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            title="Send Prompt (Ctrl+Enter or Cmd+Enter)"
            disabled={!prompt.trim()}
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default LMInteractionArea;
