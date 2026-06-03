import Link from "next/link";

/** Slim banner shown across the app during an active trial. */
export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  return (
    <div className="flex items-center justify-center gap-2 bg-brand-soft px-4 py-1.5 text-[12.5px] text-brand-ink">
      <span className="font-medium">
        {daysLeft === 0 ? "Last day of your free trial" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your free trial`}
      </span>
      <span className="text-ink-3">·</span>
      <Link href="/billing" className="font-medium underline underline-offset-2 hover:opacity-80">
        Subscribe
      </Link>
    </div>
  );
}
