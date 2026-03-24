import { describe, it, expect } from "vitest";
import { chunkNarrativeText, createSilenceFrame, concatenateAudioChunks } from "../tts-chunking";

describe("chunkNarrativeText", () => {
  it("returns single chunk when text is under limit", () => {
    const text = "Hello world. This is a short narrative.";
    expect(chunkNarrativeText(text, 1000)).toEqual([text]);
  });

  it("returns empty array for empty text", () => {
    expect(chunkNarrativeText("", 100)).toEqual([]);
  });

  it("splits on paragraph boundaries", () => {
    const p1 = "First paragraph here.";
    const p2 = "Second paragraph here.";
    const p3 = "Third paragraph here.";
    const text = `${p1}\n\n${p2}\n\n${p3}`;
    // Limit allows p1+p2 but not all three
    const limit = p1.length + 2 + p2.length + 5; // just enough for p1\n\np2 + a bit
    const chunks = chunkNarrativeText(text, limit);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(`${p1}\n\n${p2}`);
    expect(chunks[1]).toBe(p3);
  });

  it("falls back to sentence splitting for long paragraphs", () => {
    const sentences = Array.from({ length: 10 }, (_, i) => `Sentence number ${i + 1} is here.`);
    const longParagraph = sentences.join(" ");
    // Set limit so that not all sentences fit
    const chunks = chunkNarrativeText(longParagraph, 100);
    expect(chunks.length).toBeGreaterThan(1);
    // All content should be preserved
    const rejoined = chunks.join(" ");
    expect(rejoined).toBe(longParagraph);
  });

  it("hard splits when a single sentence exceeds limit", () => {
    const longSentence = "A".repeat(250);
    const chunks = chunkNarrativeText(longSentence, 100);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(100);
    expect(chunks[1].length).toBe(100);
    expect(chunks[2].length).toBe(50);
  });

  it("handles text exactly at limit", () => {
    const text = "A".repeat(100);
    expect(chunkNarrativeText(text, 100)).toEqual([text]);
  });
});

describe("createSilenceFrame", () => {
  it("returns non-empty ArrayBuffer", () => {
    const silence = createSilenceFrame();
    expect(silence.byteLength).toBeGreaterThan(0);
  });

  it("starts with MP3 sync bytes", () => {
    const silence = createSilenceFrame();
    const view = new Uint8Array(silence);
    expect(view[0]).toBe(0xFF);
    expect(view[1]).toBe(0xFB);
  });
});

describe("concatenateAudioChunks", () => {
  it("returns empty buffer for no chunks", () => {
    const result = concatenateAudioChunks([], new ArrayBuffer(0));
    expect(result.byteLength).toBe(0);
  });

  it("returns single chunk as-is", () => {
    const chunk = new Uint8Array([1, 2, 3]).buffer;
    const silence = new Uint8Array([0]).buffer;
    const result = concatenateAudioChunks([chunk], silence);
    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("interleaves silence between chunks", () => {
    const c1 = new Uint8Array([1, 2]).buffer;
    const c2 = new Uint8Array([3, 4]).buffer;
    const silence = new Uint8Array([0, 0]).buffer;
    const result = concatenateAudioChunks([c1, c2], silence);
    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 2, 0, 0, 3, 4]));
  });

  it("handles three chunks with silence between each pair", () => {
    const c1 = new Uint8Array([1]).buffer;
    const c2 = new Uint8Array([2]).buffer;
    const c3 = new Uint8Array([3]).buffer;
    const silence = new Uint8Array([0]).buffer;
    const result = concatenateAudioChunks([c1, c2, c3], silence);
    expect(new Uint8Array(result)).toEqual(new Uint8Array([1, 0, 2, 0, 3]));
  });
});
