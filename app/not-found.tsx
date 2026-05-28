import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <h1 className="text-6xl font-semibold text-zinc-900">404</h1>
      <p className="mt-4 text-lg text-zinc-600">Page not found.</p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Go home
      </Link>
    </div>
  );
}
