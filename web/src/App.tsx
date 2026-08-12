import { useMemo } from "react";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { DEMO_COLUMNS } from "./demo/generateRows";
import { InMemorySource } from "./demo/InMemorySource";
import { Imports } from "./screens/Imports";
import { Landing } from "./screens/Landing";
import { Processing } from "./screens/Processing";
import { Review } from "./screens/Review";
import { Sheet } from "./sheet/Sheet";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingRoute />} />
        <Route path="/imports" element={<ImportsRoute />} />
        <Route path="/imports/:id" element={<ReviewRoute />} />
        <Route path="/imports/:id/processing" element={<ProcessingRoute />} />
        <Route path="/demo" element={<DemoRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

function LandingRoute() {
  const navigate = useNavigate();
  return (
    <Landing
      onUploaded={(importId, jobId) =>
        navigate(
          jobId === null
            ? `/imports/${importId}`
            : `/imports/${importId}/processing?job=${jobId}`,
        )
      }
    />
  );
}

function ImportsRoute() {
  const navigate = useNavigate();
  return <Imports onOpen={(id) => navigate(`/imports/${id}`)} />;
}

function ReviewRoute() {
  const { id } = useParams();
  const navigate = useNavigate();
  const importId = Number(id);
  if (!Number.isFinite(importId)) return <Navigate to="/imports" replace />;
  return (
    <Review
      importId={importId}
      onDone={(to) => navigate(to === "upload" ? "/" : "/imports")}
    />
  );
}

function ProcessingRoute() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const importId = Number(id);
  const jobId = Number(params.get("job"));
  if (!Number.isFinite(importId) || !Number.isFinite(jobId)) {
    return <Navigate to="/imports" replace />;
  }
  return (
    <Processing
      importId={importId}
      jobId={jobId}
      onDone={() => navigate(`/imports/${importId}`, { replace: true })}
      onCancel={() => navigate("/imports")}
    />
  );
}

function DemoRoute() {
  const navigate = useNavigate();
  const dataSource = useMemo(() => new InMemorySource(500_000), []);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-baseline gap-3">
        <h1 className="font-semibold text-slate-900">500,000 row demo</h1>
        <p className="text-sm text-slate-500">
          Generated in the browser. Select a range, paste, and undo with ⌘Z.
        </p>
        <button
          type="button"
          onClick={() => navigate("/")}
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
