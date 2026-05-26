import { getDevelopersWithStats } from "./actions";
import { DevelopersList } from "./developers-list";

export default async function DevelopersPage() {
  const developers = await getDevelopersWithStats();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Developers</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage developers whose AI spend you track.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <DevelopersList developers={developers} />
      </div>
    </div>
  );
}
