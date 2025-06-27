import { db, Settings } from '../db/db';
import { liveQuery, Observable } from 'dexie'; // Moved Observable here

const SETTINGS_ID = 1;
const KEY_DERIVATION_SECRET = "notention-app-secret";
const KEY_USAGE: KeyUsage[] = ["encrypt", "decrypt"];
const AES_ALGORITHM = "AES-GCM";
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12;

let derivedCryptoKey: CryptoKey | null = null;

async function getDerivedKey(): Promise<CryptoKey> {
  if (derivedCryptoKey) return derivedCryptoKey;

  const settings = await db.settings.get(SETTINGS_ID);
  let salt = settings?.encryptionSalt;

  if (!salt) {
    salt = window.crypto.getRandomValues(new Uint8Array(16));
    await db.settings.update(SETTINGS_ID, { encryptionSalt: salt }).catch(async () => {
        await db.settings.put({ id: SETTINGS_ID, theme: 'light', encryptionSalt: salt });
    });
  }

  const secretKeyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(KEY_DERIVATION_SECRET),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  derivedCryptoKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    secretKeyMaterial,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    true,
    KEY_USAGE
  );
  return derivedCryptoKey;
}

async function encryptData(data: string): Promise<ArrayBuffer | undefined> {
  if (!data) return undefined;
  try {
    const key = await getDerivedKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encodedData = new TextEncoder().encode(data);

    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: AES_ALGORITHM, iv: iv },
      key,
      encodedData
    );

    const resultBuffer = new Uint8Array(iv.length + encryptedContent.byteLength);
    resultBuffer.set(iv, 0);
    resultBuffer.set(new Uint8Array(encryptedContent), iv.length);
    return resultBuffer.buffer;
  } catch (error) {
    console.error("Encryption failed:", error);
    throw new Error("Encryption failed. See console for details.");
  }
}

async function decryptData(encryptedBufferWithIv: ArrayBuffer | undefined): Promise<string | undefined> {
  if (!encryptedBufferWithIv || encryptedBufferWithIv.byteLength <= IV_LENGTH) return undefined;
  try {
    const key = await getDerivedKey();
    const dataArray = new Uint8Array(encryptedBufferWithIv);
    const iv = dataArray.slice(0, IV_LENGTH);
    const encryptedContent = dataArray.slice(IV_LENGTH);

    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: AES_ALGORITHM, iv: iv },
      key,
      encryptedContent
    );
    return new TextDecoder().decode(decryptedContent);
  } catch (error) {
    console.error("Decryption failed:", error);
    throw new Error("Decryption failed. Data might be corrupt or key changed. See console for details.");
  }
}

// liveQuery returns an Observable.
// The function passed to useLiveQuery should return a Promise or an Observable.
// So, getSettings should return an Observable.
// import { Observable } from 'dexie'; // Moved to top

export const getSettings = (): Observable<Settings | undefined> => {
  return liveQuery(async () => {
    let settings = await db.settings.get(SETTINGS_ID);
    if (!settings) {
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      await db.settings.add({ id: SETTINGS_ID, theme: 'light', encryptionSalt: salt });
      settings = await db.settings.get(SETTINGS_ID);
    }
    return settings;
  });
};

export const updateSetting = async (updates: Partial<Omit<Settings, 'id' | 'encryptedLmApiKey' | 'encryptedNostrPrivKey' | 'encryptionSalt'>>) => {
  return db.settings.update(SETTINGS_ID, updates);
};

export const setTheme = (theme: 'light' | 'dark') => {
  return db.settings.update(SETTINGS_ID, { theme });
};

export const saveLmApiKey = async (apiKey: string | undefined) => {
  if (apiKey === undefined || apiKey === '') {
    return db.settings.update(SETTINGS_ID, { encryptedLmApiKey: undefined });
  }
  const encryptedKey = await encryptData(apiKey);
  return db.settings.update(SETTINGS_ID, { encryptedLmApiKey: encryptedKey });
};

export const getLmApiKey = async (): Promise<string | undefined> => {
  const settings = await db.settings.get(SETTINGS_ID);
  if (!settings?.encryptedLmApiKey) return undefined;
  return decryptData(settings.encryptedLmApiKey);
};

export const saveNostrPrivKey = async (privKey: string | undefined) => {
  if (privKey === undefined || privKey === '') {
    return db.settings.update(SETTINGS_ID, { encryptedNostrPrivKey: undefined, nostrPubKey: undefined });
  }
  const encryptedKey = await encryptData(privKey);
  return db.settings.update(SETTINGS_ID, { encryptedNostrPrivKey: encryptedKey });
};

export const getNostrPrivKey = async (): Promise<string | undefined> => {
  const settings = await db.settings.get(SETTINGS_ID);
  if (!settings?.encryptedNostrPrivKey) return undefined;
  return decryptData(settings.encryptedNostrPrivKey);
};

export const updateFullSettings = async (newSettings: {
  lmModel?: string;
  ollamaBaseUrl?: string;
  lmApiKey?: string;
  nostrRelayUrl?: string;
  nostrPrivKey?: string;
  nostrPubKey?: string;
  theme?: 'light' | 'dark';
}) => {
  const updatePayload: Partial<Settings> = {
    lmModel: newSettings.lmModel,
    ollamaBaseUrl: newSettings.ollamaBaseUrl,
    nostrRelayUrl: newSettings.nostrRelayUrl,
    nostrPubKey: newSettings.nostrPubKey,
    theme: newSettings.theme,
  };

  if (newSettings.lmApiKey !== undefined) {
    updatePayload.encryptedLmApiKey = newSettings.lmApiKey === '' ? undefined : await encryptData(newSettings.lmApiKey);
  }
  if (newSettings.nostrPrivKey !== undefined) {
    updatePayload.encryptedNostrPrivKey = newSettings.nostrPrivKey === '' ? undefined : await encryptData(newSettings.nostrPrivKey);
  }

  await getDerivedKey();

  return db.settings.update(SETTINGS_ID, updatePayload);
};
