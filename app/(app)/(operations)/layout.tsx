import { notFound } from "next/navigation";
import { getCurrentUser, hasSurface } from "@/lib/auth";

/**
 * Gate the Operations surface. Auth/onboarding redirects are handled by the
 * parent (app) layout; here we 404 members without operations access (e.g. a
 * finance-only member following a deep link to /dashboard).
 */
export default async function OperationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || !hasSurface(user, "operations")) notFound();
  return <>{children}</>;
}
