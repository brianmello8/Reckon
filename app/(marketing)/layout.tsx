import Link from "next/link";
import Image from "next/image";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/reckon/theme-toggle";
import { JsonLd } from "@/components/reckon/json-ld";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";

const orgLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/reckon-icon.png`,
  description: SITE_DESCRIPTION,
};

const siteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg-warm">
      <JsonLd data={orgLd} />
      <JsonLd data={siteLd} />
      <header
        className="sticky top-0 z-10 border-b border-line backdrop-blur"
        style={{ background: "color-mix(in oklab, var(--paper) 82%, transparent)" }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink">
            <Image
              src="/reckon-icon.png"
              alt="Reckon"
              width={28}
              height={28}
              className="rounded-md"
            />
            Reckon
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/demo" className="hidden text-ink-2 hover:text-ink sm:block">
              Demo
            </Link>
            <Link href="/pricing" className="hidden text-ink-2 hover:text-ink sm:block">
              Pricing
            </Link>
            <Link href="/security" className="hidden text-ink-2 hover:text-ink sm:block">
              Security
            </Link>
            <ThemeToggle />
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button className="text-ink-2 hover:text-ink">Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
                <button className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:opacity-90">
                  Start free
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:opacity-90"
              >
                Dashboard
              </Link>
              <UserButton />
            </Show>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-ink-3 sm:flex-row">
          <p>© {new Date().getFullYear()} Reckon. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/security" className="hover:text-ink">
              Security
            </Link>
            <a href="mailto:brianmello96@gmail.com" className="hover:text-ink">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
