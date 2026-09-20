import Image from "next/image";
import Link from "next/link";

export default function TeamAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-navy via-navy to-crimson">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <Image src="/logo.png" alt="Tech Titans 25783" width={48} height={48} />
          <span className="flex flex-col leading-none">
            <span className="font-display text-xl font-bold tracking-tight text-white">
              TECH TITANS
            </span>
            <span className="text-[11px] font-medium tracking-widest text-white/60">
              25783 · FRISCO ISD
            </span>
          </span>
        </Link>

        <div className="w-full max-w-sm rounded-xl bg-surface p-8 shadow-2xl">{children}</div>
      </div>
    </div>
  );
}
