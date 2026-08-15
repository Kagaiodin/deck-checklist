// Minimal ambient types for the Google Identity Services (GIS) token client —
// covers only the surface used by src/utils/googleDrive.ts. Loaded at runtime
// via a <script> tag injected from that module; not an npm dependency.

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  prompt?: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: { type: string; message?: string }) => void;
}

interface GoogleTokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void;
}

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
        revoke(accessToken: string, done?: () => void): void;
      };
    };
  };
}
