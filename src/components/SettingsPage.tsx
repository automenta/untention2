import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as settingsService from '../services/settingsService';
import * as nostrProfileService from '../services/nostrProfileService';
import * as nostrService from '../services/nostrService';
import { Settings, NostrProfileNote } from '../db/db';
import { getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools/nip19';
import { generateSecretKey } from 'nostr-tools/pure';
import { EyeIcon, EyeSlashIcon, ArrowPathIcon, UserCircleIcon, ArrowDownTrayIcon, PencilSquareIcon, UsersIcon } from '@heroicons/react/24/outline';
import NostrContactsManager from './NostrContactsManager'; // Import the new component
import { useToastContext } from '../contexts/ToastContext'; // Import useToastContext

const availableModels = {
  openai: ["gpt-4", "gpt-4-turbo-preview", "gpt-3.5-turbo"],
  anthropic: ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-2.1", "claude-instant-1.2"],
  ollama: ["llama2", "mistral", "codellama", "llava"], // User might have others
  gemini: ["gemini-pro"], // Placeholder, as full integration is pending
};

const SettingsPage: React.FC = () => {
  const currentSettings = useLiveQuery(settingsService.getSettings(), []) as Settings | undefined;

  interface ValidationErrors {
    lmApiKey?: string;
    ollamaBaseUrl?: string;
    nostrRelayUrl?: string;
    nostrPrivKey?: string;
    profilePictureUrl?: string;
    profileNip05?: string;
  }
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const [lmApiKey, setLmApiKey] = useState('');
  const [showLmApiKey, setShowLmApiKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'anthropic' | 'ollama' | 'gemini' | ''>('');
  const [lmModel, setLmModel] = useState('');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('');

  const [nostrRelayUrl, setNostrRelayUrl] = useState('');
  const [nostrPrivKey, setNostrPrivKey] = useState('');
  const [showNostrPrivKey, setShowNostrPrivKey] = useState(false);
  const [nostrPubKey, setNostrPubKey] = useState('');
  const [userNostrProfile, setUserNostrProfile] = useState<Partial<NostrProfileNote>>({});
  const [showProfileManager, setShowProfileManager] = useState(false);
  // Removed profileStatusMessage state
  const [showContactsManager, setShowContactsManager] = useState(false);


  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // Removed statusMessage state
  const { addToast } = useToastContext(); // Use toast context

  const deriveAndSetNostrPubKey = useCallback((privKey: string) => {
    if (privKey && privKey.match(/^[a-f0-9]{64}$/)) {
      try {
        const pubKey = getPublicKey(privKey);
        setNostrPubKey(pubKey);
        return pubKey;
      } catch (e) {
        console.warn("Could not derive Nostr public key from private key.", e);
        setNostrPubKey('');
      }
    } else {
      setNostrPubKey('');
    }
    return '';
  }, []);


  useEffect(() => {
    if (currentSettings) {
      settingsService.getLmApiKey().then(key => setLmApiKey(key || '')).catch(err => addToast(`Error loading LM API key: ${err.message}`, 'error'));
      settingsService.getNostrPrivKey().then(key => {
        setNostrPrivKey(key || '');
        const derivedPubKey = deriveAndSetNostrPubKey(key || '');
        if (derivedPubKey) {
          loadProfile(nip19.npubEncode(derivedPubKey));
        }
      }).catch(err => addToast(`Error loading Nostr private key: ${err.message}`, 'error'));

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
  }, [currentSettings, addToast, deriveAndSetNostrPubKey, loadProfile]); // Added addToast and other dependencies

  const isValidHttpUrl = (string: string): boolean => {
    if (!string) return true; // Allow empty
    try {
      const url = new URL(string);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
      return false;
    }
  };

  const isValidWsUrl = (string: string): boolean => {
    if (!string) return true; // Allow empty
    try {
      const url = new URL(string);
      return url.protocol === "ws:" || url.protocol === "wss:";
    } catch (_) {
      return false;
    }
  };

  const validateSettings = (): boolean => {
    const errors: ValidationErrors = {};
    if ((selectedProvider === 'openai' || selectedProvider === 'anthropic') && !lmApiKey.trim()) {
      errors.lmApiKey = 'API Key is required for this provider.';
    }
    if (selectedProvider === 'ollama' && ollamaBaseUrl.trim() && !isValidHttpUrl(ollamaBaseUrl)) {
      errors.ollamaBaseUrl = 'Invalid Ollama Base URL. Must be HTTP/HTTPS.';
    }
    if (nostrRelayUrl.trim() && !isValidWsUrl(nostrRelayUrl)) {
      errors.nostrRelayUrl = 'Invalid Relay URL. Must be WS/WSS.';
    }
    if (nostrPrivKey.trim() && !/^[a-f0-9]{64}$/.test(nostrPrivKey)) {
      errors.nostrPrivKey = 'Private key must be a 64-character hex string.';
    }
    if (userNostrProfile.picture?.trim() && !isValidHttpUrl(userNostrProfile.picture)) {
      errors.profilePictureUrl = 'Invalid Picture URL. Must be HTTP/HTTPS.';
    }
    if (userNostrProfile.nip05?.trim() && !/.+@.+\..+/.test(userNostrProfile.nip05)) {
      errors.profileNip05 = 'Invalid NIP-05 format. Should be user@domain.com.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveChanges = async () => {
    setValidationErrors({}); // Clear previous errors
    if (!validateSettings()) {
      addToast('Please correct the validation errors.', 'error');
      return;
    }

    try {
      let finalNostrPubKey = nostrPubKey;
      if (nostrPrivKey && !nostrPubKey) {
          try {
            finalNostrPubKey = getPublicKey(nostrPrivKey);
            setNostrPubKey(finalNostrPubKey);
          } catch (e) {
             console.error("Invalid Nostr private key format for public key generation.", e);
             addToast('Invalid Nostr private key format.', 'error');
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
      addToast('Settings saved successfully!', 'success');
    } catch (error: any) {
      addToast(`Failed to save settings: ${error.message}`, 'error');
    }
  };

  const loadProfile = useCallback(async (npub: string) => {
    if (!npub) return;
    // Removed setProfileStatusMessage(null);
    try {
      let profile = await nostrProfileService.getProfileNoteByNpub(npub);
      if (profile) {
        setUserNostrProfile({
          name: profile.name || '',
          about: profile.about || '',
          picture: profile.picture || '',
          nip05: profile.nip05 || '',
        });
      } else {
        setUserNostrProfile({ name: '', about: '', picture: '', nip05: '' });
      }
    } catch (e: any) {
      console.error("Error loading profile", e);
      addToast(`Failed to load profile: ${e.message}`, 'error');
    }
  }, [addToast]);

  const handleFetchFullProfileFromRelay = async () => {
    if (!nostrPubKey) {
      addToast('Nostr Public Key is not set.', 'error');
      return;
    }
    addToast('Fetching profile from relay...', 'info');
    try {
      const npub = nip19.npubEncode(nostrPubKey);
      const fetched = await nostrProfileService.fetchProfileFromRelays(npub);
      if (fetched) {
        await nostrProfileService.createOrUpdateProfileNote(
          { ...fetched, npub: npub },
          npub,
          false
        );
        setUserNostrProfile({
          name: fetched.name || '',
          about: fetched.about || '',
          picture: fetched.picture || '',
          nip05: fetched.nip05 || '',
        });
        addToast('Profile refreshed from relay.', 'success');
      } else {
        addToast('No profile found on relay. You can create one.', 'info');
      }
    } catch (error: any) {
      addToast(`Failed to fetch profile: ${error.message}`, 'error');
    }
  };

  const handlePublishProfile = async () => {
    if (!nostrPubKey || !nostrPrivKey) {
      addToast('Nostr keys not configured.', 'error');
      return;
    }
    addToast('Publishing profile...', 'info');
    try {
      const profileContent = {
        name: userNostrProfile.name,
        about: userNostrProfile.about,
        picture: userNostrProfile.picture,
        nip05: userNostrProfile.nip05,
      };
      // Remove undefined fields from profileContent before publishing
      Object.keys(profileContent).forEach(key => profileContent[key as keyof typeof profileContent] === undefined && delete profileContent[key as keyof typeof profileContent]);


      const publishedEvent = await nostrService.publishProfileEvent(profileContent);
      if (publishedEvent) {
        const npub = nip19.npubEncode(nostrPubKey);
        await nostrProfileService.createOrUpdateProfileNote(
          {
            npub: npub,
            name: profileContent.name,
            picture: profileContent.picture,
            about: profileContent.about,
            nip05: profileContent.nip05,
            lastChecked: new Date(),
          },
          npub,
          false
        );
        addToast('Profile published successfully!', 'success');
      } else {
        addToast('Failed to publish profile. Check relay connection.', 'error');
      }
    } catch (error: any) {
      addToast(`Error publishing profile: ${error.message}`, 'error');
    }
  };


  const handleGenerateNostrKeys = () => {
    const newPrivKeyArray = generateSecretKey();
    const newPrivKeyHex = Buffer.from(newPrivKeyArray).toString('hex');
    setNostrPrivKey(newPrivKeyHex);
    const newPubKey = deriveAndSetNostrPubKey(newPrivKeyHex);
    if (newPubKey) {
        loadProfile(nip19.npubEncode(newPubKey));
        addToast('New Nostr keys generated and populated.', 'success');
    } else {
        addToast('Error generating Nostr keys.', 'error');
    }
  };

  const handleNostrPrivKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPrivKey = e.target.value;
    setNostrPrivKey(newPrivKey);
    const derivedPubKey = deriveAndSetNostrPubKey(newPrivKey);
    if (derivedPubKey) {
      loadProfile(nip19.npubEncode(derivedPubKey));
    } else {
      setUserNostrProfile({}); // Clear profile form if key is invalid
    }
  };

  const handleProfileInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setUserNostrProfile(prev => ({ ...prev, [name]: value }));
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

      {/* Removed statusMessage display, toasts will handle it */}

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
              className={`w-full p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:text-white pr-10 ${validationErrors.lmApiKey ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
              placeholder={`Enter your ${selectedProvider} API Key`}
            />
            <button type="button" onClick={() => setShowLmApiKey(!showLmApiKey)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 top-6">
              {showLmApiKey ? <EyeSlashIcon className="h-5 w-5"/> : <EyeIcon className="h-5 w-5"/>}
            </button>
          </div>
        )}
        {validationErrors.lmApiKey && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{validationErrors.lmApiKey}</p>}

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
              className={`w-full p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:text-white ${validationErrors.ollamaBaseUrl ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
              placeholder="e.g., http://localhost:11434"
            />
          </div>
        )}
        {validationErrors.ollamaBaseUrl && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{validationErrors.ollamaBaseUrl}</p>}
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
            className={`w-full p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:text-white ${validationErrors.nostrRelayUrl ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            placeholder="wss://your.nostr.relay"
          />
          {validationErrors.nostrRelayUrl && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{validationErrors.nostrRelayUrl}</p>}
        </div>
        <div className="mb-4 relative">
          <label htmlFor="nostrPrivKey" className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Private Key (hex)</label>
          <div className="flex items-center space-x-2">
            <input
              type={showNostrPrivKey ? 'text' : 'password'}
              id="nostrPrivKey"
              value={nostrPrivKey}
              onChange={handleNostrPrivKeyChange}
              className={`flex-grow p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:text-white pr-10 ${validationErrors.nostrPrivKey ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
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
          {validationErrors.nostrPrivKey && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{validationErrors.nostrPrivKey}</p>}
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
        {nostrPubKey && (
          <div className="mt-6">
            <button
              onClick={() => setShowProfileManager(!showProfileManager)}
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 dark:focus:ring-offset-gray-800"
            >
              <UserCircleIcon className="h-5 w-5 mr-2" />
              {showProfileManager ? 'Hide My Nostr Profile Manager' : 'Manage My Nostr Profile (Kind 0)'}
            </button>
          </div>
        )}
        {nostrPubKey && (
          <div className="mt-4">
            <button
              onClick={() => setShowContactsManager(true)}
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 dark:focus:ring-offset-gray-800"
            >
              <UsersIcon className="h-5 w-5 mr-2" />
              Manage Nostr Contacts (Kind 3)
            </button>
          </div>
        )}
      </section>

      {showContactsManager && nostrPubKey && (
        <NostrContactsManager
            userNpub={nip19.npubEncode(nostrPubKey)}
            onClose={() => setShowContactsManager(false)}
        />
      )}

      {showProfileManager && nostrPubKey && !showContactsManager && (
        <section className="mt-8 p-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">My Nostr Profile (Kind 0)</h3>
          {/* Removed profileStatusMessage display, toasts will handle it */}
          <div className="space-y-4">
            <div>
              <label htmlFor="profileName" className="block text-sm font-medium text-gray-600 dark:text-gray-400">Name</label>
              <input
                type="text"
                name="name"
                id="profileName"
                value={userNostrProfile.name || ''}
                onChange={handleProfileInputChange}
                className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Your display name"
              />
            </div>
            <div>
              <label htmlFor="profileAbout" className="block text-sm font-medium text-gray-600 dark:text-gray-400">About</label>
              <textarea
                name="about"
                id="profileAbout"
                rows={3}
                value={userNostrProfile.about || ''}
                onChange={handleProfileInputChange}
                className="mt-1 w-full p-2 border border-gray-300 rounded-md shadow-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="A short bio"
              />
            </div>
            <div>
              <label htmlFor="profilePicture" className="block text-sm font-medium text-gray-600 dark:text-gray-400">Picture URL</label>
              <input
                type="url"
                name="picture"
                id="profilePicture"
                value={userNostrProfile.picture || ''}
                onChange={handleProfileInputChange}
                className={`mt-1 w-full p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:text-white ${validationErrors.profilePictureUrl ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                placeholder="https://example.com/image.png"
              />
              {validationErrors.profilePictureUrl && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{validationErrors.profilePictureUrl}</p>}
            </div>
            <div>
              <label htmlFor="profileNip05" className="block text-sm font-medium text-gray-600 dark:text-gray-400">NIP-05 Identifier</label>
              <input
                type="text"
                name="nip05"
                id="profileNip05"
                value={userNostrProfile.nip05 || ''}
                onChange={handleProfileInputChange}
                className={`mt-1 w-full p-2 border rounded-md shadow-sm dark:bg-gray-700 dark:text-white ${validationErrors.profileNip05 ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                placeholder="name@example.com"
              />
              {validationErrors.profileNip05 && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{validationErrors.profileNip05}</p>}
            </div>
            <div className="flex space-x-3 mt-4">
              <button
                onClick={handleFetchFullProfileFromRelay}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-500 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                title="Fetch your latest profile from the configured relay"
              >
                <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                Refresh from Relay
              </button>
              <button
                onClick={handlePublishProfile}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                title="Publish your current profile details to the relay"
              >
                <PencilSquareIcon className="h-5 w-5 mr-2" />
                Save & Publish Profile
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="pt-5 mt-8 border-t border-gray-200 dark:border-gray-700">
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
