import type { Platform } from "@onepct/db";

/**
 * Social publishing seam. Real posting requires per-platform OAuth apps
 * (TikTok Content Posting API, YouTube Data API, Instagram Graph API) —
 * implement this interface per platform and register it in PUBLISHERS to
 * light up real posting; the scheduler and Publication records already work.
 */
export interface SocialPublisher {
  platform: Platform;
  publish(input: {
    videoUrl: string;
    title: string;
    description: string;
    hashtags: string;
  }): Promise<{ externalId: string; url: string }>;
}

export const PUBLISHERS: Partial<Record<Platform, SocialPublisher>> = {
  // TIKTOK: new TikTokPublisher(...),
  // YOUTUBE: new YouTubePublisher(...),
  // INSTAGRAM: new InstagramPublisher(...),
};
