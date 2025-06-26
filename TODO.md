# Notention Prototype Development Plan

This document outlines the development plan to achieve a completely functional prototype of the Notention application. Tasks are grouped into phases, with cross-cutting concerns applicable throughout the development process.

## Phase 1: Core Data Model & Basic CRUD Stability

**Objective:** Ensure the fundamental note-taking, tagging, and profile management systems are robust and the new `TagPage` data model is fully integrated and functional.

### 1.1 TagPage Integration
- [ ] **`db.ts` Migration Verification:** Thoroughly test `version(7)` migration for `Note.tags` and `NostrProfileNote.tags` to `tagPageIds`, ensuring correct `TagPage` creation and case-insensitivity.
- [ ] **`noteService.ts` & `tagPageService.ts` Refinement:**
    - [ ] Verify `createNote` and `updateNote` correctly convert string tags to `tagPageIds` using `tagPageService.getTagPageByName(..., true)`.
    - [ ] Implement and test `tagPageService.renameTagPage` to handle merging (re-assigning notes to existing tag and deleting old TagPage if name conflicts).
    - [ ] Implement and test `tagPageService.deleteTagPageAndUnlink` to remove tag from notes/profiles and delete the `TagPage`.
- [ ] **`MarkdownEditor.tsx` Tag Handling:** Update tag input/display logic to seamlessly work with `tagPageIds` (converting to/from comma-separated strings for UI).
- [ ] **`Sidebar.tsx` Tag Filtering:** Ensure `onSelectTagPageId` correctly filters notes and profiles by the selected `TagPage` ID.
- [ ] **`TagManagementView.tsx` Functionality:** Connect rename and delete actions to `tagPageService` functions. Implement UI logic for merge warnings during rename.

### 1.2 Basic Error Handling & Loading States
- [ ] Implement simple visual feedback (e.g., temporary "Saving..." messages, basic error toasts) for critical operations (saving, deleting, initial data loads).

## Phase 2: LLM & Nostr Core Feature Implementation

**Objective:** Bring the AI and Nostr communication features to a demonstrable, end-to-end functional state, focusing on the primary use cases.

### 2.1 LLM Integration
- [ ] **`lmService.ts` Robustness:**
    - [ ] Refine `streamLLMResponse` chunk processing for reliable content extraction from various Langchain LLM outputs.
    - [ ] Ensure `AgentExecutor` path correctly invokes and processes results from `langchainToolsService.ts`.
    - [ ] Improve `countTokens` for more accurate (approximate) token counting.
- [ ] **`langchainToolsService.ts` Tool Development:**
    - [ ] **`WebSearchTool`:** Replace `jsonplaceholder.typicode.com` with a real (even if free-tier) web search API.
    - [ ] **`CodeExecutionTool`:** Clearly state its simulated nature in description and output. (No actual execution for prototype).
    - [ ] Verify `CalendarTool` command parsing and mock data management.
- [ ] **`LMInteractionArea.tsx` Enhancements:**
    - [ ] Ensure smooth, real-time display of LLM responses, including tool calls and results.
    - [ ] Verify `lmCacheService.ts` is effectively used for adding and retrieving cached responses. Add a visual indicator when a response is from cache.
    - [ ] Add a button/command to clear the current chat history.

### 2.2 Nostr Integration
- [ ] **`settingsService.ts` Key Management:** Verify encryption/decryption of `lmApiKey` and `nostrPrivKey` and initial salt generation.
- [ ] **`nostrService.ts` Relay & Event Handling:**
    - [ ] Confirm `ensureRelayPoolConnected` correctly manages connections to multiple relays.
    - [ ] Ensure `publishEvent` attempts to publish to all configured relays and handles success/failure.
    - [ ] Verify real-time reception and decryption of DMs in `subscribeToDirectMessages`.
- [ ] **`NostrProfileView.tsx` & `nostrProfileService.ts`:**
    - [ ] Ensure `fetchProfileFromRelays` correctly retrieves Kind 0 events and updates local `NostrProfileNote`.
    - [ ] Confirm `verifyNip05` works, and its status is displayed and persisted.
    - [ ] Clarify interaction between local `title`/`content` and fetched `name`/`about`.
- [ ] **`NostrContactsManager.tsx` & `AddNostrContactModal.tsx`:**
    - [ ] Verify `AddNostrContactModal` can add contacts by `npub`/`NIP-05` and `NostrContactsManager` marks them as `isContact`.
    - [ ] Confirm `handleFetchContactsFromRelay` and `handlePublishContactsToRelay` correctly interact with Kind 3 events (parsing/generating `p` tags with petnames/relay hints).
    - [ ] Test JSON import/export for Kind 3 contact lists.
- [ ] **`DirectMessagesPage.tsx`:**
    - [ ] Ensure smooth sending and receiving of messages, with local persistence.
    - [ ] Verify contact selection and message display.
    - [ ] (Stretch) Implement basic unread message indicators.
- [ ] **`ShareModal.tsx`:**
    - [ ] Verify public note sharing (Kind 1) works.
    - [ ] Verify private note sharing (NIP-04 Kind 4) works, including recipient selection and encryption.

## Phase 3: UI/UX Polish & Prototype Refinements

**Objective:** Enhance the user experience, making the prototype feel more complete, intuitive, and reliable.

### 3.1 User Feedback & Responsiveness
- [ ] Implement consistent loading indicators (e.g., full-screen spinners, inline spinners).
- [ ] Use a consistent toast notification system for all success, error, and informational messages.
- [ ] Thoroughly test on various screen sizes (mobile, tablet, desktop) for layout and functionality.

### 3.2 Content & Navigation
- [ ] Ensure all lists (notes, profiles, tags, messages) have user-friendly empty states with clear instructions.
- [ ] Add more useful commands to `CommandPalette.tsx` (e.g., "Manage Tags," "Clear LM Cache," "New Direct Message").

### 3.3 General Polish
- [ ] Review typography, spacing, and color schemes for consistency and visual appeal.
- [ ] Add more robust client-side validation for all user inputs (e.g., URL formats, key formats).

## Cross-Cutting Concerns (Ongoing)

- [ ] **Testing:** Implement unit tests for critical service functions (DB, encryption, Nostr, LLM tools).
- [ ] **Code Quality:** Maintain consistent style, add JSDoc for complex parts, refactor repetitive code.
- [ ] **Performance:** Monitor responsiveness, optimize Dexie queries and React re-renders.
- [ ] **Security:** Ensure sensitive data is encrypted at rest. Avoid logging sensitive info.
- [ ] **Documentation:** Update `README.md` with setup, features, limitations, and future plans.
