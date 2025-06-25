import React from 'react';
import AppLayout from './components/AppLayout';
import { db } from './db/db'; // Ensure db is initialized

// Initialize DB early
console.log('DB initialized:', db.verno);

function App() {
  return (
    <AppLayout />
  );
}

export default App;
