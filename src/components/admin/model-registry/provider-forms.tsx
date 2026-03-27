import { useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminFetch } from "@/lib/admin-api";
import type { AiModelProviderEntry } from "@/types/admin";
import { buildLimitsPayload, extractLimitValue } from "./helpers";
import { LimitInput } from "./limit-input";

export interface AddProviderFormProps {
  modelId: string;
  stage: string;
  apiFetch: ReturnType<typeof useAdminFetch>;
  onDone: () => void;
  onCancel: () => void;
}

export function AddProviderForm({ modelId, stage, apiFetch, onDone, onCancel }: AddProviderFormProps) {
  const [provider, setProvider] = useState("");
  const [providerLabel, setProviderLabel] = useState("");
  const [pricePerMinute, setPricePerMinute] = useState("");
  const [priceInputPerMToken, setPriceInputPerMToken] = useState("");
  const [priceOutputPerMToken, setPriceOutputPerMToken] = useState("");
  const [pricePerKChars, setPricePerKChars] = useState("");
  const [limitValue, setLimitValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!provider || !providerLabel) return;
    setSaving(true);
    try {
      await apiFetch(`/ai-models/${modelId}/providers`, {
        method: "POST",
        body: JSON.stringify({
          provider,
          providerLabel,
          ...(pricePerMinute && { pricePerMinute: parseFloat(pricePerMinute) }),
          ...(priceInputPerMToken && { priceInputPerMToken: parseFloat(priceInputPerMToken) }),
          ...(priceOutputPerMToken && { priceOutputPerMToken: parseFloat(priceOutputPerMToken) }),
          ...(pricePerKChars && { pricePerKChars: parseFloat(pricePerKChars) }),
          ...({ limits: buildLimitsPayload(stage, limitValue) ?? null }),
        }),
      });
      onDone();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#1A2942]/50 border border-white/5 rounded p-3 mt-2 space-y-2">
      <div className="text-xs font-medium text-[#F9FAFB]">Add Provider</div>
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="Provider key" value={provider} onChange={(e) => setProvider(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
        <Input placeholder="Display name" value={providerLabel} onChange={(e) => setProviderLabel(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
        <Input placeholder="$/min" value={pricePerMinute} onChange={(e) => setPricePerMinute(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="$/1M input tok" value={priceInputPerMToken} onChange={(e) => setPriceInputPerMToken(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
        <Input placeholder="$/1M output tok" value={priceOutputPerMToken} onChange={(e) => setPriceOutputPerMToken(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
        <Input placeholder="$/1K chars" value={pricePerKChars} onChange={(e) => setPricePerKChars(e.target.value)} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
      </div>
      {(stage === "stt" || stage === "tts") && (
        <LimitInput stage={stage} value={limitValue} onChange={setLimitValue} className="h-7 text-[11px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !provider || !providerLabel} className="bg-[#3B82F6] hover:bg-[#3B82F6]/80 text-white text-[11px] h-7">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="text-[#9CA3AF] text-[11px] h-7">Cancel</Button>
      </div>
    </div>
  );
}

export interface EditProviderFormProps {
  provider: AiModelProviderEntry;
  modelId: string;
  stage: string;
  apiFetch: ReturnType<typeof useAdminFetch>;
  onDone: () => void;
  onCancel: () => void;
}

export function EditProviderForm({ provider, modelId, stage, apiFetch, onDone, onCancel }: EditProviderFormProps) {
  const [pricePerMinute, setPricePerMinute] = useState(provider.pricePerMinute?.toString() ?? "");
  const [priceInputPerMToken, setPriceInputPerMToken] = useState(provider.priceInputPerMToken?.toString() ?? "");
  const [priceOutputPerMToken, setPriceOutputPerMToken] = useState(provider.priceOutputPerMToken?.toString() ?? "");
  const [pricePerKChars, setPricePerKChars] = useState(provider.pricePerKChars?.toString() ?? "");
  const [limitValue, setLimitValue] = useState(extractLimitValue(stage, provider.limits));
  const [saving, setSaving] = useState(false);

  const hasLimitField = stage === "stt" || stage === "tts";

  const submit = async () => {
    setSaving(true);
    try {
      await apiFetch(`/ai-models/${modelId}/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(pricePerMinute ? { pricePerMinute: parseFloat(pricePerMinute) } : { pricePerMinute: null }),
          ...(priceInputPerMToken ? { priceInputPerMToken: parseFloat(priceInputPerMToken) } : { priceInputPerMToken: null }),
          ...(priceOutputPerMToken ? { priceOutputPerMToken: parseFloat(priceOutputPerMToken) } : { priceOutputPerMToken: null }),
          ...(pricePerKChars ? { pricePerKChars: parseFloat(pricePerKChars) } : { pricePerKChars: null }),
          ...(hasLimitField && { limits: buildLimitsPayload(stage, limitValue) ?? null }),
        }),
      });
      onDone();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-4 py-2 items-center">
      <div className="text-xs text-[#F9FAFB]">{provider.providerLabel}</div>
      <div className="grid grid-cols-2 gap-1">
        {provider.pricePerMinute != null || (!provider.priceInputPerMToken && !provider.pricePerKChars) ? (
          <Input placeholder="$/min" value={pricePerMinute} onChange={(e) => setPricePerMinute(e.target.value)} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB] col-span-2" />
        ) : provider.priceInputPerMToken != null ? (
          <>
            <Input placeholder="$/1M in" value={priceInputPerMToken} onChange={(e) => setPriceInputPerMToken(e.target.value)} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
            <Input placeholder="$/1M out" value={priceOutputPerMToken} onChange={(e) => setPriceOutputPerMToken(e.target.value)} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
          </>
        ) : (
          <Input placeholder="$/1K chars" value={pricePerKChars} onChange={(e) => setPricePerKChars(e.target.value)} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB] col-span-2" />
        )}
      </div>
      {hasLimitField ? (
        <LimitInput stage={stage} value={limitValue} onChange={setLimitValue} className="h-6 text-[10px] bg-[#0F1D32] border-white/10 text-[#F9FAFB]" />
      ) : (
        <div />
      )}
      <div />
      <div className="w-16 flex justify-end gap-1">
        <Button variant="ghost" size="icon-xs" onClick={submit} disabled={saving} className="text-[#22C55E] hover:text-[#22C55E]">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onCancel} className="text-[#9CA3AF] hover:text-[#F9FAFB]">
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
