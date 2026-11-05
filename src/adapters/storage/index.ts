/**
 * Private object storage for handover photos. Paths are stored in the database; photos are only
 * ever shown through short-lived signed URLs, never public URLs.
 */
export interface StorageAdapter {
  /** Signed URL the operator's browser uses to upload one photo directly. */
  createUploadUrl(path: string): Promise<{ url: string; token?: string }>;
  /** Signed URL for viewing a stored photo for a limited time. */
  createReadUrl(path: string, ttlSeconds: number): Promise<string>;
}

/** In-memory fake for tests. */
export function createMemoryStorage(): StorageAdapter & { uploaded: string[] } {
  const uploaded: string[] = [];
  return {
    uploaded,
    async createUploadUrl(path) {
      uploaded.push(path);
      return { url: `memory://upload/${path}` };
    },
    async createReadUrl(path, ttlSeconds) {
      return `memory://read/${path}?ttl=${ttlSeconds}`;
    },
  };
}
