import type { Metadata } from "next";
import { DemoApp } from "@/components/reckon/demo-app";

export const metadata: Metadata = {
  title: "Reckon — Interactive demo",
  description:
    "Click through Reckon with sample data: per-developer AI spend, anomaly detection, and provider breakdowns.",
};

export default function DemoPage() {
  return <DemoApp />;
}
