import { useCallback, useMemo, useState } from "react";
import { DEMO_COLUMNS } from "./demo/generateRows";
import { InMemorySource } from "./demo/InMemorySource";
import { Processing } from "./screens/Processing";
import { Review } from "./screens/Review";
import { Upload } from "./screens/Upload";
import { Sheet } from "./sheet/Sheet";

type Stage =
  | { name: "upload" }
  | { name: "processing"; importId: number; jobId: number }
  | { name: "review"; importId: number }
  | { name: "demo" };

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: "upload" });

  const onUploaded = useCallback((importId: number, jobId: number | null) => {
    setStage(
      jobId === null
        ? { name: "review", importId }
        : { name: "processing", importId, jobId },
    );
  }, []);

  if (stage.name === "upload") {
    return (
      <Upload onUploaded={onUploaded} onDemo={() => setStage({ name: "demo" })} />
    );
  }

  if (stage.name === "processing") {
    return (
      <Processing
        importId={stage.importId}
        jobId={stage.jobId}
        onDone={() => setStage({ name: "review", importId: stage.importId })}
      />
    );
  }

  if (stage.name === "review") {
    return (
      <Review
        importId={stage.importId}
        onDone={() => setStage({ name: "upload" })}
      />
    );
  }

  return <Demo onBack={() => setStage({ name: "upload" })} />;
}

function Demo({ onBack }: { onBack: () => void }) {
  // Memoised because a new source each render would look like a new dataset and
  // wipe the row cache continuously.
  const dataSource = useMemo(() => new InMemorySource(500_000), []);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-baseline gap-3">
        <h1 className="font-semibold text-slate-800">500,000 row demo</h1>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-sky-600 underline underline-offset-2"
        >
          back to upload
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Sheet dataSource={dataSource} columns={DEMO_COLUMNS} />
      </div>
    </div>
  );
}
