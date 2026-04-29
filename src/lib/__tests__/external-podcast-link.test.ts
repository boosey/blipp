import { describe, it, expect } from "vitest";
import { resolveExternalEpisodeLink } from "../external-podcast-link";

describe("resolveExternalEpisodeLink", () => {
  it("returns apple_episode URL when both appleId and trackId are present", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: "1000123" },
      podcast: { appleId: "456", podcastIndexId: "789" },
    });
    expect(result).toEqual({
      kind: "apple_episode",
      url: "https://podcasts.apple.com/podcast/id456?i=1000123",
    });
  });

  it("returns apple_show URL when only appleId is present", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: null },
      podcast: { appleId: "456", podcastIndexId: "789" },
    });
    expect(result).toEqual({
      kind: "apple_show",
      url: "https://podcasts.apple.com/podcast/id456",
    });
  });

  it("returns podcast_index URL when only podcastIndexId is present", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: null },
      podcast: { appleId: null, podcastIndexId: "789" },
    });
    expect(result).toEqual({
      kind: "podcast_index",
      url: "https://podcastindex.org/podcast/789",
    });
  });

  it("returns kind='none' when no IDs are present", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: null },
      podcast: { appleId: null, podcastIndexId: null },
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("does not produce an episode URL with undefined appleId when trackId is set without appleId", () => {
    const result = resolveExternalEpisodeLink({
      episode: { appleEpisodeTrackId: "1000123" },
      podcast: { appleId: null, podcastIndexId: "789" },
    });
    expect(result.kind).not.toBe("apple_episode");
    expect(result.kind).toBe("podcast_index");
  });
});
