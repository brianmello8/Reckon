import { getInviteData } from "./actions";
import { InviteForm } from "./invite-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getInviteData(token);

  if ("error" in data) {
    const messages: Record<string, string> = {
      invalid: "This invite link is invalid.",
      not_found: "This invite link was not found.",
      claimed: "This invite has already been used.",
      expired: "This invite link has expired. Ask your admin for a new one.",
    };

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-xl font-semibold">Invite unavailable</h1>
          <p className="mt-2 text-zinc-600">{data.error ? messages[data.error] : "Something went wrong."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi {data.developerName}
          </h1>
          <p className="mt-2 text-zinc-600">
            {data.orgName} is tracking AI spend with Reckon. Add your provider
            API keys below to get started.
          </p>
        </div>

        <InviteForm token={token} providers={data.providers} />
      </div>
    </div>
  );
}
