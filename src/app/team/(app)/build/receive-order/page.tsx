import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import ReceiveOrderForm from "@/components/team/ReceiveOrderForm";

export default async function ReceiveOrderPage() {
  const supabase = await createServerClient();

  const [{ data: projects }, { data: subsystems }, { data: imports }] = await Promise.all([
    supabase.from("projects").select("id, name"),
    supabase.from("subsystems").select("id, name"),
    supabase
      .from("bom_imports")
      .select("id, project_id, subsystem_id, source, imported_at")
      .neq("source", "manual")
      .order("imported_at", { ascending: false }),
  ]);

  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const subsystemName = new Map((subsystems ?? []).map((s) => [s.id, s.name]));

  const projectOptions = (imports ?? []).map((imp) => {
    const proj = projectName.get(imp.project_id) ?? "Unknown project";
    const sub = imp.subsystem_id ? subsystemName.get(imp.subsystem_id) : null;
    return {
      projectId: imp.project_id,
      projectName: sub ? `${proj} — ${sub}` : proj,
      bomImportId: imp.id,
    };
  });

  return (
    <div>
      <Link href="/team/build" className="text-sm font-medium text-ink/50 hover:text-ink">
        ← Back to Build
      </Link>
      <h1 className="font-display mt-3 text-2xl font-bold text-ink">Receive a vendor order</h1>
      <p className="mt-1 text-sm text-ink/60">
        Upload a PDF (an order confirmation or invoice page) or a CSV — receiving the order is the confirmation, no
        scanning needed.
      </p>

      <div className="mt-6">
        <ReceiveOrderForm projectOptions={projectOptions} />
      </div>
    </div>
  );
}
