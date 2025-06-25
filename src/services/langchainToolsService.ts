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

export const getTools = (): Tool[] => {
  return [
    new NoteSummarizerTool(),
    new CodeExplainerTool(),
    // Add other tools here
  ];
};
