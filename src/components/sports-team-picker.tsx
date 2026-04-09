/**
 * SportsTeamPicker — Browse and select sports teams for recommendation boosting.
 * Features: search, accordion browse (Local → leagues), team chip selection.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, MapPin, Trophy, X, Loader2 } from "lucide-react";
import { useFetch } from "../lib/use-fetch";
import { useApiFetch } from "../lib/api";
import { toast } from "sonner";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./ui/accordion";

interface Team {
  id: string;
  name: string;
  city: string;
  nickname: string;
  abbreviation: string;
  leagueId: string;
  leagueName: string;
  selected: boolean;
}

interface League {
  id: string;
  name: string;
  sport: string;
  teams: Team[];
}

interface SportsTeamsData {
  selected: Team[];
  local: Team[];
  leagues: League[];
}

export interface SportsTeamPickerProps {
  /** Compact mode for onboarding — only shows local teams + note about full picker */
  compact?: boolean;
}

export function SportsTeamPicker({ compact = false }: SportsTeamPickerProps) {
  const apiFetch = useApiFetch();
  const { data, loading, refetch } = useFetch<{ data: SportsTeamsData }>("/me/sports-teams");
  const [searchInput, setSearchInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Track selected IDs locally for optimistic updates
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Sync from server on load
  useEffect(() => {
    if (data?.data?.selected && !initialized) {
      setSelectedIds(new Set(data.data.selected.map((t) => t.id)));
      setInitialized(true);
    }
  }, [data, initialized]);

  const toggleTeam = useCallback(
    async (teamId: string) => {
      const next = new Set(selectedIds);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      setSelectedIds(next);

      setSaving(true);
      try {
        await apiFetch("/me/sports-teams", {
          method: "PUT",
          body: JSON.stringify({ teamIds: [...next] }),
        });
      } catch {
        // Revert on failure
        setSelectedIds(selectedIds);
        toast.error("Failed to update teams");
      } finally {
        setSaving(false);
      }
    },
    [selectedIds, apiFetch]
  );

  const teamsData = data?.data;
  const localTeams = teamsData?.local ?? [];
  const leagues = teamsData?.leagues ?? [];

  // Filter by search
  const searchLower = searchInput.trim().toLowerCase();
  const filteredLocal = useMemo(
    () =>
      searchLower
        ? localTeams.filter(
            (t) =>
              t.name.toLowerCase().includes(searchLower) ||
              t.city.toLowerCase().includes(searchLower) ||
              t.nickname.toLowerCase().includes(searchLower)
          )
        : localTeams,
    [localTeams, searchLower]
  );

  const filteredLeagues = useMemo(
    () =>
      leagues
        .map((league) => ({
          ...league,
          teams: searchLower
            ? league.teams.filter(
                (t) =>
                  t.name.toLowerCase().includes(searchLower) ||
                  t.city.toLowerCase().includes(searchLower) ||
                  t.nickname.toLowerCase().includes(searchLower)
              )
            : league.teams,
        }))
        .filter((league) => league.teams.length > 0),
    [leagues, searchLower]
  );

  // Selected teams for display
  const allTeams = useMemo(() => {
    const map = new Map<string, Team>();
    for (const t of localTeams) map.set(t.id, t);
    for (const l of leagues) for (const t of l.teams) map.set(t.id, t);
    return map;
  }, [localTeams, leagues]);

  const selectedTeams = useMemo(
    () => [...selectedIds].map((id) => allTeams.get(id)).filter(Boolean) as Team[],
    [selectedIds, allTeams]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading teams...
      </div>
    );
  }

  // Compact mode for onboarding: just show local teams
  if (compact) {
    if (localTeams.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-sm font-medium">Your local teams</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {localTeams.map((team) => (
            <TeamChip
              key={team.id}
              team={team}
              selected={selectedIds.has(team.id)}
              onToggle={() => toggleTeam(team.id)}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          More teams available in your profile settings.
        </p>
      </div>
    );
  }

  // Full mode for settings
  return (
    <div className="space-y-4">
      {/* Selected teams chips */}
      {selectedTeams.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Following {selectedTeams.length} team{selectedTeams.length !== 1 ? "s" : ""}
            {saving && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selectedTeams.map((team) => (
              <span
                key={team.id}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
              >
                {team.nickname}
                <button
                  onClick={() => toggleTeam(team.id)}
                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-primary/20 text-primary/60 hover:text-primary transition-colors"
                  aria-label={`Remove ${team.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search teams..."
          className="w-full pl-10 pr-10 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-colors"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground/70" />
          </button>
        )}
      </div>

      {/* Accordion browse */}
      <Accordion type="multiple" defaultValue={localTeams.length > 0 ? ["local"] : []}>
        {/* Local teams section */}
        {filteredLocal.length > 0 && (
          <AccordionItem value="local">
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Local Teams
                <span className="text-xs text-muted-foreground font-normal">
                  ({filteredLocal.length})
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2">
                {filteredLocal.map((team) => (
                  <TeamChip
                    key={team.id}
                    team={team}
                    selected={selectedIds.has(team.id)}
                    onToggle={() => toggleTeam(team.id)}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* League sections */}
        {filteredLeagues.map((league) => (
          <AccordionItem key={league.id} value={league.id}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-muted-foreground" />
                {league.name}
                <span className="text-xs text-muted-foreground font-normal">
                  ({league.teams.length})
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2">
                {league.teams.map((team) => (
                  <TeamChip
                    key={team.id}
                    team={team}
                    selected={selectedIds.has(team.id)}
                    onToggle={() => toggleTeam(team.id)}
                  />
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {filteredLocal.length === 0 && filteredLeagues.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {searchInput ? "No teams found." : "No sports teams available."}
        </p>
      )}
    </div>
  );
}

function TeamChip({
  team,
  selected,
  onToggle,
}: {
  team: Team;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        transition-all duration-150 select-none active:scale-95
        ${
          selected
            ? "bg-primary text-primary-foreground ring-1 ring-primary/30"
            : "bg-muted text-foreground/70 hover:bg-accent"
        }
      `}
      aria-label={`${team.name}: ${selected ? "following" : "not following"}`}
    >
      <span>{team.abbreviation}</span>
      <span className="hidden sm:inline">{team.nickname}</span>
    </button>
  );
}
