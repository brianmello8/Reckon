import { getDevelopersWithStats } from "./actions";
import { DevelopersList } from "./developers-list";
import { PageHead } from "@/components/reckon/page-head";

export default async function DevelopersPage() {
  const developers = await getDevelopersWithStats();

  return (
    <div>
      <PageHead
        title="Developers"
        sub="People whose AI spend you track, across every provider."
      />
      <DevelopersList developers={developers} />
    </div>
  );
}
