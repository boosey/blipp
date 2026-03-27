import { useState } from "react";
import { ExperimentsList } from "@/components/admin/claims-benchmark/experiments-list";
import { ExperimentSetupDialog } from "@/components/admin/claims-benchmark/experiment-setup-dialog";
import { ResultsDashboard } from "@/components/admin/claims-benchmark/results-dashboard";
import type { ClaimsExperiment } from "@/types/admin";

type View =
  | { type: "list" }
  | { type: "results"; experiment: ClaimsExperiment };

export default function ClaimsBenchmark() {
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
