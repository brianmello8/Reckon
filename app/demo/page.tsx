import { DemoApp } from "@/components/reckon/demo-app";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Interactive demo",
  description:
    "Click through Reckon with sample data: per-developer AI spend, anomaly detection, and provider breakdowns.",
  path: "/demo",
});

export default function DemoPage() {
  return <DemoApp />;
}
