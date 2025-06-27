// src/tests/setup.ts
import '@testing-library/jest-dom'

// You can add other global setup code here if needed
// For example, mocking global objects or functions

// Example: Mocking localStorage
// const localStorageMock = (function() {
//   let store: Record<string, string> = {};
//   return {
//     getItem: function(key: string) {
//       return store[key] || null;
//     },
//     setItem: function(key: string, value: string) {
//       store[key] = value.toString();
//     },
//     removeItem: function(key: string) {
//       delete store[key];
//     },
//     clear: function() {
//       store = {};
//     }
//   };
// })();
// Object.defineProperty(window, 'localStorage', {
//   value: localStorageMock
// });

// If you are using fetch mocks (e.g., whatwg-fetch for Node environment if not using jsdom, or a mocking library like msw)
// import { server } from './mocks/server'; // Example for MSW
// beforeAll(() => server.listen());
// afterEach(() => server.resetHandlers());
// afterAll(() => server.close());

console.log('Global test setup file loaded.');
