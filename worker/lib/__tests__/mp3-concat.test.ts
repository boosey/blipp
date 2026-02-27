import { describe, it, expect } from "vitest";
import { stripId3v2Header, concatMp3Buffers } from "../mp3-concat";

/**
 * Builds a fake ID3v2 header with the given body size (syncsafe-encoded).
 * Returns a Uint8Array: [I, D, 3, ver, rev, flags, s3, s2, s1, s0, ...body]
 */
function makeId3Header(bodySize: number): Uint8Array {
  const header = new Uint8Array(10 + bodySize);
  header[0] = 0x49; // 'I'
  header[1] = 0x44; // 'D'
  header[2] = 0x33; // '3'
  header[3] = 0x04; // version
  header[4] = 0x00; // revision
  header[5] = 0x00; // flags
  // Syncsafe encoding of bodySize
  header[6] = (bodySize >> 21) & 0x7f;
  header[7] = (bodySize >> 14) & 0x7f;
  header[8] = (bodySize >> 7) & 0x7f;
  header[9] = bodySize & 0x7f;
  // Fill body with 0xAA pattern for identification
  for (let i = 10; i < header.length; i++) {
    header[i] = 0xaa;
  }
  return header;
}

describe("stripId3v2Header", () => {
  it("should strip ID3v2 header when present", () => {
    const id3Body = 20;
    const id3Header = makeId3Header(id3Body);
    // Append some MP3 frame data after the header
    const mp3Data = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
    const combined = new Uint8Array(id3Header.length + mp3Data.length);
    combined.set(id3Header);
    combined.set(mp3Data, id3Header.length);

    const result = stripId3v2Header(combined);

    expect(result.length).toBe(mp3Data.length);
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xfb);
  });

  it("should return unchanged data when no ID3v2 header", () => {
    const mp3Data = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x01, 0x02]);
    const result = stripId3v2Header(mp3Data);

    expect(result).toBe(mp3Data);
    expect(result.length).toBe(6);
  });

  it("should handle data shorter than 10 bytes", () => {
    const short = new Uint8Array([0x49, 0x44, 0x33]);
    const result = stripId3v2Header(short);

    expect(result).toBe(short);
  });

  it("should correctly decode syncsafe size", () => {
    // Syncsafe size: 0x00, 0x00, 0x01, 0x00 = 128 bytes
    const bodySize = 128;
    const id3 = makeId3Header(bodySize);
    const mp3Frame = new Uint8Array([0xff, 0xfb]);
    const combined = new Uint8Array(id3.length + mp3Frame.length);
    combined.set(id3);
    combined.set(mp3Frame, id3.length);

    const result = stripId3v2Header(combined);

    expect(result.length).toBe(2);
    expect(result[0]).toBe(0xff);
  });
});

describe("concatMp3Buffers", () => {
  it("should concatenate two plain MP3 buffers", () => {
    const buf1 = new Uint8Array([0xff, 0xfb, 0x01]).buffer;
    const buf2 = new Uint8Array([0xff, 0xfb, 0x02]).buffer;

    const result = new Uint8Array(concatMp3Buffers([buf1, buf2]));

    expect(result.length).toBe(6);
    expect(result[0]).toBe(0xff);
    expect(result[2]).toBe(0x01);
    expect(result[3]).toBe(0xff);
    expect(result[5]).toBe(0x02);
  });

  it("should strip ID3v2 from second buffer but keep first", () => {
    // First buffer has an ID3 header — should be kept
    const id3Size = 10;
    const id3Header = makeId3Header(id3Size);
    const firstMp3 = new Uint8Array([0xff, 0xfb]);
    const first = new Uint8Array(id3Header.length + firstMp3.length);
    first.set(id3Header);
    first.set(firstMp3, id3Header.length);

    // Second buffer also has an ID3 header — should be stripped
    const secondId3 = makeId3Header(5);
    const secondMp3 = new Uint8Array([0xff, 0xfb, 0x99]);
    const second = new Uint8Array(secondId3.length + secondMp3.length);
    second.set(secondId3);
    second.set(secondMp3, secondId3.length);

    const result = new Uint8Array(
      concatMp3Buffers([first.buffer, second.buffer])
    );

    // First buffer: full (id3Header + mp3) = 20 + 2 = 22
    // Second buffer: stripped to mp3 only = 3
    expect(result.length).toBe(first.length + secondMp3.length);
    // First buffer starts with ID3
    expect(result[0]).toBe(0x49);
    // Second buffer's mp3 data at the end
    expect(result[result.length - 1]).toBe(0x99);
  });

  it("should return empty buffer for empty input", () => {
    const result = concatMp3Buffers([]);
    expect(result.byteLength).toBe(0);
  });

  it("should handle a single buffer", () => {
    const buf = new Uint8Array([0xff, 0xfb, 0x01, 0x02]).buffer;
    const result = new Uint8Array(concatMp3Buffers([buf]));

    expect(result.length).toBe(4);
    expect(result[0]).toBe(0xff);
  });
});
