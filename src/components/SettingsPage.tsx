import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as settingsService from '../services/settingsService';
import { Settings } from '../db/db';
import { generateSecretKey, getPublicKey } from 'nostr-tools'; // For Nostr key generation
import { EyeIcon, EyeSlashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const availableModels = {
  openai: ["gpt-4", "gpt-4-turbo-preview", "gpt-3.5-turbo"],
  anthropic: ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-2.1", "claude-instant-1.2"],
  ollama: ["llama2", "mistral", "codellama", "llava"], // User might have others
  gemini: ["gemini-pro"], // Placeholder, as full integration is pending
};

const SettingsPage: React.FC = () => {
  const currentSettings = useLiveQuery(settingsService.getSettings(), []) as Settings | undefined;

  const [lmApiKey, setLmApiKey] = useState('');
  const [showLmApiKey, setShowLmApiKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'anthropic' | 'ollama' | 'gemini' | ''>('');
  const [lmModel, setLmModel] = useState('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');

  const [nostrRelayUrl, setNostrRelayUrl] = useState('');
  const [nostrPrivKey, setNostrPrivKey] = useState('');
  const [showNostrPrivKey, setShowNostrPrivKey] = useState(false);
  const [nostrPubKey, setNostrPubKey] = useState('');

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (currentSettings) {
      // Decrypt and set API keys
      settingsService.getLmApiKey().then(key => setLmApiKey(key || ''));
      settingsService.getNostrPrivKey().then(key => {
        setNostrPrivKey(key || '');
        if (key) {
            try {
                setNostrPubKey(getPublicKey(key));
            } catch (e) {
                console.warn("Could not derive Nostr public key from stored private key.", e);
                setNostrPubKey(''); // Clear if invalid
            }
        } else {
            setNostrPubKey('');
        }
      });

      setLmModel(currentSettings.lmModel || '');
      setOllamaBaseUrl(currentSettings.ollamaBaseUrl || 'http://localhost:11434');
      setNostrRelayUrl(currentSettings.nostrRelayUrl || '');
      setNostrPubKey(currentSettings.nostrPubKey || ''); // In case it was set without a privKey (e.g. imported)
      setTheme(currentSettings.theme || 'light');

      // Determine provider from model
      if (currentSettings.lmModel) {
        if (currentSettings.lmModel.startsWith('gpt-')) setSelectedProvider('openai');
        else if (currentSettings.lmModel.startsWith('claude-')) setSelectedProvider('anthropic');
        else if (currentSettings.ollamaBaseUrl && availableModels.ollama.includes(currentSettings.lmModel)) setSelectedProvider('ollama');
        else if (currentSettings.lmModel.includes('gemini')) setSelectedProvider('gemini');
        else setSelectedProvider('');
      } else if (currentSettings.ollamaBaseUrl) {
        setSelectedProvider('ollama'); // Default to ollama if base URL is set but no specific model
      }
    }
  }, [currentSettings]);

  const handleSaveChanges = async () => {
    setStatusMessage(null);
    try {
      let finalNostrPubKey = nostrPubKey;
      if (nostrPrivKey && !nostrPubKey) { // If new private key is entered, generate corresponding public key
          try {
            finalNostrPubKey = getPublicKey(nostrPrivKey);
            setNostrPubKey(finalNostrPubKey); // Update state for UI
          } catch (e) {
             console.error("Invalid Nostr private key format for public key generation.", e);
             setStatusMessage({type: 'error', text: 'Invalid Nostr private key format.'});
             return;
          }
      }

      await settingsService.updateFullSettings({
        lmApiKey: lmApiKey,
        lmModel: lmModel,
        ollamaBaseUrl: selectedProvider === 'ollama' ? ollamaBaseUrl : undefined,
        nostrRelayUrl: nostrRelayUrl,
        nostrPrivKey: nostrPrivKey,
        nostrPubKey: finalNostrPubKey, // Use potentially derived pubkey
        theme: theme,
      });
      // Force key re-derivation in service if salt was just created or secret changed (not applicable here with fixed secret)
      // Refresh model instance in lmService (indirectly handled by lmService re-fetching settings)
      setStatusMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (error: any) {
      setStatusMessage({ type: 'error', text: `Failed to save settings: ${error.message}` });
    }
  };

  const handleGenerateNostrKeys = () => {
    const newPrivKey = Buffer.from(generateSecretKey()).toString('hex');
    setNostrPrivKey(newPrivKey);
    try {
        const newPubKey = getPublicKey(newPrivKey);
        setNostrPubKey(newPubKey);
    } catch(e) {
        console.error("Error generating nostr public key", e);
        setNostrPubKey('');
        setStatusMessage({ type: 'error', text: 'Error generating Nostr keys.' });
    }
  };

  const handleNostrPrivKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPrivKey = e.target.value;
    setNostrPrivKey(newPrivKey);
    if (newPrivKey.match(/^[a-f0-9]{64}$/)) { // Basic hex format check for typical private keys
        try {
            setNostrPubKey(getPublicKey(newPrivKey));
        } catch (err) {
            setNostrPubKey(''); // Clear if invalid format for getPublicKey
        }
    } else {
        setNostrPubKey('');
    }
  };

  const getModelsForProvider = () => {
    if (!selectedProvider || selectedProvider === 'ollama') return availableModels.ollama; // For Ollama, model is typed manually or defaults
    return availableModels[selectedProvider] || [];
  };

  useEffect(() => {
    // Apply theme to HTML element
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  if (!currentSettings) {
    return <div className="p-8 text-gray-700 dark:text-gray-200">Loading settings...</div>;
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto bg-white dark:bg-gray-800 shadow-md rounded-lg">
      <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Settings</h1>

      {statusMessage && (
        <div className={`p-3 rounded-md text-sm ${statusMessage.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>
          {statusMessage.text}
        </div>
      )}

      {/* Theme Settings */}
      <section>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-3">Appearance</h2>
        <div className="flex items-center space-x-4">
          <label htmlFor="themeToggle" className="text-gray-600 dark:text-gray-400">Theme:</label>
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
          </button>
        </div>
      </section>

      {/* Language Model Settings */}
      <section>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-3">Language Model</h2>

        <div className="mb-4">
          <label htmlFor="lmProvider" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Provider</label>
          <select
            id="lmProvider"
            value={selectedProvider}
            onChange={(e) => {
              setSelectedProvider(e.target.value as any);
              setLmModel(''); // Reset model when provider changes
            }}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Select Provider</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="ollama">Ollama (localhost)</option>
            <option value="gemini">Google Gemini (Experimental)</option>
          </select>
        </div>

        {selectedProvider && selectedProvider !== 'ollama' && selectedProvider !== 'gemini' && (
          <div className="mb-4 relative">
            <label htmlFor="lmApiKey" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">API Key ({selectedProvider})</label>
            <input
              type={showLmApiKey ? 'text' : 'password'}
              id="lmApiKey"
              value={lmApiKey}
              onChange={(e) => setLmApiKey(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-10"
              placeholder={`Enter your ${selectedProvider} API Key`}
            />
            <button type="button" onClick={() => setShowLmApiKey(!showLmApiKey)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 top-6">
              {showLmApiKey ? <EyeSlashIcon className="h-5 w-5"/> : <EyeIcon className="h-5 w-5"/>}
            </button>
          </div>
        )}

        {selectedProvider && (
          <div className="mb-4">
            <label htmlFor="lmModel" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Model</label>
            {selectedProvider === 'ollama' ? (
                 <input
                    type="text"
                    id="lmModel"
                    value={lmModel}
                    onChange={(e) => setLmModel(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="e.g., llama2, mistral (or leave empty for default)"
                />
            ) : (
                <select
                    id="lmModel"
                    value={lmModel}
                    onChange={(e) => setLmModel(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    disabled={!selectedProvider || selectedProvider === 'ollama'}
                >
                    <option value="">Select Model</option>
                    {getModelsForProvider().map(model => (
                    <option key={model} value={model}>{model}</option>
                    ))}
                </select>
            )}
             {selectedProvider === 'gemini' && <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Note: Gemini integration is basic. API key should be configured if specific SDK requires it (not standard LangChain key).</p>}
          </div>
        )}

        {selectedProvider === 'ollama' && (
          <div className="mb-4">
            <label htmlFor="ollamaBaseUrl" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Ollama Base URL</label>
            <input
              type="text"
              id="ollamaBaseUrl"
              value={ollamaBaseUrl}
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="e.g., http://localhost:11434"
            />
          </div>
        )}
      </section>

      {/* Nostr Settings */}
      <section>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-3">Nostr Communication</h2>
        <div className="mb-4">
          <label htmlFor="nostrRelayUrl" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Relay URL</label>
          <input
            type="url"
            id="nostrRelayUrl"
            value={nostrRelayUrl}
            onChange={(e) => setNostrRelayUrl(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="wss://your.nostr.relay"
          />
        </div>
        <div className="mb-4 relative">
          <label htmlFor="nostrPrivKey" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Private Key (hex)</label>
          <div className="flex items-center space-x-2">
            <input
              type={showNostrPrivKey ? 'text' : 'password'}
              id="nostrPrivKey"
              value={nostrPrivKey}
              onChange={handleNostrPrivKeyChange}
              className="flex-grow p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white pr-10"
              placeholder="Enter 64-char hex private key or generate one"
            />
            <button type="button" onClick={() => setShowNostrPrivKey(!showNostrPrivKey)} className="absolute inset-y-0 right-0 mr-[calc(3rem+0.5rem)] px-3 flex items-center text-gray-500 dark:text-gray-400 top-1/2 -translate-y-1/2 transform">
                 {showNostrPrivKey ? <EyeSlashIcon className="h-5 w-5"/> : <EyeIcon className="h-5 w-5"/>}
            </button>
            <button
                type="button"
                onClick={handleGenerateNostrKeys}
                title="Generate New Keys"
                className="p-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
                <ArrowPathIcon className="h-5 w-5" />
            </button>
          </div>

        </div>
        <div className="mb-4">
          <label htmlFor="nostrPubKey" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Public Key (hex)</label>
          <input
            type="text"
            id="nostrPubKey"
            value={nostrPubKey}
            readOnly // Public key is derived
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-300"
            placeholder="Automatically derived from private key"
          />
        </div>
      </section>

      <div className="pt-5">
        <button
          onClick={handleSaveChanges}
          className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
        >
          Save All Settings
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
