/**
 * InterestPicker — Reusable component for selecting preferred/excluded categories
 * and adding free-text topic tags. Used in both onboarding and settings.
 *
 * Category states cycle: neutral → preferred → excluded → neutral
 * Topics are free-text with add/remove.
 */
import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { Plus, X, Heart, Ban, Sparkles } from "lucide-react";

// ── Constants ──

const ALL_CATEGORIES = [
  { id: "technology", label: "Technology", emoji: "💻" },
  { id: "science", label: "Science", emoji: "🔬" },
  { id: "business", label: "Business", emoji: "📊" },
  { id: "health-fitness", label: "Health & Fitness", emoji: "💪" },
  { id: "society-culture", label: "Society & Culture", emoji: "🌍" },
  { id: "news", label: "News", emoji: "📰" },
  { id: "comedy", label: "Comedy", emoji: "😂" },
  { id: "education", label: "Education", emoji: "📚" },
  { id: "arts", label: "Arts", emoji: "🎨" },
  { id: "sports", label: "Sports", emoji: "⚽" },
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "tv-film", label: "TV & Film", emoji: "🎬" },
  { id: "true-crime", label: "True Crime", emoji: "🔍" },
  { id: "history", label: "History", emoji: "🏛️" },
  { id: "religion-spirituality", label: "Religion & Spirituality", emoji: "🙏" },
  { id: "kids-family", label: "Kids & Family", emoji: "👨‍👩‍👧" },
  { id: "government", label: "Government", emoji: "🏛️" },
  { id: "leisure", label: "Leisure", emoji: "🎯" },
  { id: "fiction", label: "Fiction", emoji: "📖" },
] as const;

type CategoryState = "neutral" | "preferred" | "excluded";

// ── Types ──

export interface InterestPickerProps {
  preferredCategories: string[];
  excludedCategories: string[];
  preferredTopics: string[];
  excludedTopics: string[];
  onChange: (prefs: {
    preferredCategories: string[];
    excludedCategories: string[];
    preferredTopics: string[];
    excludedTopics: string[];
  }) => void;
  /** Compact mode for onboarding (hides excluded topics section, smaller heading) */
  compact?: boolean;
}

// ── Helpers ──

function getCategoryState(
  id: string,
  preferred: string[],
  excluded: string[]
): CategoryState {
  if (preferred.includes(id)) return "preferred";
  if (excluded.includes(id)) return "excluded";
  return "neutral";
}

function nextState(current: CategoryState): CategoryState {
  if (current === "neutral") return "preferred";
  if (current === "preferred") return "excluded";
  return "neutral";
}

// ── Component ──

