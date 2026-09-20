import JSZip from "jszip";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";

/** Bundles every uploaded file on a subsystem's 3D-print BOM lines into one ZIP. */
export async function GET(_req: Request, { params }: { params: Promise<{ subsystemId: string }> }) {
  const { subsystemId } = await params;

  const profile = await getCurrentProfile();
  if (!profile) return new Response("Unauthorized", { status: 401 });

  const supabase = await createServerClient();
  const { data: subsystem } = await supabase
    .from("subsystems")
    .select("id, name")
    .eq("id", subsystemId)
    .maybeSingle();
  if (!subsystem) return new Response("Not found", { status: 404 });

  const { data: lines } = await supabase
    .from("bom_lines")
    .select("id, name")
    .eq("subsystem_id", subsystemId)
    .eq("category", "3d_print");
  const lineIds = (lines ?? []).map((l) => l.id);
  if (lineIds.length === 0) return new Response("No 3D-print parts in this subsystem.", { status: 404 });

  const nameByLine = new Map((lines ?? []).map((l) => [l.id, l.name]));
  const { data: files } = await supabase
    .from("bom_line_files")
    .select("bom_line_id, url, filename")
    .in("bom_line_id", lineIds);
  if (!files || files.length === 0) return new Response("No files uploaded yet.", { status: 404 });

  const zip = new JSZip();
  let added = 0;
  for (const f of files) {
    try {
      const res = await fetch(f.url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const folder = (nameByLine.get(f.bom_line_id) ?? "part").replace(/[^a-z0-9 _-]+/gi, "").trim() || "part";
      zip.file(`${folder}/${f.filename}`, buf);
      added++;
    } catch {
      // skip an unreachable file rather than failing the whole ZIP
    }
  }
  if (added === 0) return new Response("Couldn't fetch any files.", { status: 502 });

  const content = await zip.generateAsync({ type: "arraybuffer" });
  const safeName = subsystem.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "subsystem";
  return new Response(content, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}-3dp.zip"`,
    },
  });
}
