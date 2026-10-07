import { SiteHeader } from "./site-header";

/**
 * The frame for the small, single-purpose pages a terminal sends you to —
 * pairing a device, connecting Slack — and for their results. One column,
 * vertically centred, in the same type and chrome as the rest of the site.
 */
export function NoticeShell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-28">
        <p className="label flex items-center gap-3 text-muted-foreground">
          <span aria-hidden className="h-px w-8 bg-signal" />
          {eyebrow}
        </p>
        <h1 className="display text-[clamp(2.6rem,9vw,3.8rem)] text-paper">{title}</h1>
        {children}
      </main>
    </>
  );
}

/** Body copy for a notice page. */
export function NoticeText({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-muted-foreground">{children}</p>;
}

/** Inline command, set in the mono data voice. */
export function Cmd({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[0.92em] text-paper">{children}</code>;
}
