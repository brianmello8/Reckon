import { notFound } from "next/navigation";
import { getCurrentUser, hasSurface } from "@/lib/auth";

/**
 * Gate the Workflows surface. Auth/onboarding redirects are handled by the
 * parent (app) layout; here we 404 anyone without workflows access (e.g. an
 * operations-only member following a deep link).
 */
export default async function WorkflowsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || !hasSurface(user, "workflows")) notFound();
  return <>{children}</>;
}
