import { Input } from "@/components/ui/input";

export interface LimitInputProps {
  stage: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function LimitInput({ stage, value, onChange, className }: LimitInputProps) {
  if (stage === "stt") return <Input type="number" placeholder="Max file size (MB)" value={value} onChange={(e) => onChange(e.target.value)} className={className} />;
  if (stage === "tts") return <Input type="number" placeholder="Max input chars" value={value} onChange={(e) => onChange(e.target.value)} className={className} />;
  return null;
}
