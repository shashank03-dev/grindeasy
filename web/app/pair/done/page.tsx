import Link from "next/link";
import { NoticeShell, NoticeText } from "@/components/site/notice-shell";

export default function PairDonePage() {
  return (
    <NoticeShell eyebrow="Pair a device" title="Device paired">
      <NoticeText>
        Your terminal should pick this up within a few seconds and start syncing. You can close this
        tab.
      </NoticeText>
      <Link href="/leaderboard" className="bracket self-start">
        View the leaderboard
      </Link>
    </NoticeShell>
  );
}