export function InterestPicker({
  preferredCategories,
  excludedCategories,
  preferredTopics,
  excludedTopics,
  onChange,
  compact = false,
}: InterestPickerProps) {
  const [topicInput, setTopicInput] = useState("");
  const [excludedTopicInput, setExcludedTopicInput] = useState("");
  const topicInputRef = useRef<HTMLInputElement>(null);
  const excludedTopicInputRef = useRef<HTMLInputElement>(null);

  const handleCategoryTap = useCallback(
    (categoryId: string) => {
      const state = getCategoryState(categoryId, preferredCategories, excludedCategories);
      const next = nextState(state);

      const newPreferred = preferredCategories.filter((c) => c !== categoryId);
      const newExcluded = excludedCategories.filter((c) => c !== categoryId);

      if (next === "preferred") newPreferred.push(categoryId);
      if (next === "excluded") newExcluded.push(categoryId);

      onChange({
        preferredCategories: newPreferred,
        excludedCategories: newExcluded,
        preferredTopics,
        excludedTopics,
      });
    },
    [preferredCategories, excludedCategories, preferredTopics, excludedTopics, onChange]
  );

  const addTopic = useCallback(
    (topic: string, excluded: boolean = false) => {
      const normalized = topic.trim().toLowerCase();
      if (!normalized || normalized.length > 50) return;

      if (excluded) {
        if (excludedTopics.includes(normalized)) return;
        onChange({
          preferredCategories,
          excludedCategories,
          preferredTopics,
          excludedTopics: [...excludedTopics, normalized],
        });
        setExcludedTopicInput("");
      } else {
        if (preferredTopics.includes(normalized)) return;
        onChange({
          preferredCategories,
          excludedCategories,
          preferredTopics: [...preferredTopics, normalized],
          excludedTopics,
        });
        setTopicInput("");
      }
    },
    [preferredCategories, excludedCategories, preferredTopics, excludedTopics, onChange]
  );

  const removeTopic = useCallback(
    (topic: string, excluded: boolean = false) => {
      if (excluded) {
        onChange({
          preferredCategories,
          excludedCategories,
          preferredTopics,
          excludedTopics: excludedTopics.filter((t) => t !== topic),
        });
      } else {
        onChange({
          preferredCategories,
          excludedCategories,
          preferredTopics: preferredTopics.filter((t) => t !== topic),
          excludedTopics,
        });
      }
    },
    [preferredCategories, excludedCategories, preferredTopics, excludedTopics, onChange]
  );

  const handleTopicKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, excluded: boolean = false) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTopic(excluded ? excludedTopicInput : topicInput, excluded);
      }
    },
    [addTopic, topicInput, excludedTopicInput]
  );

  const preferredCount = preferredCategories.length;
  const excludedCount = excludedCategories.length;

  return (
    <div className="space-y-6">
      {/* ── Category Grid ── */}
      <div className="space-y-3">
        {!compact && (
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Categories</h3>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {preferredCount > 0 && (
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3 text-primary" />
                  {preferredCount}
                </span>
              )}
              {excludedCount > 0 && (
                <span className="flex items-center gap-1">
                  <Ban className="w-3 h-3 text-destructive" />
                  {excludedCount}
                </span>
              )}
            </div>
          </div>
        )}

        {compact && (
          <p className="text-xs text-muted-foreground">
            Tap to like, tap again to hide, tap once more to reset.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((cat) => {
            const state = getCategoryState(
              cat.label,
              preferredCategories,
              excludedCategories
            );
            return (
              <CategoryChip
                key={cat.id}
                label={cat.label}
                emoji={cat.emoji}
                state={state}
                onTap={() => handleCategoryTap(cat.label)}
              />
            );
          })}
        </div>

        {!compact && (
          <p className="text-[11px] text-muted-foreground">
            Tap to like · tap again to hide · tap once more to reset
          </p>
        )}
      </div>

      {/* ── Preferred Topics ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {!compact && <Sparkles className="w-3.5 h-3.5 text-primary" />}
          <h3 className="text-sm font-medium">
            {compact ? "Topics you're into" : "Topics"}
          </h3>
        </div>

        <p className="text-xs text-muted-foreground">
          Add specific interests like "machine learning", "NBA", or "climate change".
        </p>

        {/* Topic tags */}
        {preferredTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {preferredTopics.map((topic) => (
              <TopicTag
                key={topic}
                label={topic}
                onRemove={() => removeTopic(topic, false)}
              />
            ))}
          </div>
        )}

        {/* Add topic input */}
        <div className="flex gap-2">
          <input
            ref={topicInputRef}
            type="text"
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={(e) => handleTopicKeyDown(e, false)}
            placeholder="Add a topic..."
            maxLength={50}
            className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-colors"
          />
          <button
            onClick={() => addTopic(topicInput, false)}
            disabled={!topicInput.trim()}
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* ── Excluded Topics (hidden in compact/onboarding mode) ── */}
      {!compact && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Ban className="w-3.5 h-3.5 text-destructive/70" />
            <h3 className="text-sm font-medium">Topics to avoid</h3>
          </div>

          <p className="text-xs text-muted-foreground">
            We'll filter out recommendations matching these topics.
          </p>

          {excludedTopics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {excludedTopics.map((topic) => (
                <TopicTag
                  key={topic}
                  label={topic}
                  variant="excluded"
                  onRemove={() => removeTopic(topic, true)}
                />
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={excludedTopicInputRef}
              type="text"
              value={excludedTopicInput}
              onChange={(e) => setExcludedTopicInput(e.target.value)}
              onKeyDown={(e) => handleTopicKeyDown(e, true)}
              placeholder="Add a topic to avoid..."
              maxLength={50}
              className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-destructive/50 focus:ring-1 focus:ring-destructive/25 transition-colors"
            />
            <button
              onClick={() => addTopic(excludedTopicInput, true)}
              disabled={!excludedTopicInput.trim()}
              className="h-9 px-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-destructive/20 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CategoryChip ──

function CategoryChip({
  label,
  emoji,
  state,
  onTap,
}: {
  label: string;
  emoji: string;
  state: CategoryState;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        transition-all duration-150 select-none active:scale-95
        ${
          state === "preferred"
            ? "bg-primary text-primary-foreground ring-1 ring-primary/30"
            : state === "excluded"
              ? "bg-destructive/10 text-destructive/70 line-through ring-1 ring-destructive/20"
              : "bg-muted text-foreground/70 hover:bg-accent"
        }
      `}
      aria-label={`${label}: ${state === "preferred" ? "liked" : state === "excluded" ? "hidden" : "not selected"}`}
    >
      <span className="text-sm leading-none">{emoji}</span>
      <span>{label}</span>
      {state === "preferred" && <Heart className="w-3 h-3 fill-current" />}
      {state === "excluded" && <Ban className="w-3 h-3" />}
    </button>
  );
}

// ── TopicTag ──

function TopicTag({
  label,
  variant = "preferred",
  onRemove,
}: {
  label: string;
  variant?: "preferred" | "excluded";
  onRemove: () => void;
}) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium
        transition-colors
        ${
          variant === "preferred"
            ? "bg-primary/10 text-primary"
            : "bg-destructive/10 text-destructive/70"
        }
      `}
    >
      {label}
      <button
        onClick={onRemove}
        className={`
          w-4 h-4 rounded-full flex items-center justify-center
          transition-colors
          ${
            variant === "preferred"
              ? "hover:bg-primary/20 text-primary/60 hover:text-primary"
              : "hover:bg-destructive/20 text-destructive/40 hover:text-destructive/70"
          }
        `}
        aria-label={`Remove ${label}`}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}
