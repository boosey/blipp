export type ExternalLink =
  | { kind: "apple_episode"; url: string }
  | { kind: "apple_show"; url: string }
  | { kind: "podcast_index"; url: string }
  | { kind: "none" };
