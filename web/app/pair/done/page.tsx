import Link from "next/link";

export default function PairDonePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Device paired</h1>
      <p className="text-sm text-neutral-400">
        Your terminal should pick this up within a few seconds and start syncing. You can close this
        tab.
      </p>
      <Link href="/" className="text-sm text-neutral-200 underline underline-offset-4">
        View the leaderboard
      </Link>
    </main>
  );
}
