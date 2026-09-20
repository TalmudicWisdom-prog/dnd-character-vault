import type { CloudSyncProvider, CloudFile, SyncManifest, WriteFileOptions } from './CloudSyncProvider';

export class DropboxConflictError extends Error {
  constructor(public readonly path: string, public readonly serverRev?: string) {
    super(`Conflict detected for file: ${path}`);
    this.name = 'DropboxConflictError';
  }
}

export class DropboxAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DropboxAuthError';
  }
}

export class DropboxAdapter implements CloudSyncProvider {
  readonly id = 'dropbox' as const;
  readonly displayName = 'Dropbox';

  private clientId: string;
  private redirectUri: string;
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(clientId: string, redirectUri: string) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
  }

  /**
   * Restore from saved auth state
   */
  restoreAuth(accessToken: string, refreshToken: string, expiresAt: string): void {
    this.accessToken = accessToken;
    this.refreshTokenValue = refreshToken;
    this.tokenExpiresAt = new Date(expiresAt).getTime();
  }

  /**
   * Helper to encode ArrayBuffer to base64url string
   */
  private base64urlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * PKCE helper: Generate code verifier
   */
  private async generateCodeVerifier(): Promise<string> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64urlEncode(array.buffer);
  }

  /**
   * PKCE helper: Generate code challenge from verifier
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64urlEncode(digest);
  }

  /**
   * Check if currently authenticated
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  /**
   * Get the authorization URL to redirect the user to
   */
  async getAuthUrl(): Promise<string> {
    const verifier = await this.generateCodeVerifier();
    sessionStorage.setItem('dropbox_code_verifier', verifier);
    const challenge = await this.generateCodeChallenge(verifier);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline',
    });

    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Handle the OAuth callback
   */
  async handleAuthCallback(params: URLSearchParams): Promise<void> {
    const code = params.get('code');
    if (!code) {
      throw new DropboxAuthError('No authorization code found in callback.');
    }

    const verifier = sessionStorage.getItem('dropbox_code_verifier');
    if (!verifier) {
      throw new DropboxAuthError('No PKCE code verifier found in session storage.');
    }

    sessionStorage.removeItem('dropbox_code_verifier');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code_verifier: verifier,
    });

    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new DropboxAuthError(`Failed to exchange authorization code: ${err}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshTokenValue = data.refresh_token || null;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  /**
   * Refresh the access token
   */
  async refreshToken(): Promise<void> {
    if (!this.refreshTokenValue) {
      throw new DropboxAuthError('No refresh token available.');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshTokenValue,
      client_id: this.clientId,
    });

    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new DropboxAuthError(`Failed to refresh token: ${err}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    if (data.refresh_token) {
      this.refreshTokenValue = data.refresh_token;
    }
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  /**
   * Disconnect from Dropbox
   */
  async disconnect(): Promise<void> {
    if (this.accessToken) {
      try {
        await fetch('https://api.dropboxapi.com/2/auth/token/revoke', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });
      } catch (e) {
        // Ignore errors on revoke
      }
    }
    this.accessToken = null;
    this.refreshTokenValue = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Ensure the token is valid, refreshing if needed
   */
  private async ensureValidToken(): Promise<string> {
    if (!this.accessToken) {
      throw new DropboxAuthError('Not authenticated.');
    }

    // 5 minute buffer
    if (Date.now() + 5 * 60 * 1000 > this.tokenExpiresAt) {
      await this.refreshToken();
    }

    return this.accessToken!;
  }

  /**
   * Standard response checker
   */
  private async checkResponseStatus(response: Response, action: string) {
    if (response.ok) return;

    if (response.status === 401) {
      throw new DropboxAuthError('Access token invalid or expired.');
    }

    const errText = await response.text();
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 'unknown';
      throw new Error(`Rate limited during ${action}. Retry after ${retryAfter}s`);
    }

    throw new Error(`Dropbox API error during ${action} (${response.status}): ${errText}`);
  }

  /**
   * List files in a folder
   */
  async listFiles(folder: string): Promise<CloudFile[]> {
    const token = await this.ensureValidToken();
    let path = folder.startsWith('/') ? folder : `/${folder}`;
    if (path === '/') path = '';

    const files: CloudFile[] = [];
    
    let url = 'https://api.dropboxapi.com/2/files/list_folder';
    let body: any = { path, recursive: false };

    while (true) {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      await this.checkResponseStatus(response, 'list_folder');
      const data = await response.json();

      for (const entry of data.entries) {
        if (entry['.tag'] === 'file') {
          files.push({
            id: entry.id,
            name: entry.name,
            path: entry.path_display,
            rev: entry.rev,
            size: entry.size,
            modifiedAt: entry.server_modified,
          });
        }
      }

      if (data.has_more) {
        url = 'https://api.dropboxapi.com/2/files/list_folder/continue';
        body = { cursor: data.cursor };
      } else {
        break;
      }
    }

    return files;
  }

  /**
   * Read a file from Dropbox
   */
  async readFile(path: string): Promise<{ data: ArrayBuffer; rev: string }> {
    const token = await this.ensureValidToken();
    let normalizedPath = path.startsWith('/') ? path : `/${path}`;

    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: normalizedPath }),
      },
    });

    await this.checkResponseStatus(response, 'download');

    const resultHeader = response.headers.get('dropbox-api-result');
    if (!resultHeader) {
      throw new Error('Missing dropbox-api-result header in download response');
    }

    const metadata = JSON.parse(resultHeader);
    const data = await response.arrayBuffer();

    return { data, rev: metadata.rev };
  }

  /**
   * Write a file to Dropbox
   */
  async writeFile(path: string, data: ArrayBuffer, opts?: WriteFileOptions): Promise<{ rev: string }> {
    const token = await this.ensureValidToken();
    let normalizedPath = path.startsWith('/') ? path : `/${path}`;

    let mode: any = { '.tag': 'overwrite' };
    if (opts?.expectedRev) {
      mode = { '.tag': 'update', update: opts.expectedRev };
    }

    const args = {
      path: normalizedPath,
      mode,
      autorename: false,
      mute: true,
      strict_conflict: true,
    };

    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify(args),
      },
      body: data,
    });

    if (response.status === 409) {
      throw new DropboxConflictError(path);
    }

    await this.checkResponseStatus(response, 'upload');
    const result = await response.json();

    return { rev: result.rev };
  }

  /**
   * Delete a file from Dropbox
   */
  async deleteFile(path: string): Promise<void> {
    const token = await this.ensureValidToken();
    let normalizedPath = path.startsWith('/') ? path : `/${path}`;

    const response = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: normalizedPath }),
    });

    // 409 means path not found, which is fine for delete
    if (response.status === 409) {
      return;
    }

    await this.checkResponseStatus(response, 'delete_v2');
  }

  /**
   * Check if a file exists
   */
  async fileExists(path: string): Promise<boolean> {
    const token = await this.ensureValidToken();
    let normalizedPath = path.startsWith('/') ? path : `/${path}`;

    const response = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: normalizedPath }),
    });

    if (response.status === 409) {
      return false; // not found
    }

    await this.checkResponseStatus(response, 'get_metadata');
    const data = await response.json();
    return data['.tag'] === 'file';
  }

  /**
   * Read the sync manifest
   */
  async readManifest(): Promise<SyncManifest | null> {
    try {
      const { data } = await this.readFile('/manifest.json');
      const text = new TextDecoder().decode(data);
      return JSON.parse(text) as SyncManifest;
    } catch (e) {
      // Return null if it doesn't exist
      return null;
    }
  }

  /**
   * Write the sync manifest
   */
  async writeManifest(manifest: SyncManifest): Promise<{ rev: string }> {
    const data = new TextEncoder().encode(JSON.stringify(manifest));
    return this.writeFile('/manifest.json', data);
  }

  /**
   * Get the current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get the current refresh token
   */
  getRefreshToken(): string | null {
    return this.refreshTokenValue;
  }

  /**
   * Get the token expiration time as ISO string
   */
  getTokenExpiresAt(): string {
    return new Date(this.tokenExpiresAt).toISOString();
  }
}
