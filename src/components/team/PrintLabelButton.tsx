"use client";

export default function PrintLabelButton({ name, partNumber }: { name: string; partNumber?: string | null }) {
  function handlePrint() {
    const win = window.open("", "_blank", "width=400,height=300");
    if (!win) return;

    win.document.title = `Label — ${name}`;
    const style = win.document.createElement("style");
    // Longer names shrink to fit instead of getting cut off; short names stay large and readable.
    const fontSize = name.length > 40 ? 9 : name.length > 28 ? 10.5 : name.length > 18 ? 12 : 14;
    style.textContent =
      "@page{size:2in 1in;margin:0} body{margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;height:1in;width:2in;font-family:sans-serif;overflow:hidden}" +
      `p.name{margin:0;font-size:${fontSize}px;line-height:1.15;font-weight:700;text-align:center;max-width:1.9in;overflow-wrap:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}` +
      "p.partNumber{margin:0;font-size:10px;color:#555;text-align:center}";
    win.document.head.appendChild(style);

    const nameEl = win.document.createElement("p");
    nameEl.className = "name";
    nameEl.textContent = name;
    win.document.body.appendChild(nameEl);

    if (partNumber) {
      const partNumberEl = win.document.createElement("p");
      partNumberEl.className = "partNumber";
      partNumberEl.textContent = `#${partNumber}`;
      win.document.body.appendChild(partNumberEl);
    }

    win.document.close();
    win.print();
    win.onafterprint = () => win.close();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="rounded-md border border-hairline-strong px-2.5 py-1 text-xs font-medium text-ink/60 transition hover:bg-tint"
    >
      Print label
    </button>
  );
}
