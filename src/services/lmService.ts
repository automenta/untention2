import { Ollama } from "@langchain/community/llms/ollama";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { BaseLanguageModel } from "@langchain/core/language_models/base";
import { AIMessage, HumanMessage, SystemMessage, BaseMessage, AIMessageChunk } from "@langchain/core/messages";
import { AgentExecutor, createToolCallingAgent, AgentStep } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { Tool } from "@langchain/core/tools";

import * as settingsService from "./settingsService";
import { Settings } from "../db/db";
import { getTools } from "./langchainToolsService";

let llm: BaseLanguageModel | null = null;
let agentExecutorInstance: AgentExecutor | null = null;
let currentModelName: string | null = null;
let currentSettingsSignature: string | null = null;
let activeController: AbortController | null = null;


function generateSettingsSignature(settings: Settings | null, apiKey?: string): string {
    if (!settings) return "no-settings";
    return JSON.stringify({
        lmModel: settings.lmModel,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        apiKeyLength: apiKey?.length ?? 0,
    });
}

export const getLLM = (): BaseLanguageModel | null => llm;

async function initializeLLMAndAgent(): Promise<boolean> {
    const settings = await settingsService.getSettings();
    if (!settings?.lmModel) {
        console.warn("LLM model not configured.");
        llm = null;
        agentExecutorInstance = null;
        currentModelName = null;
        currentSettingsSignature = null;
        return false;
    }

    const apiKey = await settingsService.getLmApiKey();
    const newSettingsSignature = generateSettingsSignature(settings, apiKey || undefined);

    if (llm && agentExecutorInstance && currentModelName === settings.lmModel && currentSettingsSignature === newSettingsSignature) {
        return true; // Already initialized and settings haven't changed
    }

    currentModelName = settings.lmModel;
    currentSettingsSignature = newSettingsSignature;
    llm = null; // Force re-initialization of LLM
    agentExecutorInstance = null; // And agent

    console.log(`Initializing LLM: ${settings.lmModel}`);
    try {
        if (settings.lmModel.startsWith("gpt-")) {
            if (!apiKey) throw new Error("OpenAI API key not set.");
            llm = new ChatOpenAI({ modelName: settings.lmModel, apiKey, streaming: true, temperature: 0.7 });
        } else if (settings.lmModel.startsWith("claude-")) {
            if (!apiKey) throw new Error("Anthropic API key not set.");
            llm = new ChatAnthropic({ modelName: settings.lmModel, apiKey, streaming: true, temperature: 0.7 });
        } else if (settings.ollamaBaseUrl && settings.lmModel) {
            llm = new Ollama({ baseUrl: settings.ollamaBaseUrl, model: settings.lmModel, temperature: 0.7 });
        } else if (settings.lmModel.includes("gemini")) {
            console.warn("Gemini model selected. Basic compatibility assumed if API key provided for ChatOpenAI-like behavior.");
            if (apiKey) { // Attempt to use with OpenAI-like Chat Interface if possible
                llm = new ChatOpenAI({ modelName: "gemini-pro", apiKey, streaming: true, temperature: 0.7}); // This is an assumption
            } else {
                throw new Error("Gemini model selected, but no API key provided or specific Google integration is missing.");
            }
        } else {
            throw new Error(`Unsupported LLM model: ${settings.lmModel}`);
        }
        console.log("LLM Initialized:", llm.constructor.name);

        // Initialize Agent
        const tools = getTools();
        if (llm instanceof ChatOpenAI || llm instanceof ChatAnthropic) { // Check if LLM supports tool calling
            const prompt = ChatPromptTemplate.fromMessages([
                ["system", "You are a helpful assistant. You have access to tools. Use them when appropriate. Respond to the user directly if no tools are needed or after tool execution."],
                new MessagesPlaceholder("chat_history"),
                ["human", "{input}"],
                new MessagesPlaceholder("agent_scratchpad"),
            ]);
            const agent = await createToolCallingAgent({ llm, tools, prompt });
            agentExecutorInstance = new AgentExecutor({ agent, tools, verbose: true });
            console.log("AgentExecutor initialized with tools:", tools.map(t => t.name).join(', '));
        } else {
            console.warn(`LLM ${llm.constructor.name} may not support advanced tool calling agents. Tool usage will be limited or disabled.`);
            // No agentExecutorInstance if LLM doesn't support it well. streamLLMResponse will fallback.
        }
        return true;
    } catch (error) {
        console.error("Failed to initialize LLM or Agent:", error);
        llm = null;
        agentExecutorInstance = null;
        currentModelName = null;
        currentSettingsSignature = null;
        return false; // Initialization failed
    }
}

