import { getState, setState } from "../store/index.js";
import { money, datetimeFmt } from "../lib/format.js";
import { toast } from "../lib/ui.js";

export function renderFel() {
  const { sales } = getState();
  return `
    <div class="mb-5">
      <h1 class="font-display text-2xl font-extrabold">Documentos FEL</h1>
      <p class="text-sm text-stone-500">Cola asíncrona Infile · ticket interno no bloquea el mostrador.</p>
    </div>
    <div class="card overflow-x-auto p-0">
      <table class="data">
        <thead><tr><th>Interno</th><th>Fecha</th><th>Total</th><th>Pago</th><th>Estado FEL</th><th></th></tr></thead>
        <tbody>
          ${[...sales]
            .reverse()
            .map((v) => {
              const pending = v.fel === "pending_fel";
              return `<tr>
                <td class="font-mono text-xs">${v.number}</td>
                <td>${datetimeFmt(v.at)}</td>
                <td>${money(v.total)}</td>
                <td>${v.pay}</td>
                <td>${pending ? `<span class="chip bg-amber-100 text-amber-800">En cola</span>` : `<span class="chip bg-emerald-50 text-emerald-700">Certificado</span>`}</td>
                <td>${pending ? `<button data-cert="${v.id}" class="btn-secondary py-1 text-xs" type="button">Simular certificación</button>` : `<span class="font-mono text-[11px] text-stone-400">UUID demo</span>`}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

export function bindFel() {
  document.querySelectorAll("[data-cert]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-cert");
      setState((st) => {
        const v = st.sales.find((x) => x.id === id);
        if (v) v.fel = "certified";
      });
      toast("DTE certificado (simulación Infile)");
      window.dispatchEvent(new CustomEvent("store:change"));
    })
  );
}
