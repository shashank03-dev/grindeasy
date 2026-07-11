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
    return <Notice title="No pairing code">Start pairing from your terminal with `grindeasy login`.</Notice>;
  }

  const user = await currentUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/pair?code=${code}`)}`);
  }

  const request = await findLivePairRequest(getDb(), code);
  if (!request) {
    return (
      <Notice title="That code expired">
        Pairing codes last ten minutes. Run `grindeasy login` again to get a fresh one.
      </Notice>
    );
  }
  if (request.userId !== null) {
    return <Notice title="Already authorized">This device has already been paired.</Notice>;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span aria-hidden className="text-primary">▲</span> grindeasy
        </p>
        <h1 className="font-heading text-3xl font-normal tracking-[-0.01em] [font-optical-sizing:auto] [font-variation-settings:'opsz'_144]">
          Authorize this device
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="text-foreground">{user.username}</span>. Confirm the code
          shown in your terminal matches.
        </p>
      </div>

      <div className="rounded-lg border border-input bg-card px-6 py-5 text-center font-mono text-3xl tracking-[0.25em] text-foreground">
        {code.toUpperCase()}
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          That code could not be claimed. It may have expired.
        </p>
      ) : null}

      <form action={approve}>
        <input type="hidden" name="code" value={code} />
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground transition hover:opacity-90"
        >
          Authorize
        </button>
      </form>

      <p className="text-xs text-muted-foreground/70">
        Only authorize a code you started yourself. Authorizing lets that machine report your
        coding time to the leaderboard.
      </p>
    </main>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <span aria-hidden className="text-primary">▲</span> grindeasy
      </p>
      <h1 className="font-heading text-3xl font-normal tracking-[-0.01em] [font-optical-sizing:auto] [font-variation-settings:'opsz'_144]">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </main>
  );
}
