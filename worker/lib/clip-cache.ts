/**
 * Generates the R2 object key for a cached clip.
 *
 * @param episodeId - The episode's database ID
 * @param durationTier - Duration tier in minutes (1, 2, 3, 5, 7, 10, 15, or 30)
 * @returns R2 key in the format `clips/{episodeId}/{durationTier}.mp3`
 */
export function clipKey(episodeId: string, durationTier: number): string {
  return `clips/${episodeId}/${durationTier}.mp3`;
}

/**
 * Generates the R2 object key for an assembled briefing.
 *
 * @param userId - The user's database ID
 * @param date - Date string in YYYY-MM-DD format
 * @returns R2 key in the format `briefings/{userId}/{date}.mp3`
 */
export function briefingKey(userId: string, date: string): string {
  return `briefings/${userId}/${date}.mp3`;
}

/**
 * Retrieves a cached clip from R2 storage.
 *
 * @param r2 - Cloudflare R2 bucket binding
 * @param episodeId - The episode's database ID
 * @param durationTier - Duration tier in minutes
 * @returns MP3 audio as ArrayBuffer, or null if not cached
 */
export async function getClip(
  r2: R2Bucket,
  episodeId: string,
  durationTier: number
): Promise<ArrayBuffer | null> {
  const key = clipKey(episodeId, durationTier);
  const obj = await r2.get(key);
  if (!obj) return null;
  return obj.arrayBuffer();
}

/**
 * Stores a clip in R2 storage.
 *
 * @param r2 - Cloudflare R2 bucket binding
 * @param episodeId - The episode's database ID
 * @param durationTier - Duration tier in minutes
 * @param audio - MP3 audio data to store
 */
export async function putClip(
  r2: R2Bucket,
  episodeId: string,
  durationTier: number,
  audio: ArrayBuffer
): Promise<void> {
  const key = clipKey(episodeId, durationTier);
  await r2.put(key, audio);
}

/**
 * Stores an assembled briefing in R2 storage.
 *
 * @param r2 - Cloudflare R2 bucket binding
 * @param userId - The user's database ID
 * @param date - Date string in YYYY-MM-DD format
 * @param audio - MP3 audio data to store
 * @returns The R2 key where the briefing was stored
 */
export async function putBriefing(
  r2: R2Bucket,
  userId: string,
  date: string,
  audio: ArrayBuffer
): Promise<string> {
  const key = briefingKey(userId, date);
  await r2.put(key, audio);
  return key;
}
