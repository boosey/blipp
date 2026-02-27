/**
 * Strips an ID3v2 header from MP3 data if present.
 *
 * ID3v2 headers start with "ID3" (0x49 0x44 0x33) and encode their size
 * in bytes 6-9 using syncsafe integers (7 bits per byte). The total header
 * length is 10 (fixed header) + syncsafe size.
 *
 * @param data - Raw MP3 file as Uint8Array
 * @returns Uint8Array with ID3v2 header removed, or original data if no header
 */
export function stripId3v2Header(data: Uint8Array): Uint8Array {
  // ID3v2 header: starts with "ID3" (0x49, 0x44, 0x33)
  if (
    data.length >= 10 &&
    data[0] === 0x49 &&
    data[1] === 0x44 &&
    data[2] === 0x33
  ) {
    // Syncsafe integer: each byte uses only lower 7 bits
    const size =
      ((data[6] & 0x7f) << 21) |
      ((data[7] & 0x7f) << 14) |
      ((data[8] & 0x7f) << 7) |
      (data[9] & 0x7f);

    const headerLength = 10 + size;
    return data.subarray(headerLength);
  }

  return data;
}

/**
 * Concatenates multiple MP3 buffers into a single continuous stream.
 *
 * Strips ID3v2 headers from all buffers except the first to avoid
 * metadata corruption in the middle of the audio stream. This is a
 * raw frame-level concatenation — no re-encoding needed since MP3
 * frames are independently decodable.
 *
 * @param buffers - Array of MP3 audio ArrayBuffers to concatenate
 * @returns Single concatenated MP3 ArrayBuffer
 */
export function concatMp3Buffers(buffers: ArrayBuffer[]): ArrayBuffer {
  if (buffers.length === 0) {
    return new ArrayBuffer(0);
  }

  const processed = buffers.map((buf, i) => {
    const arr = new Uint8Array(buf);
    // Keep the first buffer's ID3 header intact for metadata
    return i === 0 ? arr : stripId3v2Header(arr);
  });

  const totalLength = processed.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const arr of processed) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result.buffer as ArrayBuffer;
}
