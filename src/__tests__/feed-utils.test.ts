import { isSameDay, groupByDate, formatDuration } from "../lib/feed-utils";
import type { FeedItem } from "../types/feed";

const makeItem = (overrides: Partial<FeedItem> = {}): FeedItem =>
  ({
    id: "fi-1",
    source: "SUBSCRIPTION",
    status: "READY",
    listened: false,
    listenedAt: null,
    playbackPositionSeconds: null,
    durationTier: 5,
    createdAt: new Date().toISOString(),
    errorMessage: null,
    podcast: { id: "p1", title: "Pod", imageUrl: null },
    episode: {
      id: "e1",
      title: "Ep",
      publishedAt: new Date().toISOString(),
      durationSeconds: 3600,
    },
    briefing: null,
    ...overrides,
  }) as FeedItem;

describe("isSameDay", () => {
  it("returns true for the same day", () => {
    const d1 = new Date(2026, 2, 18, 9, 0, 0);
    const d2 = new Date(2026, 2, 18, 23, 59, 59);
    expect(isSameDay(d1, d2)).toBe(true);
  });

  it("returns false for different days", () => {
    const d1 = new Date(2026, 2, 18);
    const d2 = new Date(2026, 2, 19);
    expect(isSameDay(d1, d2)).toBe(false);
  });

  it("returns false for different months", () => {
    const d1 = new Date(2026, 1, 18);
    const d2 = new Date(2026, 2, 18);
    expect(isSameDay(d1, d2)).toBe(false);
  });

  it("returns false for different years", () => {
    const d1 = new Date(2025, 2, 18);
    const d2 = new Date(2026, 2, 18);
    expect(isSameDay(d1, d2)).toBe(false);
  });
});

describe("groupByDate", () => {
  it("groups items into Today, Yesterday, This Week, and date labels", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(now.getDate() - 14);

    const items = [
      makeItem({ id: "today", createdAt: now.toISOString() }),
      makeItem({ id: "yesterday", createdAt: yesterday.toISOString() }),
      makeItem({ id: "this-week", createdAt: threeDaysAgo.toISOString() }),
      makeItem({ id: "older", createdAt: twoWeeksAgo.toISOString() }),
    ];

    const groups = groupByDate(items);

    expect(groups).toHaveLength(4);
    expect(groups[0].label).toBe("Today");
    expect(groups[0].items).toHaveLength(1);
    expect(groups[0].items[0].id).toBe("today");

    expect(groups[1].label).toBe("Yesterday");
    expect(groups[1].items).toHaveLength(1);
    expect(groups[1].items[0].id).toBe("yesterday");

    expect(groups[2].label).toBe("This Week");
    expect(groups[2].items).toHaveLength(1);
    expect(groups[2].items[0].id).toBe("this-week");

    // Older items get a date label like "March 4"
    expect(groups[3].label).not.toBe("Today");
    expect(groups[3].label).not.toBe("Yesterday");
    expect(groups[3].label).not.toBe("This Week");
    expect(groups[3].items).toHaveLength(1);
    expect(groups[3].items[0].id).toBe("older");
  });

  it("uses createdAt by default", () => {
    const now = new Date();
    const items = [makeItem({ id: "a", createdAt: now.toISOString() })];
    const groups = groupByDate(items);
    expect(groups[0].label).toBe("Today");
  });

  it("uses listenedAt when dateKey is listenedAt", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    // createdAt is today, but listenedAt is yesterday
    const items = [
      makeItem({
        id: "a",
        createdAt: now.toISOString(),
        listenedAt: yesterday.toISOString(),
      }),
    ];
    const groups = groupByDate(items, "listenedAt");
    expect(groups[0].label).toBe("Yesterday");
  });

  it("falls back to createdAt when listenedAt is null", () => {
    const now = new Date();
    const items = [
      makeItem({
        id: "a",
        createdAt: now.toISOString(),
        listenedAt: null,
      }),
    ];
    const groups = groupByDate(items, "listenedAt");
    expect(groups[0].label).toBe("Today");
  });

  it("returns empty array for empty input", () => {
    const groups = groupByDate([]);
    expect(groups).toEqual([]);
  });

  it("preserves item order within groups", () => {
    const now = new Date();
    const items = [
      makeItem({ id: "first", createdAt: now.toISOString() }),
      makeItem({ id: "second", createdAt: now.toISOString() }),
      makeItem({ id: "third", createdAt: now.toISOString() }),
    ];

    const groups = groupByDate(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});

describe("formatDuration", () => {
  it("returns M:SS when actualSeconds is a positive number", () => {
    expect(formatDuration(185, 5)).toBe("3:05");
  });

  it("returns Xm when actualSeconds is null", () => {
    expect(formatDuration(null, 5)).toBe("5m");
  });

  it("returns Xm when actualSeconds is 0", () => {
    expect(formatDuration(0, 5)).toBe("5m");
  });

  it("returns Xm when actualSeconds is undefined", () => {
    expect(formatDuration(undefined, 5)).toBe("5m");
  });

  it("handles exact minute boundaries", () => {
    expect(formatDuration(120, 2)).toBe("2:00");
  });

  it("pads single-digit seconds with a leading zero", () => {
    expect(formatDuration(62, 1)).toBe("1:02");
  });
});
