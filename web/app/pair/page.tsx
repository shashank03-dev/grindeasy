import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { claimPairRequest, findLivePairRequest } from "@/lib/db/queries";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function approve(formData: FormData) {
  "use server";
  const code = String(formData.get("code") ?? "");
  const user = await currentUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/pair?code=${code}`)}`);

  const claimed = await claimPairRequest(getDb(), code, user.id);
  redirect(claimed ? "/pair/done" : `/pair?code=${encodeURIComponent(code)}&error=1`);
}

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code = "", error } = await searchParams;

  if (!code) {
    return <Notice title="No pairing code">Start pairing from your terminal with `grindboard login`.</Notice>;
  }

  const user = await currentUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/pair?code=${code}`)}`);
  }

  const request = await findLivePairRequest(getDb(), code);
  if (!request) {
    return (
      <Notice title="That code expired">
        Pairing codes last ten minutes. Run `grindboard login` again to get a fresh one.
      </Notice>
    );
  }
  if (request.userId !== null) {
    return <Notice title="Already authorized">This device has already been paired.</Notice>;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold">Authorize this device</h1>
        <p className="mt-2 text-sm text-neutral-400">
          Signed in as <span className="text-neutral-200">{user.username}</span>. Confirm the code
          shown in your terminal matches.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-6 py-5 text-center font-mono text-3xl tracking-[0.2em]">
        {code.toUpperCase()}
      </div>

      {error ? (
        <p className="text-sm text-red-400">That code could not be claimed. It may have expired.</p>
      ) : null}

      <form action={approve}>
        <input type="hidden" name="code" value={code} />
        <button
          type="submit"
          className="w-full rounded-md bg-white px-4 py-2.5 font-medium text-black transition hover:bg-neutral-200"
        >
          Authorize
        </button>
      </form>

      <p className="text-xs text-neutral-500">
        Only authorize a code you started yourself. Authorizing lets that machine report your
        coding time to the leaderboard.
      </p>
    </main>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-neutral-400">{children}</p>
    </main>
  );
}
