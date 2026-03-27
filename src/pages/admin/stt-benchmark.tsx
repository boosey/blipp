import { useState } from "react";
import { ExperimentsList } from "@/components/admin/stt-benchmark/experiments-list";
import { ExperimentSetupDialog } from "@/components/admin/stt-benchmark/experiment-setup-dialog";
import { ResultsDashboard } from "@/components/admin/stt-benchmark/results-dashboard";
import type { SttExperiment } from "@/types/admin";

type View =
  | { type: "list" }
  | { type: "results"; experiment: SttExperiment };

export default function SttBenchmark() {
  const [view, setView] = useState<View>({ type: "list" });
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <div className="space-y-6">
      {view.type === "list" && (
        <>
          <ExperimentsList
            onSelect={(exp) => setView({ type: "results", experiment: exp })}
            onNewExperiment={() => setSetupOpen(true)}
          />
          <ExperimentSetupDialog
            open={setupOpen}
            onOpenChange={setSetupOpen}
            onCreated={(exp) => setView({ type: "results", experiment: exp })}
          />
        </>
      )}

      {view.type === "results" && (
        <ResultsDashboard
          experiment={view.experiment}
          onBack={() => setView({ type: "list" })}
        />
      )}
    </div>
  );
}
