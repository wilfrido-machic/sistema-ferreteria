import { getState, setState } from "../store/index.js";
import { money, dateFmt, escapeHtml, uid } from "../lib/format.js";
import { toast } from "../lib/ui.js";

export function renderCotizaciones() {
  const s = getState();
  return `
    <div class="mb-5">
      <h1 class="font-display text-2xl font-extrabold">Cotizaciones</h1>
      <p class="text-sm text-stone-500">Convertir a venta en 1 clic recalcula stock y precio vigente.</p>
    </div>
    <div class="card overflow-x-auto p-0">
      <table class="data">
        <thead><tr><th>Número</th><th>Cliente</th><th>Total</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${s.quotes
            .map((q) => {
              const c = s.customers.find((x) => x.id === q.customerId);
              const converted = q.status === "converted";
              return `<tr>
                <td class="font-mono text-xs">${q.number}</td>
                <td>${escapeHtml(c?.name || "")}</td>
                <td>${money(q.total)}</td>
                <td>${dateFmt(q.validUntil)}</td>
                <td><span class="chip bg-stone-100">${q.status}</span></td>
                <td>${converted ? "" : `<button data-convert="${q.id}" class="btn-primary py-1 text-xs" type="button">Convertir a venta</button>`}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

export function bindCotizaciones() {
  document.querySelectorAll("[data-convert]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-convert");
      setState((st) => {
        const q = st.quotes.find((x) => x.id === id);
        if (!q || q.status === "converted") return;
        q.status = "converted";
        const number = `V-${1047 + st.sales.length}`;
        st.sales.push({
          id: uid("v"),
          number,
          at: new Date().toISOString(),
          total: q.total,
          fel: "pending_fel",
          pay: "cash",
          customerId: q.customerId,
        });
        q.convertedSaleId = number;
      });
      toast("Cotización convertida. Ticket interno generado.");
      window.dispatchEvent(new CustomEvent("store:change"));
    })
  );
}
