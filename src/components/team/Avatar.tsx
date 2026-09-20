import Image from "next/image";

const PALETTE = ["#0e173f", "#981c21", "#7c3aed", "#0f766e", "#b45309", "#1d4ed8", "#a21caf"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const SIZES = { xs: 24, sm: 32, md: 40 } as const;

export default function Avatar({
  name,
  avatarUrl,
  size = "sm",
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={px}
        height={px}
        unoptimized
        className={`flex-none rounded-full border border-hairline-strong object-cover ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      title={name}
      className={`flex flex-none items-center justify-center rounded-full border border-hairline-strong font-display font-bold text-white ${className}`}
      style={{ width: px, height: px, backgroundColor: colorFor(name), fontSize: px * 0.4 }}
    >
      {initials(name)}
    </div>
  );
}
