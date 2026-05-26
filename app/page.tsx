import {
  SignInButton,
  SignUpButton,
  Show,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-semibold tracking-tight">Reckon</span>
        <nav className="flex items-center gap-4">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="text-sm text-zinc-600 hover:text-zinc-900">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              Dashboard
            </Link>
            <UserButton />
          </Show>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
            Know exactly what your team spends on AI.
          </h1>
          <p className="mt-4 text-lg text-zinc-600">
            Per-developer attribution for Anthropic, OpenAI, and Copilot.
            Anomaly alerts in Slack. No proxy required.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Show when="signed-out">
              <SignUpButton mode="modal">
                <button className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800">
                  Start free
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Go to dashboard
              </Link>
            </Show>
          </div>
        </div>
      </main>
    </div>
  );
}
