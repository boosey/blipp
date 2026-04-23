import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useAdminFetch } from "@/lib/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AdminUserDetail } from "@/types/admin";
import {
  initials,
  initialsColor,
  statusDotClass,
  statusBadgeClass,
  planBadgeClass,
  userBadgeConfig,
  formatDate,
} from "./helpers";

export interface UserDetailHeaderProps {
  user: AdminUserDetail;
  onDeleted?: () => void;
}

export function UserDetailHeader({ user, onDeleted }: UserDetailHeaderProps) {
  const apiFetch = useAdminFetch();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [emailConfirm, setEmailConfirm] = useState("");
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const emailMatches = emailConfirm.trim().toLowerCase() === user.email.toLowerCase();
  const reasonValid = reason.trim().length >= 5;
  const canDelete = emailMatches && reasonValid && !deleting && !user.isAdmin;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/users/${user.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE", reason: reason.trim() }),
      });
      toast.success(`Deleted ${user.email}`);
      setDialogOpen(false);
      setEmailConfirm("");
      setReason("");
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg bg-[#1A2942] border border-white/5 p-3 md:p-4 shrink-0">
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 md:h-16 md:w-16 shrink-0">
          {user.imageUrl && <AvatarImage src={user.imageUrl} />}
          <AvatarFallback
            style={{
              backgroundColor: `${initialsColor(user.id)}20`,
              color: initialsColor(user.id),
            }}
            className="text-sm md:text-lg font-semibold"
          >
            {initials(user.name ?? undefined, user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm md:text-base font-semibold text-[#F9FAFB]">
              {user.name || user.email}
            </span>
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                statusDotClass(user.status)
              )}
            />
            <Badge
              className={cn("text-[9px] uppercase", planBadgeClass(user.plan.slug))}
            >
              {user.plan.name}
            </Badge>
            <Badge
              className={cn("text-[9px] uppercase", statusBadgeClass(user.status))}
            >
              {user.status}
            </Badge>
            {user.badges.map((b) => {
              const cfg = userBadgeConfig(b);
              return (
                <Badge
                  key={b}
                  className={cn("text-[8px] uppercase", cfg.class)}
                >
                  {cfg.label}
                </Badge>
              );
            })}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF] mt-0.5 flex-wrap">
            {user.name && <span className="truncate">{user.email}</span>}
            <span className="shrink-0">Joined {formatDate(user.createdAt)}</span>
          </div>
        </div>
        {!user.isAdmin && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            title="Delete this user's account"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        )}
      </div>

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEmailConfirm("");
            setReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              <span className="font-mono">{user.email}</span> and all of their
              data: briefings, subscriptions, feed items, push subscriptions,
              Clerk account, and Stripe customer. This cannot be undone. The
              action is audit-logged for compliance (GDPR / CCPA).
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#F9FAFB]">
                Type the user's email to confirm
              </label>
              <Input
                value={emailConfirm}
                onChange={(e) => setEmailConfirm(e.target.value)}
                placeholder={user.email}
                autoComplete="off"
                spellCheck={false}
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#F9FAFB]">
                Reason (for audit log)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. User requested deletion via support email on 2026-04-23"
                rows={3}
                className="w-full rounded-md border border-white/10 bg-[#0F1729] px-2.5 py-2 text-xs text-[#F9FAFB] placeholder:text-[#9CA3AF]/50 outline-none focus:border-[#3B82F6]/40"
              />
              {!reasonValid && reason.length > 0 && (
                <p className="text-[10px] text-red-400">
                  Reason must be at least 5 characters.
                </p>
              )}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={!canDelete}
              className="bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? "Deleting..." : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
