import { PageHead } from "@/components/reckon/page-head";
import { requireSurface } from "@/lib/auth";
import { getErpCodesViewAction } from "./actions";
import { ErpCodesClient } from "./erp-codes-client";

export default async function ErpCodesPage({
  searchParams,
}: {
  searchParams: Promise<{ codeSet?: string }>;
}) {
  await requireSurface("finance");
  const view = await getErpCodesViewAction((await searchParams).codeSet);
  return (
    <div>
      <PageHead
        title="ERP codes & mapping"
        sub="Upload your real chart of accounts / dimension codes and map Reckon's values to them, so exports carry your system's real codes. Upload only — no connection, no credentials."
      />
      <ErpCodesClient view={view} />
    </div>
  );
}
