import { getState, setState } from "../store/index.js";
import { money, dateFmt, escapeHtml, uid, agingBucket, daysOverdue } from "../lib/format.js";
import { openModal, toast } from "../lib/ui.js";

let tab = "cobrar";

function chipAging(due) {
  const b = agingBucket(due);
  const map = {
    vigente: "bg-emerald-50 text-emerald-700",
    "1-30": "bg-amber-100 text-amber-800",
    "31-60": "bg-orange-100 text-orange-800",
    "61-90": "bg-red-100 text-red-700",
    "90+": "bg-red-200 text-red-800",
  };
  return `<span class="chip ${map[b]}">${b === "vigente" ? "Vigente" : `${b} días`}</span>`;
}

export function renderCuentas() {
  const s = getState();
  const arOpen = s.receivables.filter((r) => r.paid < r.amount);
  const apOpen = s.payables.filter((r) => r.paid < r.amount);
  const arAmt = arOpen.reduce((a, r) => a + (r.amount - r.paid), 0);
  const apAmt = apOpen.reduce((a, r) => a + (r.amount - r.paid), 0);
  const arOver = arOpen.filter((r) => daysOverdue(r.due) > 0).reduce((a, r) => a + (r.amount - r.paid), 0);
  const apOver = apOpen.filter((r) => daysOverdue(r.due) > 0).reduce((a, r) => a + (r.amount - r.paid), 0);

  const rows =
    tab === "cobrar"
      ? arOpen
          .map((r) => {
            const c = s.customers.find((x) => x.id === r.customerId);
            const pend = r.amount - r.paid;
            return `<tr>
              <td>${escapeHtml(c?.name || "")}</td>
              <td class="font-mono text-xs">${r.ref}</td>
              <td>${dateFmt(r.issue)}</td>
              <td>${dateFmt(r.due)}</td>
              <td>${chipAging(r.due)}</td>
              <td>${money(pend)}</td>
              <td><button data-collect="${r.id}" class="btn-primary py-1 text-xs" type="button">Registrar cobro</button></td>
            </tr>`;
          })
          .join("")
      : apOpen
          .map((r) => {
            const pend = r.amount - r.paid;
            return `<tr>
              <td>${escapeHtml(r.party)}</td>
              <td class="font-mono text-xs">${r.ref}</td>
              <td>${dateFmt(r.issue)}</td>
              <td>${dateFmt(r.due)}</td>
              <td>${chipAging(r.due)}</td>
              <td>${money(pend)}</td>
              <td><button data-payap="${r.id}" class="btn-primary py-1 text-xs" type="button">Registrar pago</button></td>
            </tr>`;
          })
          .join("");

  return `
    <div class="mb-5">
      <h1 class="font-display text-2xl font-extrabold">Cuentas pendientes</h1>
      <p class="text-sm text-stone-500">Cobros a clientes a crédito y pagos a proveedores / gastos no liquidados. Antigüedad 30/60/90.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article class="card"><p class="text-xs uppercase text-stone-500">Por cobrar</p><p class="font-display text-2xl font-extrabold">${money(arAmt)}</p></article>
      <article class="card"><p class="text-xs uppercase text-stone-500">Por cobrar vencido</p><p class="font-display text-2xl font-extrabold text-red-700">${money(arOver)}</p></article>
      <article class="card"><p class="text-xs uppercase text-stone-500">Por pagar</p><p class="font-display text-2xl font-extrabold">${money(apAmt)}</p></article>
      <article class="card"><p class="text-xs uppercase text-stone-500">Por pagar vencido</p><p class="font-display text-2xl font-extrabold text-red-700">${money(apOver)}</p></article>
    </div>
    <div class="mt-5 flex gap-2">
      <button type="button" data-tab="cobrar" class="${tab === "cobrar" ? "btn-primary" : "btn-secondary"}">Por cobrar (${arOpen.length})</button>
      <button type="button" data-tab="pagar" class="${tab === "pagar" ? "btn-primary" : "btn-secondary"}">Por pagar (${apOpen.length})</button>
    </div>
    <div class="card mt-4 overflow-x-auto p-0">
      <table class="data">
        <thead>
          <tr>
            <th>${tab === "cobrar" ? "Cliente" : "Proveedor / beneficiario"}</th>
            <th>Documento</th><th>Emisión</th><th>Vence</th><th>Antigüedad</th><th>Saldo</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" class="py-8 text-center text-stone-500">No hay cuentas abiertas en esta bandeja.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

export function bindCuentas() {
  document.querySelectorAll("[data-tab]").forEach((btn) =>
    btn.addEventListener("click", () => {
      tab = btn.getAttribute("data-tab");
      window.dispatchEvent(new CustomEvent("store:change"));
    })
  );

  document.querySelectorAll("[data-collect]").forEach((btn) =>
    btn.addEventListener("click", () => paymentModal("collect", btn.getAttribute("data-collect")))
  );
  document.querySelectorAll("[data-payap]").forEach((btn) =>
    btn.addEventListener("click", () => paymentModal("pay", btn.getAttribute("data-payap")))
  );
}

function paymentModal(kind, id) {
  const s = getState();
  const row = kind === "collect" ? s.receivables.find((x) => x.id === id) : s.payables.find((x) => x.id === id);
  const pend = row.amount - row.paid;
  const modal = openModal({
    title: kind === "collect" ? "Registrar cobro" : "Registrar pago",
    body: `
      <p class="mb-3 text-sm text-stone-600">Saldo ${money(pend)} · ref. ${escapeHtml(row.ref)}</p>
      <label class="label">Monto a aplicar</label>
      <input id="pay-n" class="field" type="number" min="0.01" step="0.01" value="${pend.toFixed(2)}" />
      <label class="label mt-3">Medio</label>
      <select id="pay-m" class="field">
        <option value="cash">Efectivo</option>
        <option value="transfer">Transferencia</option>
        <option value="check">Cheque</option>
      </select>`,
    footer: `<button data-close class="btn-secondary" type="button">Cancelar</button>
             <button id="pay-go" class="btn-primary" type="button">Aplicar</button>`,
  });
  modal.root.querySelector("#pay-go").addEventListener("click", () => {
    const n = Number(modal.root.querySelector("#pay-n").value);
    const method = modal.root.querySelector("#pay-m").value;
    if (!n || n <= 0) {
      toast("Monto inválido", "warn");
      return;
    }
    const apply = Math.min(n, pend);
    setState((st) => {
      if (kind === "collect") {
        const r = st.receivables.find((x) => x.id === id);
        r.paid += apply;
        const c = st.customers.find((x) => x.id === r.customerId);
        if (c) c.balance = Math.max(0, c.balance - apply);
        if (method === "cash") {
          st.cashMovements.push({
            id: uid("m"),
            kind: "SALE_CASH",
            amount: apply,
            at: new Date().toISOString(),
            reason: `Cobro ${r.ref}`,
          });
        }
      } else {
        const r = st.payables.find((x) => x.id === id);
        r.paid += apply;
        if (r.expenseId) {
          const e = st.expenses.find((x) => x.id === r.expenseId);
          if (e && r.paid >= r.amount) e.status = "paid";
        }
        if (method === "cash") {
          st.cashMovements.push({
            id: uid("m"),
            kind: "PAYOUT",
            amount: -apply,
            at: new Date().toISOString(),
            reason: `Pago ${r.ref}`,
          });
        }
      }
    });
    modal.close();
    toast("Movimiento aplicado");
    window.dispatchEvent(new CustomEvent("store:change"));
  });
}
