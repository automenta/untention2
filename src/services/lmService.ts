import { Ollama } from "@langchain/community/llms/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
// Potentially ChatGoogleGenerativeAI for Gemini, if a direct LangChain JS integration is preferred.
// For now, let's assume a generic interface or direct API calls for Gemini if ChatGoogleGenerativeAI is complex.

import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

import { db } from '../db/db'; // For API keys, models from settings
import * as settingsService from './settingsService'; // To get settings

// TODO: Implement proper API key encryption/decryption via settingsService

interface LMConfig {
  provider: 'openai' | 'anthropic' | 'ollama' | 'gemini'; // 'gemini' might be via a generic fetch
  apiKey?: string;
  modelName?: string;
  ollamaBaseUrl?: string; // Specific to Ollama
}

// Simple cache for initialized models to avoid re-creating them on every call
const modelCache: Record<string, any> = {};

const getLMInstance = async () => {
  const settings = await db.settings.get(1); // Assuming settings are always ID 1
  if (!settings) throw new Error("Settings not found");

  const provider = settings.lmModel?.startsWith('gpt-') ? 'openai' :
                   settings.lmModel?.startsWith('claude-') ? 'anthropic' :
                   settings.ollamaBaseUrl ? 'ollama' : // Use ollama if base URL is set
                   null; // Add Gemini later

  if (!provider && !settings.lmModel) throw new Error("LM provider or model not configured");

  const cacheKey = `${provider}-${settings.lmModel}-${settings.ollamaBaseUrl}`;
  if (modelCache[cacheKey]) return modelCache[cacheKey];

  const apiKey = await settingsService.getLmApiKey();


  let llm;

  if (provider === 'ollama' && settings.ollamaBaseUrl) {
    llm = new Ollama({
      baseUrl: settings.ollamaBaseUrl,
      model: settings.lmModel || "llama2", // Default ollama model if not specified
    });
  } else if (provider === 'openai' && settings.lmModel && apiKey) {
    llm = new ChatOpenAI({
      apiKey: apiKey,
      modelName: settings.lmModel,
      temperature: 0.7,
      streaming: true,
    });
  } else if (provider === 'anthropic' && settings.lmModel && apiKey) {
    llm = new ChatAnthropic({
      apiKey: apiKey,
      modelName: settings.lmModel,
      temperature: 0.7,
      streaming: true,
    });
  } else if (settings.lmModel?.includes('gemini')) { // Basic Gemini check
    // Gemini might require a different setup, possibly using GoogleAIStudio SDK or a custom fetch.
    // Placeholder for Gemini:
    console.warn("Gemini integration is a placeholder. Requires specific SDK/API call structure.");
    // For now, let's simulate a generic LLM-like interface if we were to use fetch.
    // This part would need to be fleshed out based on LangChain's Google Generative AI support or direct API calls.
    // For this example, we'll throw an error if Gemini is selected without full implementation.
    throw new Error("Gemini provider selected but not fully implemented in LangChain setup yet.");
  }
  else {
    throw new Error(`Unsupported LM provider or model not configured correctly: ${settings.lmModel}`);
  }

  modelCache[cacheKey] = llm;
  return llm;
};


export const stream générations = async (
  prompt: string,
  systemMessageContent?: string,
  onChunk: (chunk: string) => void,
  onComplete: ()_=> void,
  onError: (error: Error) => void
): Promise<() => void> => { // Returns a stop function
  try {
    const llm = await getLMInstance();
    const messages = [];
    if (systemMessageContent) messages.push(new SystemMessage(systemMessageContent));
    messages.push(new HumanMessage(prompt));

    const stream = await llm.pipe(new StringOutputParser()).stream(messages);

    let stopped = false;
    const stop = () => { stopped = true; };

    (async () => {
      try {
        for await (const chunk of stream) {
          if (stopped) break;
          onChunk(chunk as string);
        }
        if (!stopped) onComplete();
      } catch (e) {
        if (!stopped) onError(e as Error);
      }
    })();

    return stop;

  } catch (error) {
    onError(error as Error);
    return () => {}; // No-op stop function
  }
};


// Example of a more complex chain with a prompt template (Tool Use & MCP will build on this)
export const summarizeText = async (
  textToSummarize: string,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: Error)
): Promise<() => void> => {
  try {
    const llm = await getLMInstance();
    const prompt = PromptTemplate.fromTemplate(
      "Please provide a concise summary of the following text:\n\n{text}"
    );

    // Simple chain: prompt -> model -> parser
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    const stream = await chain.stream({ text: textToSummarize });

    let stopped = false;
    const stop = () => { stopped = true; };

    (async () => {
      try {
        for await (const chunk of stream) {
          if (stopped) break;
          onChunk(chunk as string);
        }
        if (!stopped) onComplete();
      } catch (e) {
        if (!stopped) onError(e as Error);
      }
    })();

    return stop;

  } catch (error) {
    onError(error as Error);
    return () => {};
  }
};

// Placeholder for token counting - this is highly model-dependent
// LangChain itself doesn't provide a universal token counter for all models.
// For OpenAI, you might use something like 'tiktoken'.
// For others, it might be an estimate or API-provided.
export const countTokens = async (text: string, modelName?: string): Promise<number> => {
  const settings = await db.settings.get(1);
  const effectiveModelName = modelName || settings?.lmModel;

  if (effectiveModelName?.startsWith('gpt-')) {
    // Dynamically import tiktoken only when needed and available
    try {
      const { getEncoding } = await import('tiktoken/lite/init');
      // TODO: This path might need to be adjusted based on how tiktoken is bundled/available.
      // It might require wasm, so Vite config might need adjustment.
      // For now, assume it can be dynamically imported.
      // const encoding = getEncoding('cl100k_base'); // Common for gpt-3.5-turbo, gpt-4
      // const tokens = encoding.encode(text);
      // encoding.free();
      // return tokens.length;
      // Tiktoken via https://www.npmjs.com/package/@dqbd/tiktoken
      // Using an approximation for now as full tiktoken setup is involved
      return Math.ceil(text.length / 4); // Very rough approximation
    } catch (e) {
      console.warn("Tiktoken not available for token counting, using approximation.", e);
      return Math.ceil(text.length / 4); // Fallback: average 4 chars per token
    }
  }
  // For other models, it's more complex. Ollama might provide it, Anthropic has its own way.
  // This is a simplification.
  return Math.ceil(text.length / 4); // Default approximation
};
