import Link from "next/link";

export function PaymentBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-red-50 px-4 py-2 text-sm text-red-800 border-b border-red-200">
      <span>Your last payment failed.</span>
      <Link
        href="/billing"
        className="font-medium underline hover:text-red-900"
      >
        Update payment method
      </Link>
    </div>
  );
}
