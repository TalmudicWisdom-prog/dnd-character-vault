import type { CloudSyncProvider } from './CloudSyncProvider';

const memoryCache = new Map<string, string>();

/**
 * Convert a data URL (base64) to an ArrayBuffer
 * @param dataUrl The data URL string
 * @returns The binary ArrayBuffer
 */
export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL format');
  }
  const parts = dataUrl.split(',');
  if (parts.length !== 2) {
    throw new Error('Invalid data URL format: missing comma');
  }
  const base64 = parts[1];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert an ArrayBuffer to a data URL
 * @param buffer The binary ArrayBuffer
 * @param mimeType The mime type of the data
 * @returns The data URL string
 */
export function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binaryString = '';
  const chunkSize = 0x8000; // 32KB
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = Array.from(bytes.subarray(i, i + chunkSize));
    binaryString += String.fromCharCode(...chunk);
  }
  
  const base64 = btoa(binaryString);
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Compute SHA-256 hash of binary data, returned as hex string
 * @param data The binary ArrayBuffer
 * @returns Hexadecimal string of the hash
 */
export async function sha256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract a portrait from a character's portraitDataUrl,
 * compute its content hash, and return the hash.
 * Returns null if no portrait exists.
 * @param portraitDataUrl The portrait data URL
 * @returns The content hash or null
 */
export async function extractPortraitHash(portraitDataUrl: string): Promise<string | null> {
  if (!portraitDataUrl || typeof portraitDataUrl !== 'string' || !portraitDataUrl.startsWith('data:')) {
    return null;
  }
  try {
    const buffer = dataUrlToArrayBuffer(portraitDataUrl);
    return await sha256(buffer);
  } catch (error) {
    console.error('Failed to extract portrait hash:', error);
    return null;
  }
}

/**
 * Extract mime type from data URL
 */
function getMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'image/webp';
}

/**
 * Sync a portrait asset to the cloud provider.
 * Skips upload if the asset already exists (deduplication).
 * Returns the asset hash, or null if no portrait.
 * @param provider The CloudSyncProvider instance
 * @param portraitDataUrl The portrait data URL
 * @returns The asset hash or null
 */
export async function syncPortraitAsset(
  provider: CloudSyncProvider,
  portraitDataUrl: string,
): Promise<string | null> {
  if (!portraitDataUrl) return null;

  try {
    const hash = await extractPortraitHash(portraitDataUrl);
    if (!hash) return null;

    const mimeType = getMimeType(portraitDataUrl);
    const extension = mimeType.split('/')[1] || 'webp';
    const path = `assets/${hash}.${extension}`;

    // Use common provider methods (assuming fileExists and uploadFile)
    const exists = await (provider as any).fileExists?.(path);
    if (!exists) {
      const buffer = dataUrlToArrayBuffer(portraitDataUrl);
      if ((provider as any).uploadFile) {
        await (provider as any).uploadFile(path, buffer);
      }
    }
    
    // Store in cache for future use
    memoryCache.set(hash, portraitDataUrl);
    
    return hash;
  } catch (error) {
    console.error('Failed to sync portrait asset:', error);
    return null;
  }
}

/**
 * Download and hydrate a portrait from the cloud.
 * Returns the data URL string for storage in the Character record.
 * @param provider The CloudSyncProvider instance
 * @param assetHash The asset hash to download
 * @returns The data URL string
 */
export async function hydratePortrait(
  provider: CloudSyncProvider,
  assetHash: string,
): Promise<string> {
  if (!assetHash) return '';

  if (memoryCache.has(assetHash)) {
    return memoryCache.get(assetHash)!;
  }

  try {
    const path = `assets/${assetHash}.webp`;
    
    if (!(provider as any).downloadFile) {
      throw new Error('downloadFile method not implemented on provider');
    }

    const buffer = await (provider as any).downloadFile(path);
    const dataUrl = arrayBufferToDataUrl(buffer, 'image/webp');
    
    memoryCache.set(assetHash, dataUrl);
    return dataUrl;
  } catch (error) {
    console.error(`Failed to hydrate portrait ${assetHash}:`, error);
    throw error;
  }
}

/**
 * Check which asset hashes from a list are missing in the cloud.
 * Returns the set of missing hashes.
 * @param provider The CloudSyncProvider instance
 * @param hashes The list of asset hashes
 * @returns A Set of missing asset hashes
 */
export async function findMissingAssets(
  provider: CloudSyncProvider,
  hashes: string[],
): Promise<Set<string>> {
  const missing = new Set<string>();
  
  if (!hashes || hashes.length === 0) {
    return missing;
  }

  await Promise.all(
    hashes.map(async (hash) => {
      try {
        const path = `assets/${hash}.webp`;
        let exists = false;
        
        if ((provider as any).fileExists) {
          exists = await (provider as any).fileExists(path);
        }
        
        if (!exists) {
          missing.add(hash);
        }
      } catch (error) {
        console.error(`Error checking if asset ${hash} exists:`, error);
        missing.add(hash); // Assume missing if we can't check
      }
    })
  );

  return missing;
}
