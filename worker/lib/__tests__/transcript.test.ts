import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseVTT, parseSRT, fetchTranscript } from "../transcript";

describe("parseVTT", () => {
  it("should strip WEBVTT header and timing lines", () => {
    const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:05.000
Hello world

2
00:00:05.000 --> 00:00:10.000
This is a test`;

    const result = parseVTT(vtt);
    expect(result).toBe("Hello world This is a test");
  });

  it("should strip HTML tags from cue text", () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
<v Speaker 1>Hello there

00:00:05.000 --> 00:00:10.000
<b>Important</b> point`;

    const result = parseVTT(vtt);
    expect(result).toBe("Hello there Important point");
  });

  it("should skip NOTE comments", () => {
    const vtt = `WEBVTT

NOTE This is a comment

00:00:00.000 --> 00:00:02.000
Actual content`;

    const result = parseVTT(vtt);
    expect(result).toBe("Actual content");
  });

  it("should handle empty input", () => {
    expect(parseVTT("")).toBe("");
    expect(parseVTT("WEBVTT")).toBe("");
  });

  it("should handle multiple speakers on consecutive lines", () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:03.000
First line
Second line`;

    const result = parseVTT(vtt);
    expect(result).toContain("First line");
    expect(result).toContain("Second line");
  });
});

describe("parseSRT", () => {
  it("should strip sequence numbers and timing lines", () => {
    const srt = `1
00:00:00,000 --> 00:00:05,000
Hello from SRT

2
00:00:05,000 --> 00:00:10,000
Second subtitle`;

    const result = parseSRT(srt);
    expect(result).toBe("Hello from SRT Second subtitle");
  });

  it("should handle HTML tags in SRT", () => {
    const srt = `1
00:00:00,000 --> 00:00:05,000
<i>Italic text</i> here`;

    const result = parseSRT(srt);
    expect(result).toBe("Italic text here");
  });

  it("should handle empty input", () => {
    expect(parseSRT("")).toBe("");
  });

  it("should handle SRT with Windows line endings", () => {
    const srt = "1\r\n00:00:00,000 --> 00:00:05,000\r\nHello\r\n\r\n2\r\n00:00:05,000 --> 00:00:10,000\r\nWorld";

    const result = parseSRT(srt);
    expect(result).toBe("Hello World");
  });
});

describe("fetchTranscript", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should fetch and parse VTT content", async () => {
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:05.000
Hello from VTT`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(vttContent),
    });

    const result = await fetchTranscript("https://example.com/transcript.vtt");
    expect(result).toBe("Hello from VTT");
  });

  it("should detect VTT by content header when URL has no extension", async () => {
    const vttContent = `WEBVTT

00:00:00.000 --> 00:00:02.000
Auto detected`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(vttContent),
    });

    const result = await fetchTranscript("https://example.com/transcript");
    expect(result).toBe("Auto detected");
  });

  it("should fetch and parse SRT content", async () => {
    const srtContent = `1
00:00:00,000 --> 00:00:05,000
Hello from SRT`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(srtContent),
    });

    const result = await fetchTranscript("https://example.com/transcript.srt");
    expect(result).toBe("Hello from SRT");
  });

  it("should throw on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(
      fetchTranscript("https://example.com/missing.vtt")
    ).rejects.toThrow("Failed to fetch transcript: 404 Not Found");
  });

  it("should call fetch with the provided URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi"),
    });

    await fetchTranscript("https://cdn.example.com/my-transcript.vtt");
    expect(mockFetch).toHaveBeenCalledWith("https://cdn.example.com/my-transcript.vtt");
  });
});
