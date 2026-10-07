import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { claimPairRequest, findLivePairRequest } from "@/lib/db/queries";
import { currentUser } from "@/lib/session";
import { Cmd, NoticeShell, NoticeText } from "@/components/site/notice-shell";

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
    return (
      <Notice title="No pairing code">
        Start pairing from your terminal with <Cmd>grindeasy login</Cmd>.
      </Notice>
    );
  }

  const user = await currentUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/pair?code=${code}`)}`);
  }

  const request = await findLivePairRequest(getDb(), code);
  if (!request) {
    return (
      <Notice title="That code expired">
        Pairing codes last ten minutes. Run <Cmd>grindeasy login</Cmd> again to get a fresh one.
      </Notice>
    );
  }
  if (request.userId !== null) {
    return <Notice title="Already authorized">This device has already been paired.</Notice>;
  }

  return (
    <NoticeShell eyebrow="Pair a device" title="Authorize this device">
      <NoticeText>
        Signed in as <span className="text-paper">{user.username}</span>. Confirm the code shown in
        your terminal matches.
      </NoticeText>

      <div className="border border-input bg-card/80 px-6 py-6 text-center font-pixel text-[clamp(2.2rem,9vw,3.2rem)] leading-none tracking-[0.18em] text-paper">
        {code.toUpperCase()}
      </div>

      {error ? (
        <p className="font-mono text-[13px] text-destructive">
          That code could not be claimed. It may have expired.
        </p>
      ) : null}

      <form action={approve}>
        <input type="hidden" name="code" value={code} />
        <button type="submit" className="slab w-full justify-center">
          Authorize <span aria-hidden>→</span>
        </button>
      </form>

      <p className="text-xs leading-relaxed text-muted-foreground/80">
        Only authorize a code you started yourself. Authorizing lets that machine report your
        coding time to the leaderboard.
      </p>
    </NoticeShell>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <NoticeShell eyebrow="Pair a device" title={title}>
      <NoticeText>{children}</NoticeText>
    </NoticeShell>
  );
}
