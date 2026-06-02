import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getExportViewAction } from "./actions";
import { ExportClient } from "./export-client";

export default async function ExportPage() {
  await requireSurface("finance");
  const view = await getExportViewAction();
  return (
    <div>
      <PageHead
        title="Export"
        sub="Turn approved journal entries into a GL-ready file you import into your own finance system. No credentials, no connection — Reckon generates the file, you import it. Every batch is deterministic and re-import-safe."
      />
      <ExportClient view={view} />
    </div>
  );
}