export const streamLLMResponse = async (
    input: string,
    systemContext: string | undefined, // System context is now part of the agent's main prompt
    chatHistory: Array<{ type: 'human' | 'ai' | 'system', content: string }> | undefined,
    onChunk: (chunk: string, type: 'content' | 'tool_call' | 'tool_result' | 'error' | 'info') => void,
    onStop: (fullResponse: string, finalResponseType: 'content' | 'error') => void,
): Promise<() => void> => { // Returns a stop function

    activeController = new AbortController();
    const signal = activeController.signal;

    const run = async () => {
        const initialized = await initializeLLMAndAgent();
        if (!initialized || !llm) {
            const errMsg = "LLM not available or not configured.";
            onChunk(errMsg, 'error');
            onStop(errMsg, 'error');
            return;
        }

        const messagesForHistory: BaseMessage[] = [];
        if (chatHistory) {
            chatHistory.forEach(msg => {
                if (msg.type === 'human') messagesForHistory.push(new HumanMessage(msg.content));
                else if (msg.type === 'ai') messagesForHistory.push(new AIMessage(msg.content));
            });
        }

        let fullResponse = "";

        try {
            if (agentExecutorInstance) {
                const stream = await agentExecutorInstance.stream({
                    input: input,
                    chat_history: messagesForHistory,
                    // System message is part of the agent's prompt template
                }, { signal });

                for await (const chunk of stream) {
                    if (signal.aborted) break;
                    if (chunk.actions) { // Tool call
                        chunk.actions.forEach((action: any) => { // LangSmith RunLogItem type for action
                            onChunk(`Calling tool: ${action.tool} with input ${JSON.stringify(action.toolInput)}`, 'tool_call');
                        });
                    }
                    if (chunk.steps) { // Tool result
                        chunk.steps.forEach((step: AgentStep) => {
                             onChunk(`Tool ${step.action.tool} result: ${step.observation}`, 'tool_result');
                        });
                    }
                    if (chunk.output) { // Final agent output
                        fullResponse += chunk.output;
                        onChunk(chunk.output, 'content');
                    }
                     // Langchain's stream events can be complex. This is a simplified handler.
                    // You might get other types of chunks depending on the agent and tools.
                }
            } else { // Fallback to basic LLM call if agent is not available (e.g., Ollama)
                onChunk("Agent not available for this LLM, using basic response generation. Tools are disabled.", 'info');
                const messages: BaseMessage[] = [...messagesForHistory];
                if (systemContext) messages.unshift(new SystemMessage(systemContext)); // Add system if provided and no agent
                messages.push(new HumanMessage(input));

                const stream = await llm.stream(messages, { signal });
                for await (const chunk of stream) {
                    if (signal.aborted) break;
                    const content = (chunk as AIMessageChunk).content as string;
                    if (content) {
                        fullResponse += content;
                        onChunk(content, 'content');
                    }
                }
            }
            if (signal.aborted) {
                onChunk("Stream stopped by user.", 'info');
                onStop(fullResponse, 'content'); // Or 'error' if preferred for aborted state
            } else {
                 onStop(fullResponse, 'content');
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                onChunk("Stream aborted by user.", 'info');
                onStop(fullResponse, 'content'); // Or 'error'
            } else {
                console.error("LLM/Agent streaming error:", error);
                const errorMessage = error.message || "Unknown error during LLM/Agent operation.";
                onChunk(errorMessage, 'error');
                onStop(fullResponse + "\nError: " + errorMessage, 'error');
            }
        } finally {
            activeController = null; // Clear controller when done
        }
    };

    run(); // Execute the async function

    return () => { // Stop function
        if (activeController) {
            activeController.abort();
            console.log("LLM stream stop requested.");
        }
    };
};

export const stopLLMStream = () => {
    if (activeController) {
        activeController.abort();
        console.log("LLM stream stop triggered globally.");
    }
};


// Token counting (simplified, placeholder)
export const countTokens = async (text: string): Promise<number> => {
  // A very rough approximation. For accurate counting, specific tokenizers are needed.
  return Math.ceil(text.length / 4);
};
