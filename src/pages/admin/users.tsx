import { useState, useEffect, useCallback } from "react";
import { Search, User, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAdminFetch } from "@/lib/admin-api";
import type {
  AdminUser,
  AdminUserDetail,
  UserSegment,
  UserSegmentCounts,
  PaginatedResponse,
} from "@/types/admin";
import { SEGMENT_FILTERS } from "@/components/admin/users/helpers";
import { UserRow } from "@/components/admin/users/user-row";
import { UserDetailHeader } from "@/components/admin/users/user-detail-header";
import { OverviewTab } from "@/components/admin/users/overview-tab";
import { FeedItemsTab } from "@/components/admin/users/feed-items-tab";
import { BillingTab } from "@/components/admin/users/billing-tab";
import { RecommendationsTab } from "@/components/admin/users/recommendations-tab";
import { UsersSkeleton } from "@/components/admin/users/users-skeleton";

export default function UsersPage() {
  const apiFetch = useAdminFetch();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [segmentCounts, setSegmentCounts] = useState<UserSegmentCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [segment, setSegment] = useState<UserSegment>("all");
  const [search, setSearch] = useState("");

  const loadSegments = useCallback(() => {
    apiFetch<{ data: UserSegmentCounts }>("/users/segments")
      .then((r) => setSegmentCounts(r.data))
      .catch(console.error);
  }, [apiFetch]);

  const loadUsers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("pageSize", "50");
    if (segment !== "all") params.set("segment", segment);
    if (search) params.set("search", search);
    apiFetch<PaginatedResponse<AdminUser>>(`/users?${params}`)
      .then((r) => setUsers(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, segment, search]);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const selectUser = useCallback(
    (id: string) => {
      setDetailLoading(true);
      apiFetch<{ data: AdminUserDetail }>(`/users/${id}`)
        .then((r) => setSelectedUser(r.data))
        .catch(console.error)
        .finally(() => setDetailLoading(false));
    },
    [apiFetch]
  );

  const handleUserUpdate = useCallback(() => {
    if (selectedUser) {
      selectUser(selectedUser.id);
      loadUsers();
      loadSegments();
    }
  }, [selectedUser, selectUser, loadUsers, loadSegments]);

  if (loading && users.length === 0) return <UsersSkeleton />;

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* ── LEFT: User List (40%) ── */}
      <div className="w-[40%] flex flex-col gap-3 min-h-0">
        {/* Segment Quick Filters */}
        <div className="flex flex-wrap gap-1.5">
          {SEGMENT_FILTERS.map((sf) => {
            const count = segmentCounts?.[sf.key] ?? 0;
            const isActive = segment === sf.key;
            const Icon = sf.icon;
            return (
              <button
                key={sf.key}
                onClick={() => setSegment(sf.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border",
                  isActive
                    ? "bg-[#3B82F6]/15 text-[#3B82F6] border-[#3B82F6]/30"
                    : "bg-white/5 text-[#9CA3AF] border-white/5 hover:border-white/10"
                )}
              >
                <Icon
                  className="h-3 w-3"
                  style={{ color: isActive ? "#3B82F6" : sf.color }}
                />
                {sf.label}
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    isActive ? "text-[#3B82F6]" : "text-[#9CA3AF]/60"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9CA3AF]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            className="h-8 pl-8 text-xs bg-[#1A2942] border-white/5 text-[#F9FAFB] placeholder:text-[#9CA3AF]/50"
          />
        </div>

        {/* User List */}
        <ScrollArea className="flex-1">
          <div className="space-y-2 pr-2">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                selected={selectedUser?.id === user.id}
                onClick={() => selectUser(user.id)}
              />
            ))}
            {users.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-16 text-[#9CA3AF]">
                <UserX className="h-6 w-6 mb-2 opacity-40" />
                <span className="text-xs">No users found</span>
              </div>
            )}
            {loading && users.length > 0 && (
              <div className="text-center py-4 text-[10px] text-[#9CA3AF]">Loading...</div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── RIGHT: User Detail (60%) ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {detailLoading && !selectedUser ? (
          <div className="flex-1 space-y-4">
            <Skeleton className="h-24 bg-white/5 rounded-lg" />
            <Skeleton className="h-10 bg-white/5 rounded-lg" />
            <Skeleton className="h-64 bg-white/5 rounded-lg" />
          </div>
        ) : selectedUser ? (
          <div className="flex flex-col gap-4 h-full min-h-0">
            <UserDetailHeader user={selectedUser} />

            {/* Tabs */}
            <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
              <TabsList
                variant="line"
                className="border-b border-white/5 w-full justify-start shrink-0"
              >
                <TabsTrigger
                  value="overview"
                  className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
                >
                  Activity
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
                >
                  Billing
                </TabsTrigger>
                <TabsTrigger
                  value="recs"
                  className="text-xs text-[#9CA3AF] data-[state=active]:text-[#F9FAFB]"
                >
                  Recs
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 min-h-0 mt-4">
                <ScrollArea className="h-full">
                  <TabsContent value="overview">
                    <OverviewTab user={selectedUser} />
                  </TabsContent>
                  <TabsContent value="activity">
                    <FeedItemsTab feedItems={selectedUser.recentFeedItems} />
                  </TabsContent>
                  <TabsContent value="billing">
                    <BillingTab user={selectedUser} onUpdate={handleUserUpdate} />
                  </TabsContent>
                  <TabsContent value="recs">
                    <RecommendationsTab userId={selectedUser.id} />
                  </TabsContent>
                </ScrollArea>
              </div>
            </Tabs>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF]">
            <User className="h-10 w-10 mb-3 opacity-20" />
            <span className="text-sm">Select a user to view details</span>
          </div>
        )}
      </div>
    </div>
  );
}
