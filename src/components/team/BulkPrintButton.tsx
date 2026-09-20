"use client";

export default function BulkPrintButton({ parts }: { parts: { name: string; partNumber?: string | null }[] }) {
  function handlePrint() {
    if (parts.length === 0) return;

    const win = window.open("", "_blank", "width=400,height=300");
    if (!win) return;

    win.document.title = `Labels — ${parts.length} parts`;
    const style = win.document.createElement("style");
    style.textContent =
      "@page{size:2in 1in;margin:0} body{margin:0} " +
      ".label{page-break-after:always;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;height:1in;width:2in;font-family:sans-serif;overflow:hidden} " +
      ".label:last-child{page-break-after:auto} " +
      ".label p.name{margin:0;line-height:1.15;font-weight:700;text-align:center;max-width:1.9in;overflow-wrap:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden} " +
      ".label p.partNumber{margin:0;font-size:10px;color:#555;text-align:center}";
    win.document.head.appendChild(style);

    for (const part of parts) {
      const label = win.document.createElement("div");
      label.className = "label";

      const fontSize = part.name.length > 40 ? 9 : part.name.length > 28 ? 10.5 : part.name.length > 18 ? 12 : 14;
      const nameEl = win.document.createElement("p");
      nameEl.className = "name";
      nameEl.textContent = part.name;
      nameEl.style.fontSize = `${fontSize}px`;
      label.appendChild(nameEl);

      if (part.partNumber) {
        const partNumberEl = win.document.createElement("p");
        partNumberEl.className = "partNumber";
        partNumberEl.textContent = `#${part.partNumber}`;
        label.appendChild(partNumberEl);
      }

      win.document.body.appendChild(label);
    }

    win.document.close();
    win.print();
    win.onafterprint = () => win.close();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-navy/90"
    >
      Print {parts.length} label{parts.length === 1 ? "" : "s"}
    </button>
  );
}
