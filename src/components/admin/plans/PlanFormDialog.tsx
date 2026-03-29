import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { VoicePresetEntry } from "@/types/admin";
import type { PlanFormData } from "./helpers";

export interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  form: PlanFormData;
  setForm: (f: PlanFormData) => void;
  onSubmit: () => void;
  saving: boolean;
  voicePresets: VoicePresetEntry[];
}

export function PlanFormDialog({
  open,
  onOpenChange,
  title,
  form,
  setForm,
  onSubmit,
  saving,
  voicePresets,
}: PlanFormDialogProps) {
  const update = (patch: Partial<PlanFormData>) => setForm({ ...form, ...patch });

  const toggleVoicePreset = (id: string) => {
    const ids = form.allowedVoicePresetIds.includes(id)
      ? form.allowedVoicePresetIds.filter((v) => v !== id)
      : [...form.allowedVoicePresetIds, id];
    update({ allowedVoicePresetIds: ids });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB] max-w-5xl max-h-[94vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">{title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 overflow-y-auto">
          <div className="space-y-6 pb-4">
            {/* Identity */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">Identity</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Pro"
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Slug</Label>
                  <Input
                    value={form.slug}
                    onChange={(e) => update({ slug: e.target.value })}
                    placeholder="pro"
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB]"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-[#F9FAFB]">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Plan description..."
                  rows={2}
                  className="text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] resize-none"
                />
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Limits */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">Limits</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Briefings/week</Label>
                  <Input
                    type="number"
                    value={form.briefingsPerWeek}
                    onChange={(e) => update({ briefingsPerWeek: e.target.value })}
                    placeholder="Unlimited"
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                  <span className="text-xs text-[#9CA3AF]">Empty = unlimited</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Max duration (min)</Label>
                  <Input
                    type="number"
                    value={form.maxDurationMinutes}
                    onChange={(e) => update({ maxDurationMinutes: e.target.value })}
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Max podcasts</Label>
                  <Input
                    type="number"
                    value={form.maxPodcastSubscriptions}
                    onChange={(e) => update({ maxPodcastSubscriptions: e.target.value })}
                    placeholder="Unlimited"
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                  <span className="text-xs text-[#9CA3AF]">Empty = unlimited</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Past episodes</Label>
                  <Input
                    type="number"
                    value={form.pastEpisodesLimit}
                    onChange={(e) => update({ pastEpisodesLimit: e.target.value })}
                    placeholder="Unlimited"
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                  <span className="text-xs text-[#9CA3AF]">Empty = unlimited</span>
                </div>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Content Delivery */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">Content Delivery</span>
              <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                {([
                  ["transcriptAccess", "Transcript Access"],
                  ["dailyDigest", "Daily Digest"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-sm text-[#F9FAFB]">{label}</Label>
                    <Switch checked={form[key]} onCheckedChange={(v) => update({ [key]: v })} className="data-[state=checked]:bg-[#10B981]" />
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Pipeline & Processing */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">Pipeline & Processing</span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Concurrent jobs</Label>
                  <Input type="number" min={1} value={form.concurrentPipelineJobs} onChange={(e) => update({ concurrentPipelineJobs: e.target.value })} className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono" />
                </div>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Feature Flags */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">Feature Flags</span>
              <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                {([
                  ["adFree", "Ad-Free"],
                  ["priorityProcessing", "Priority Processing"],
                  ["earlyAccess", "Early Access"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-sm text-[#F9FAFB]">{label}</Label>
                    <Switch
                      checked={form[key]}
                      onCheckedChange={(v) => update({ [key]: v })}
                      className="data-[state=checked]:bg-[#10B981]"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Personalization */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">Personalization</span>
              <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                {([
                  ["offlineAccess", "Offline Access"],
                  ["publicSharing", "Public Sharing"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="text-sm text-[#F9FAFB]">{label}</Label>
                    <Switch checked={form[key]} onCheckedChange={(v) => update({ [key]: v })} className="data-[state=checked]:bg-[#10B981]" />
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Voice Presets */}
            {voicePresets.length > 0 && (
              <div className="space-y-3">
                <span className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">Voice Presets</span>
                <p className="text-xs text-[#9CA3AF]">Select which voice presets this plan grants access to.</p>
                <div className="grid grid-cols-2 gap-y-2 gap-x-6">
                  {voicePresets.map((vp) => (
                    <div key={vp.id} className="flex items-center justify-between">
                      <Label className="text-sm text-[#F9FAFB]">
                        {vp.name}
                        {vp.isSystem && <span className="text-xs text-[#9CA3AF] ml-1">(system)</span>}
                      </Label>
                      <Switch
                        checked={form.allowedVoicePresetIds.includes(vp.id)}
                        onCheckedChange={() => toggleVoicePreset(vp.id)}
                        className="data-[state=checked]:bg-[#10B981]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator className="bg-white/5" />

            {/* Billing */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">Billing</span>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Monthly price (cents)</Label>
                  <Input
                    type="number"
                    value={form.priceCentsMonthly}
                    onChange={(e) => update({ priceCentsMonthly: e.target.value })}
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Annual price (cents)</Label>
                  <Input
                    type="number"
                    value={form.priceCentsAnnual}
                    onChange={(e) => update({ priceCentsAnnual: e.target.value })}
                    placeholder="Optional"
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Trial days</Label>
                  <Input
                    type="number"
                    value={form.trialDays}
                    onChange={(e) => update({ trialDays: e.target.value })}
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
              </div>
            </div>

            <Separator className="bg-white/5" />

            {/* Display */}
            <div className="space-y-3">
              <span className="text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">Display</span>
              <div className="space-y-1.5">
                <Label className="text-sm text-[#F9FAFB]">Features (one per line)</Label>
                <Textarea
                  value={form.features}
                  onChange={(e) => update({ features: e.target.value })}
                  placeholder={"10 briefings per week\n5 minute maximum\nAd-free listening"}
                  rows={5}
                  className="text-xs bg-[#0A1628] border-white/5 text-[#F9FAFB] resize-y"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm text-[#F9FAFB]">Sort order</Label>
                  <Input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => update({ sortOrder: e.target.value })}
                    className="h-9 text-sm bg-[#0A1628] border-white/5 text-[#F9FAFB] font-mono"
                  />
                </div>
                <div className="flex items-center justify-between pt-5">
                  <Label className="text-sm text-[#F9FAFB]">Highlighted</Label>
                  <Switch
                    checked={form.highlighted}
                    onCheckedChange={(v) => update({ highlighted: v })}
                    className="data-[state=checked]:bg-[#F59E0B]"
                  />
                </div>
                <div className="flex items-center justify-between pt-5">
                  <Label className="text-sm text-[#F9FAFB]">Default plan</Label>
                  <Switch
                    checked={form.isDefault}
                    onCheckedChange={(v) => update({ isDefault: v })}
                    className="data-[state=checked]:bg-[#3B82F6]"
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="pt-3 border-t border-white/5">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[#9CA3AF]"
          >
            Cancel
          </Button>
          <Button
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white"
            disabled={saving || !form.name || !form.slug}
            onClick={onSubmit}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
