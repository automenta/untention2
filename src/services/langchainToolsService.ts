import { Tool } from "@langchain/core/tools";
import { getLLM } from "./lmService"; // Assuming getLLM can provide a base LLM for tools if needed
// Potentially import noteService or other services if tools need to interact with app data

// Example Tool: Note Summarizer
class NoteSummarizerTool extends Tool {
  name = "note_summarizer";
  description = "Summarizes the provided text content. Input should be the text of the note to summarize.";

  constructor() {
    super();
  }

  async _call(input: string): Promise<string> {
    try {
      const llm = getLLM(); // Get the currently configured LLM
      if (!llm) return "LLM not available for summarization.";

      // Using a simple prompt for summarization
      const prompt = `Please summarize the following text concisely:\n\n${input}`;

      // const result = await llm.invoke(prompt);
      // Langchain's BaseLanguageModel type doesn't directly have .invoke expecting a string and returning a simple string.
      // It typically returns an AIMessage or similar. We need to adapt.
      // For now, let's assume llm.invoke returns an object with a 'content' property.
      // This will need to be adjusted based on the actual LLM integration in lmService.
      const response = await llm.invoke(prompt);

      let summary = "Could not extract summary from LLM response.";
      if (typeof response === 'string') {
        summary = response;
      } else if (typeof response === 'object' && response !== null && 'content' in response && typeof response.content === 'string') {
        summary = response.content;
      } else {
        // Fallback for other response structures or if 'content' is not a string
        console.warn("Unexpected LLM response structure for summarization:", response);
        // Attempt to stringify, or provide a generic error.
        // This part needs to be robust based on what llm.invoke actually returns from your lmService.
        summary = JSON.stringify(response); // Or a more user-friendly message
      }

      return summary;
    } catch (error: any) {
      console.error("Error in NoteSummarizerTool:", error);
      return `Error summarizing: ${error.message}`;
    }
  }
}

// Example Tool: Code Explainer
class CodeExplainerTool extends Tool {
  name = "code_explainer";
  description = "Explains a given code snippet. Input should be the code snippet to explain.";

  constructor() {
    super();
  }

  async _call(input: string): Promise<string> {
    try {
      const llm = getLLM();
      if (!llm) return "LLM not available for code explanation.";

      const prompt = `Please explain the following code snippet:\n\n\`\`\`\n${input}\n\`\`\`\n\nExplanation:`;
      const response = await llm.invoke(prompt);

      let explanation = "Could not extract explanation from LLM response.";
      if (typeof response === 'string') {
        explanation = response;
      } else if (typeof response === 'object' && response !== null && 'content' in response && typeof response.content === 'string') {
        explanation = response.content;
      }  else {
        console.warn("Unexpected LLM response structure for code explanation:", response);
        explanation = JSON.stringify(response);
      }
      return explanation;
    } catch (error: any) {
      console.error("Error in CodeExplainerTool:", error);
      return `Error explaining code: ${error.message}`;
    }
  }
}


// TODO: Add more tools as needed, e.g., CodeGeneratorTool, WebSearchTool (if internet access is feasible and desired)

// New WebSearchTool
class WebSearchTool extends Tool {
  name = "web_search";
  description = "Searches the web for the provided query. Input should be the search query.";

  constructor() {
    super();
  }

  async _call(input: string): Promise<string> {
    try {
      // Simulate fetching search results. Replace with a real search API call if available.
      // Using JSONPlaceholder as a stand-in.
      const response = await fetch(`https://jsonplaceholder.typicode.com/posts?q=${encodeURIComponent(input)}`);
      if (!response.ok) {
        return `Error fetching search results: ${response.statusText}`;
      }
      const results = await response.json();

      if (!Array.isArray(results) || results.length === 0) {
        return "No search results found.";
      }

      // Summarize the first few results
      const summary = results.slice(0, 3).map((post: any, index: number) =>
        `Result ${index + 1}: ${post.title}\n${post.body.substring(0, 100)}...`
      ).join('\n\n');

      return `Search results for "${input}":\n\n${summary}`;
    } catch (error: any) {
      console.error("Error in WebSearchTool:", error);
      return `Error performing web search: ${error.message}`;
    }
  }
}


// New CodeExecutionTool
class CodeExecutionTool extends Tool {
  name = "code_executor";
  description = "Executes a given Python code snippet. Input should be the Python code snippet to execute. IMPORTANT: This tool currently does not actually execute code; it simulates the action.";

  constructor() {
    super();
  }

  async _call(input: string): Promise<string> {
    // In a real scenario, you would use a sandboxed environment to execute the code.
    // For this example, we'll just return a message.
    console.log(`CodeExecutionTool called with input:\n${input}`);
    return `Code execution is not yet implemented in this environment. The following Python code would have been executed:\n\n\`\`\`python\n${input}\n\`\`\``;
  }
}

export const getTools = (): Tool[] => {
  return [
    new NoteSummarizerTool(),
    new CodeExplainerTool(),
    new WebSearchTool(),
    new CodeExecutionTool(),
    new CalendarTool(),
    // Add other tools here
  ];
};

// Mock calendar data store
interface CalendarEvent {
  id: string;
  description: string;
  time: string; // For simplicity, time is a string like "tomorrow at 10am" or "today"
}
const mockCalendarEvents: CalendarEvent[] = [];

// New CalendarTool
class CalendarTool extends Tool {
  name = "calendar_manager";
  description = `Manages a calendar and reminders.
Input should be a command like:
- "set reminder for [description] at [time]"
- "get reminders for [today/tomorrow/specific date]"
- "summarize events for [today/tomorrow/specific date]"`;

  constructor() {
    super();
  }

  async _call(input: string): Promise<string> {
    const inputLower = input.toLowerCase();

    if (inputLower.startsWith("set reminder for ")) {
      const parts = input.substring("set reminder for ".length).split(" at ");
      if (parts.length < 2) {
        return "Invalid reminder format. Please use 'set reminder for [description] at [time]'.";
      }
      const description = parts[0];
      const time = parts.slice(1).join(" at "); // Handle cases where 'at' might be in description

      const newEvent: CalendarEvent = {
        id: `event-${Date.now()}`,
        description,
        time,
      };
      mockCalendarEvents.push(newEvent);
      return `Reminder set: "${description}" at ${time}. (ID: ${newEvent.id})`;
    } else if (inputLower.startsWith("get reminders for ") || inputLower.startsWith("summarize events for ")) {
      const timeQuery = inputLower.split(" for ")[1];
      const relevantEvents = mockCalendarEvents.filter(event => event.time.toLowerCase().includes(timeQuery));

      if (relevantEvents.length === 0) {
        return `No reminders or events found for "${timeQuery}".`;
      }
      const summary = relevantEvents.map(event => `- "${event.description}" at ${event.time}`).join('\n');
      return `Reminders/Events for "${timeQuery}":\n${summary}`;
    } else {
      return `Unknown calendar command: "${input}". Try "set reminder for [description] at [time]" or "get reminders for [time]".`;
    }
  }
}
