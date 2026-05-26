"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { triggerOrgIngestion } from "./actions";

export function IngestNowButton() {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await triggerOrgIngestion();
        toast.success("Ingestion triggered for all active keys");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to trigger ingestion"
        );
      }
    });
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={pending}>
      <RefreshCw className={`mr-2 h-4 w-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Triggering..." : "Ingest now"}
    </Button>
  );
}
