import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowUpCircleIcon, StopCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, InboxArrowDownIcon } from '@heroicons/react/24/outline';
import * as lmService from '../services/lmService';
import * as lmCacheService from '../services/lmCacheService'; // Import cache service
import { db } from '../db/db'; // For current model name
import { useHotkeys } from 'react-hotkeys-hook';
import ReactMarkdown from 'react-markdown';

interface LMInteractionAreaProps {
  // Context from the current note, could be used for more advanced prompting
  currentNoteContent?: string;
  // Allow passing the whole note or specific parts for context
}

const LMInteractionArea: React.FC<LMInteractionAreaProps> = ({ currentNoteContent }) => {
  const [prompt, setPrompt] = useState<string>('');
  const [streamingOutput, setStreamingOutput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [inputTokenCount, setInputTokenCount] = useState<number>(0);
  const [outputTokenCount, setOutputTokenCount] = useState<number>(0);
  const [cachedEntryId, setCachedEntryId] = useState<number | null>(null); // To indicate if current output is from cache

  const stopStreamingRef = useRef<(() => void) | null>(null);
  const outputRef = useRef<HTMLDivElement>(null); // For auto-scrolling
  const accumulatedResponseRef = useRef<string>(''); // To accumulate response before saving to cache

  const calculateTokenCounts = useCallback(async () => {
    const inTokens = await lmService.countTokens(prompt);
    setInputTokenCount(inTokens);
    const outTokens = await lmService.countTokens(streamingOutput);
    setOutputTokenCount(outTokens);
  }, [prompt, streamingOutput]);

  useEffect(() => {
    calculateTokenCounts();
  }, [prompt, streamingOutput, calculateTokenCounts]);

  useEffect(() => {
    // Auto-scroll to bottom of output
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [streamingOutput]);

  const handleSubmitPrompt = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setStreamingOutput('');
    setOutputTokenCount(0);
    setCachedEntryId(null);
    accumulatedResponseRef.current = ''; // Reset accumulator

    const settings = await db.settings.get(1);
    const currentModel = settings?.lmModel || 'unknown';

    // 1. Check cache first
    const cachedResponse = await lmCacheService.getLMCacheByPrompt(prompt, currentModel);
    if (cachedResponse) {
      setStreamingOutput(cachedResponse.response);
      setCachedEntryId(cachedResponse.id || null); // Mark as cached
      setIsLoading(false);
      calculateTokenCounts(); // Calculate tokens for cached response
      // Optionally, add a small delay or user confirmation before using cached response
      // For now, using it directly.
      console.log("Using cached LM response for prompt:", prompt);
      return;
    }

    // 2. If not in cache, fetch from LM
    // Example: include part of the note content as context
    // This is a very basic MCP example. More complex orchestration would happen in lmService.
    const fullPrompt = currentNoteContent
      ? `Context from current note:\n---\n${currentNoteContent.substring(0,1000)}...\n---\n\nUser Prompt: ${prompt}`
      : prompt;

    try {
      stopStreamingRef.current = await lmService.streamGenerations(
        fullPrompt,
        "You are a helpful assistant integrated into a markdown note-taking app. Be concise and helpful. Format responses in Markdown.",
        (chunk) => { // onChunk
          setStreamingOutput((prev) => {
            accumulatedResponseRef.current = prev + chunk;
            return accumulatedResponseRef.current;
          });
        },
        async () => { // onComplete
          setIsLoading(false);
          stopStreamingRef.current = null;
          calculateTokenCounts(); // Final token count
          // Save the complete response to cache
          if (accumulatedResponseRef.current.trim()) {
            await lmCacheService.addLMCacheEntry(prompt, accumulatedResponseRef.current, currentModel);
            console.log("LM response saved to cache.");
          }
        },
        (err) => { // onError
          setError(`LM Error: ${err.message}`);
          console.error("LM Service Error:", err);
          setIsLoading(false);
          stopStreamingRef.current = null;
        }
      );
    } catch (e: any) {
      setError(`Setup Error: ${e.message}`);
      setIsLoading(false);
    }
  }, [prompt, isLoading, currentNoteContent, calculateTokenCounts]);

  const handleStopGeneration = () => {
    if (stopStreamingRef.current) {
      stopStreamingRef.current();
      stopStreamingRef.current = null; // Ensure it's cleared
    }
    setIsLoading(false);
    // Token counts will be updated by useEffect on streamingOutput change
  };

  useHotkeys('ctrl+enter', (e) => {
    // Check if focus is within this component or a specific input if needed
    e.preventDefault();
    handleSubmitPrompt();
  }, { enableOnFormTags: ['textarea']});


  return (
    <div className="flex flex-col h-full p-4 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-200 dark:dark:border-gray-700">
      <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">Language Model Assistant</h3>

      {/* Prompt Input Area */}
      <div className="relative mb-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask the LM... (Ctrl+Enter to submit)"
          rows={3}
          className="w-full p-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 resize-none"
          disabled={isLoading}
        />
        <button
          onClick={handleSubmitPrompt}
          disabled={isLoading || !prompt.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:text-gray-400 dark:disabled:text-gray-500"
          title="Submit Prompt (Ctrl+Enter)"
        >
          <ArrowUpCircleIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Controls and Info */}
      <div className="flex justify-between items-center mb-2 text-xs text-gray-500 dark:text-gray-400">
        <div>
          <span>Input Tokens: {inputTokenCount}</span>
          <span className="mx-2">|</span>
          <span>Output Tokens: {outputTokenCount}</span>
        </div>
        {isLoading && (
          <button
            onClick={handleStopGeneration}
            className="flex items-center px-2 py-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            title="Stop Generation"
          >
            <StopCircleIcon className="h-5 w-5 mr-1" />
            Stop
          </button>
        )}
      </div>

      {/* Streaming Output Area */}
      <div ref={outputRef} className="flex-1 p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md overflow-y-auto prose dark:prose-invert max-w-none relative">
        {error && (
          <div className="p-3 my-2 text-sm text-red-700 bg-red-100 rounded-md dark:bg-red-900 dark:text-red-300 flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2"/>
            {error}
          </div>
        )}
        {cachedEntryId && !isLoading && !error && (
          <div className="absolute top-2 right-2 flex items-center text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded-full" title={`This response was loaded from cache (Entry ID: ${cachedEntryId}).`}>
            <InboxArrowDownIcon className="h-4 w-4 mr-1"/>
            Cached
          </div>
        )}
        {streamingOutput ? (
          <ReactMarkdown>{streamingOutput}</ReactMarkdown>
        ) : (
          <p className="text-gray-400 dark:text-gray-500 italic">LM output will appear here...</p>
        )}
      </div>
    </div>
  );
};

export default LMInteractionArea;
