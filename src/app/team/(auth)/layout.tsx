import Image from "next/image";
import Link from "next/link";
import { APP_NAME, TEAM_NAME } from "@/lib/brand";

export default function TeamAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-navy via-navy to-crimson">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <Image src="/logo.png" alt={TEAM_NAME} width={56} height={56} />
          <span className="flex flex-col gap-1 leading-none">
            <span className="font-display text-2xl font-bold uppercase tracking-tight text-white">
              {APP_NAME}
            </span>
            <span className="text-[11px] font-medium uppercase tracking-widest text-white/60">
              FRC {TEAM_NAME}
            </span>
          </span>
        </Link>

        <div className="w-full max-w-sm rounded-xl bg-surface p-8 shadow-2xl">{children}</div>
      </div>
    </div>
  );
}
