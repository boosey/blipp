const MAX_DURATION_SECONDS = 900; // 15 minutes

export async function processAudio(audioUrl: string, speed: number, token?: string | null): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(audioUrl, { headers });
  if (!response.ok) {
    throw new Error(`Audio fetch failed: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  // Truncate to first 15 minutes of source audio
  const maxSamples = Math.min(
    decoded.length,
    MAX_DURATION_SECONDS * decoded.sampleRate
  );

  // Create truncated buffer
  const truncated = new AudioContext().createBuffer(
    decoded.numberOfChannels,
    maxSamples,
    decoded.sampleRate
  );
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    truncated.copyToChannel(
      decoded.getChannelData(ch).slice(0, maxSamples),
      ch
    );
  }

  // Apply speed change via OfflineAudioContext
  const outputLength = Math.ceil(maxSamples / speed);
  const offlineCtx = new OfflineAudioContext(
    truncated.numberOfChannels,
    outputLength,
    truncated.sampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = truncated;
  source.playbackRate.value = speed;
  source.connect(offlineCtx.destination);
  source.start();

  const rendered = await offlineCtx.startRendering();
  return encodeToMp3(rendered);
}

export async function encodeToMp3(audioBuffer: AudioBuffer): Promise<Blob> {
  const { Mp3Encoder } = await import("@/lib/lamejs-bundle");
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new Mp3Encoder(1, sampleRate, 128); // mono, 128kbps

  // Convert Float32 to Int16
  const samples = audioBuffer.getChannelData(0);
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const chunks: Uint8Array[] = [];
  // Encode in 1152-sample chunks
  for (let i = 0; i < int16.length; i += 1152) {
    const chunk = int16.subarray(i, i + 1152);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) chunks.push(new Uint8Array(mp3buf));
  }
  const final = encoder.flush();
  if (final.length > 0) chunks.push(new Uint8Array(final));

  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}
