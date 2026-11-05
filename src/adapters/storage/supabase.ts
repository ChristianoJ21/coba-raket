import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageAdapter } from "./index";

/** Supabase Storage implementation. Create a PRIVATE bucket named "handover-photos" first. */
export function createSupabaseStorage(client: SupabaseClient, bucket = "handover-photos"): StorageAdapter {
  return {
    async createUploadUrl(path) {
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
      if (error) throw new Error(`Could not create upload URL: ${error.message}`);
      return { url: data.signedUrl, token: data.token };
    },
    async createReadUrl(path, ttlSeconds) {
      const { data, error } = await client.storage.from(bucket).createSignedUrl(path, ttlSeconds);
      if (error) throw new Error(`Could not create read URL: ${error.message}`);
      return data.signedUrl;
    },
  };
}
