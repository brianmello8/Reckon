import { notFound } from "next/navigation";
import { getCurrentUser, hasSurface } from "@/lib/auth";

/** Gate the Finance surface (filled in Phase 9). 404 for members without access. */
export default async function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || !hasSurface(user, "finance")) notFound();
  return <>{children}</>;
}
