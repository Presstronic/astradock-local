const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const KEY_FILE_VERSION = 1;

class StorageKeyProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'StorageKeyProviderError';
    this.code = code;
    this.recoverable = options.recoverable !== false;
  }
}

function createElectronStorageKeyProvider(options = {}) {
  const safeStorage = options.safeStorage;
  const keyFilePath = requireAbsolutePath(options.keyFilePath);
  const randomBytes = options.randomBytes || crypto.randomBytes;

  return {
    async getOrCreateKey() {
      assertSecureStorageAvailable(safeStorage);
      const existing = await readKeyFile(keyFilePath);
      if (existing) return decryptKey(existing, safeStorage);

      const key = randomBytes(32);
      if (!Buffer.isBuffer(key) || key.byteLength !== 32) throw new StorageKeyProviderError('key_generation_failed', 'Secure random key generation did not return 32 bytes.', { recoverable: false });
      const encrypted = safeStorage.encryptString(key.toString('base64'));
      if (!Buffer.isBuffer(encrypted) || encrypted.byteLength === 0) throw new StorageKeyProviderError('key_wrap_failed', 'Operating-system secure storage did not wrap the database key.');
      await writeKeyFileAtomically(keyFilePath, {
        version: KEY_FILE_VERSION,
        algorithm: 'electron-safe-storage',
        encryptedKey: encrypted.toString('base64')
      });
      return key;
    }
  };
}

function assertSecureStorageAvailable(safeStorage) {
  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function' || !safeStorage.isEncryptionAvailable()) {
    throw new StorageKeyProviderError('secure_storage_unavailable', 'Operating-system secure storage is unavailable; encrypted telemetry storage was not opened.');
  }
  const backend = typeof safeStorage.getSelectedStorageBackend === 'function'
    ? safeStorage.getSelectedStorageBackend()
    : null;
  if (backend === 'basic_text') {
    throw new StorageKeyProviderError('secure_storage_unprotected', 'The selected Linux secure-storage backend does not protect secrets; encrypted telemetry storage was not opened.');
  }
}

async function readKeyFile(keyFilePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(keyFilePath, 'utf8'));
    if (parsed.version !== KEY_FILE_VERSION || parsed.algorithm !== 'electron-safe-storage' || typeof parsed.encryptedKey !== 'string') {
      throw new StorageKeyProviderError('key_metadata_invalid', 'Database-key metadata is malformed or unsupported.', { recoverable: false });
    }
    return parsed;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof StorageKeyProviderError) throw error;
    throw new StorageKeyProviderError('key_metadata_unreadable', 'Database-key metadata could not be read.', { cause: error, recoverable: false });
  }
}

function decryptKey(metadata, safeStorage) {
  try {
    const encrypted = Buffer.from(metadata.encryptedKey, 'base64');
    const key = Buffer.from(safeStorage.decryptString(encrypted), 'base64');
    if (key.byteLength !== 32) throw new Error('invalid key length');
    return key;
  } catch (error) {
    throw new StorageKeyProviderError('key_unwrap_failed', 'The local database key could not be recovered from operating-system secure storage.', { cause: error, recoverable: false });
  }
}

async function writeKeyFileAtomically(keyFilePath, value) {
  const directory = path.dirname(keyFilePath);
  const temporaryPath = `${keyFilePath}.tmp-${process.pid}`;
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.rename(temporaryPath, keyFilePath);
    await fs.chmod(keyFilePath, 0o600).catch(() => {});
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    throw new StorageKeyProviderError('key_metadata_write_failed', 'Database-key metadata could not be saved atomically.', { cause: error });
  }
}

function requireAbsolutePath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new StorageKeyProviderError('invalid_key_path', 'Database-key metadata path must be absolute.', { recoverable: false });
  return path.normalize(value);
}

module.exports = {
  KEY_FILE_VERSION,
  StorageKeyProviderError,
  createElectronStorageKeyProvider
};
