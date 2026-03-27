import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  RefreshCw,
  Users,
  Podcast,
  Loader2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  AdminRecommendationStats,
  AdminRecommendationUserRow,
  AdminRecommendationUserDetail,
  AdminPodcastProfile,
  PaginatedResponse,
} from "@/types/admin";
import { relativeTime } from "@/components/admin/recommendations/helpers";
import { StatPill } from "@/components/admin/recommendations/stat-pill";
import { UserRow } from "@/components/admin/recommendations/user-row";
import { UserDetailPanel } from "@/components/admin/recommendations/user-detail-panel";
import { PodcastProfilesTab } from "@/components/admin/recommendations/podcast-profiles-tab";
import { SettingsTab } from "@/components/admin/recommendations/settings-tab";
import { EmbeddingsTab } from "@/components/admin/recommendations/embeddings-tab";
import { TopicsTab } from "@/components/admin/recommendations/topics-tab";
import { RecommendationsSkeleton } from "@/components/admin/recommendations/recommendations-skeleton";

export default function RecommendationsPage() {
  const apiFetch = useAdminFetch();

  const [stats, setStats] = useState<AdminRecommendationStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [users, setUsers] = useState<AdminRecommendationUserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AdminRecommendationUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [podcastProfiles, setPodcastProfiles] = useState<AdminPodcastProfile[]>([]);
  const [podcastProfilesTotal, setPodcastProfilesTotal] = useState(0);
  const [podcastProfilesLoading, setPodcastProfilesLoading] = useState(false);
  const [podcastProfilesLoaded, setPodcastProfilesLoaded] = useState(false);
  const [recomputingAll, setRecomputingAll] = useState(false);
  const [recomputedAllCount, setRecomputedAllCount] = useState<number | null>(null);
  const [recomputingUser, setRecomputingUser] = useState(false);
  const [rightTab, setRightTab] = useState<
    "user" | "podcasts" | "settings" | "embeddings" | "topics"
  >("user");

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    apiFetch<{ data: AdminRecommendationStats }>("/recommendations/stats")
      .then((r) => setStats(r.data))
      .catch(console.error)
      .finally(() => setStatsLoading(false));
  }, [apiFetch]);

  const loadUsers = useCallback(() => {
    setUsersLoading(true);
    apiFetch<PaginatedResponse<AdminRecommendationUserRow>>(
      "/recommendations/users?page=1&pageSize=30"
    )
      .then((r) => {
        setUsers(r.data);
        setUsersTotal(r.total);
      })
      .catch(console.error)
      .finally(() => setUsersLoading(false));
  }, [apiFetch]);

  useEffect(() => {
    loadStats();
    loadUsers();
  }, [loadStats, loadUsers]);

  const loadUserDetail = useCallback(
    (userId: string) => {
      setDetailLoading(true);
      setUserDetail(null);
      apiFetch<{ data: AdminRecommendationUserDetail }>(`/recommendations/users/${userId}`)
        .then((r) => setUserDetail(r.data))
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    },
    [apiFetch]
  );

  const handleSelectUser = useCallback(
    (userId: string) => {
      setSelectedUserId(userId);
      setRightTab("user");
      loadUserDetail(userId);
    },
    [loadUserDetail]
  );

  const handleRecomputeAll = useCallback(() => {
    setRecomputingAll(true);
    setRecomputedAllCount(null);
    apiFetch<{ data: { recomputed: number } }>("/recommendations/recompute", { method: "POST" })
      .then((r) => {
        setRecomputedAllCount(r.data.recomputed);
        loadStats();
        loadUsers();
      })
      .catch(console.error)
      .finally(() => setRecomputingAll(false));
  }, [apiFetch, loadStats, loadUsers]);

  const handleRecomputeUser = useCallback(() => {
    if (!selectedUserId) return;
    setRecomputingUser(true);
    apiFetch<{ data: { userId: string; recomputed: boolean } }>(
      `/recommendations/users/${selectedUserId}/recompute`,
      { method: "POST" }
    )
      .then(() => {
        loadUserDetail(selectedUserId);
        loadStats();
        loadUsers();
      })
      .catch(console.error)
      .finally(() => setRecomputingUser(false));
  }, [apiFetch, selectedUserId, loadUserDetail, loadStats, loadUsers]);

  const handlePodcastProfilesTabChange = useCallback(() => {
    setRightTab("podcasts");
    if (!podcastProfilesLoaded) {
      setPodcastProfilesLoading(true);
      apiFetch<PaginatedResponse<AdminPodcastProfile>>(
        "/recommendations/podcast-profiles?page=1&pageSize=30"
      )
        .then((r) => {
          setPodcastProfiles(r.data);
          setPodcastProfilesTotal(r.total);
          setPodcastProfilesLoaded(true);
        })
        .catch(console.error)
        .finally(() => setPodcastProfilesLoading(false));
    }
  }, [apiFetch, podcastProfilesLoaded]);

  const handleTabChange = useCallback(
    (value: string) => {
      if (value === "podcasts") {
        handlePodcastProfilesTabChange();
      } else {
        setRightTab(value as typeof rightTab);
      }
    },
    [handlePodcastProfilesTabChange]
  );

  if (usersLoading && users.length === 0 && statsLoading) {
    return <RecommendationsSkeleton />;
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* LEFT PANE */}
      <div className="w-[40%] flex flex-col gap-3 min-h-0">
        {/* Stats Bar */}
        <div className="flex gap-2">
          {statsLoading ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 flex-1 bg-white/5 rounded-lg" />
              ))}
            </>
          ) : (
            <>
              <StatPill icon={Users} label="Users Profiled" value={stats?.usersWithProfiles ?? 0} color="#3B82F6" />
              <StatPill icon={Podcast} label="Podcasts Profiled" value={stats?.podcastsWithProfiles ?? 0} color="#8B5CF6" />
              <StatPill icon={Zap} label="Cache Rate" value={stats != null ? `${Math.round(stats.cacheHitRate * 100)}%` : "-"} color="#10B981" />
              <StatPill icon={TrendingUp} label="Last Compute" value={relativeTime(stats?.lastComputeAt)} color="#F59E0B" />
            </>
          )}
        </div>

        {/* Recompute All Button */}
        <Button
          size="sm"
          disabled={recomputingAll}
          onClick={handleRecomputeAll}
          className="w-full bg-[#1A2942] border border-white/5 hover:border-white/10 text-[#F9FAFB] text-xs gap-2"
        >
          {recomputingAll ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 text-[#9CA3AF]" />
          )}
          {recomputingAll
            ? "Recomputing Podcast Profiles..."
            : recomputedAllCount !== null
              ? `Recompute Podcast Profiles — ${recomputedAllCount} updated`
              : "Recompute Podcast Profiles"}
        </Button>

        {/* User List */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] text-[#9CA3AF]">
            <span className="font-mono tabular-nums text-[#F9FAFB]">{usersTotal}</span>
            {" users"}
          </span>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-2">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                selected={selectedUserId === user.id}
                onClick={() => handleSelectUser(user.id)}
              />
            ))}
            {users.length === 0 && !usersLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                <Users className="h-6 w-6 mb-2 opacity-30" />
                <span className="text-xs">No users found</span>
              </div>
            )}
            {usersLoading && users.length > 0 && (
              <div className="text-center py-4 text-[10px] text-[#9CA3AF]">Loading...</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* RIGHT PANE */}
      <div className="flex-1 flex flex-col min-h-0">
        <Tabs
          value={rightTab}
          onValueChange={handleTabChange}
          className="flex flex-col h-full min-h-0"
        >
          <TabsList
            variant="line"
            className="border-b border-white/5 w-full justify-start shrink-0"
          >
            <TabsTrigger value="user" className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]">
              User Detail
            </TabsTrigger>
            <TabsTrigger value="podcasts" className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]">
              Podcast Profiles
            </TabsTrigger>
            <TabsTrigger value="settings" className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]">
              Settings
            </TabsTrigger>
            <TabsTrigger value="embeddings" className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]">
              Embeddings
            </TabsTrigger>
            <TabsTrigger value="topics" className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]">
              Topics
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 mt-4">
            <TabsContent value="user" className="h-full">
              {detailLoading || userDetail ? (
                <ScrollArea className="h-full">
                  <div className="pr-2 pb-4">
                    <UserDetailPanel
                      detail={userDetail}
                      loading={detailLoading}
                      onRecompute={handleRecomputeUser}
                      recomputing={recomputingUser}
                    />
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-[#9CA3AF]">
                  <Sparkles className="h-10 w-10 mb-3 opacity-20" />
                  <span className="text-sm">Select a user to view recommendation details</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="podcasts" className="h-full">
              <ScrollArea className="h-full">
                <div className="pr-2 pb-4">
                  <PodcastProfilesTab
                    profiles={podcastProfiles}
                    loading={podcastProfilesLoading}
                    total={podcastProfilesTotal}
                  />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="settings" className="h-full">
              <ScrollArea className="h-full">
                <div className="pr-2 pb-4">
                  <SettingsTab apiFetch={apiFetch} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="embeddings" className="h-full">
              <ScrollArea className="h-full">
                <div className="pr-2 pb-4">
                  <EmbeddingsTab apiFetch={apiFetch} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="topics" className="h-full">
              <ScrollArea className="h-full">
                <div className="pr-2 pb-4">
                  <TopicsTab apiFetch={apiFetch} />
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
