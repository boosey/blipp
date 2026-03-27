import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminFetch } from "@/lib/admin-api";
import { STAGE_LABELS } from "@/lib/ai-models";
import { STAGES } from "./helpers";

export interface AddModelFormProps {
  apiFetch: ReturnType<typeof useAdminFetch>;
  onDone: () => void;
  onCancel: () => void;
}

export function AddModelForm({ apiFetch, onDone, onCancel }: AddModelFormProps) {
  const [stage, setStage] = useState<string>("");
  const [modelId, setModelId] = useState("");
  const [label, setLabel] = useState("");
  const [developer, setDeveloper] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!stage || !modelId || !label || !developer) return;
    setSaving(true);
    try {
      await apiFetch("/ai-models", {
        method: "POST",
        body: JSON.stringify({ stage, modelId, label, developer }),
      });
      onDone();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#0F1D32] border border-white/10 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-[#F9FAFB]">Add New Model</h3>
      <div className="grid grid-cols-4 gap-3">
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent className="bg-[#1A2942] border-white/10 text-[#F9FAFB]">
            {STAGES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{STAGE_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Model ID (e.g. whisper-1)"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
        />
        <Input
          placeholder="Label (e.g. Whisper v1)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
        />
        <Input
          placeholder="Developer (e.g. openai)"
          value={developer}
          onChange={(e) => setDeveloper(e.target.value)}
          className="h-8 text-xs bg-[#1A2942] border-white/10 text-[#F9FAFB]"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !stage || !modelId || !label || !developer} className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-xs">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-[#9CA3AF] text-xs">Cancel</Button>
      </div>
    </div>
  );
}
