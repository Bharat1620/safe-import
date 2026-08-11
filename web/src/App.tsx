import { useCallback, useMemo, useState } from "react";
import { DEMO_COLUMNS } from "./demo/generateRows";
import { InMemorySource } from "./demo/InMemorySource";
import { Imports } from "./screens/Imports";
import { Processing } from "./screens/Processing";
import { Review } from "./screens/Review";
import { Upload } from "./screens/Upload";
import { Sheet } from "./sheet/Sheet";

type Stage =
  | { name: "upload" }
  | { name: "imports" }
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
      <Upload
        onUploaded={onUploaded}
        onDemo={() => setStage({ name: "demo" })}
        onImports={() => setStage({ name: "imports" })}
      />
    );
  }

  if (stage.name === "imports") {
    return (
      <Imports
        onOpen={(importId) => setStage({ name: "review", importId })}
        onBack={() => setStage({ name: "upload" })}
      />
    );
  }

  if (stage.name === "processing") {
    return (
      <Processing
        importId={stage.importId}
        jobId={stage.jobId}
        onDone={() => setStage({ name: "review", importId: stage.importId })}
        onCancel={() => setStage({ name: "upload" })}
      />
    );
  }

  if (stage.name === "review") {
    return (
      <Review
        importId={stage.importId}
        onDone={() => setStage({ name: "imports" })}
      />
    );
  }

  return <Demo onBack={() => setStage({ name: "upload" })} />;
}

function Demo({ onBack }: { onBack: () => void }) {
  const dataSource = useMemo(() => new InMemorySource(500_000), []);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-baseline gap-3">
        <h1 className="font-semibold text-slate-800">500,000 row demo</h1>
        <p className="text-sm text-slate-500">
          Generated in the browser. Select a range, paste, and undo with ⌘Z.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="ml-auto text-sm text-sky-600 underline underline-offset-2"
        >
          Back
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Sheet dataSource={dataSource} columns={DEMO_COLUMNS} />
      </div>
    </div>
  );
}
