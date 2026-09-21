import { getState, setState, CATEGORIES } from "../store/index.js";
import { money, dateFmt, escapeHtml, uid } from "../lib/format.js";
import { openModal, toast } from "../lib/ui.js";

export function renderGastos() {
  const s = getState();
  const monthTotal = s.expenses.reduce((a, e) => a + e.amount, 0);
  const pending = s.expenses.filter((e) => e.status === "pending");
  const pendingAmt = pending.reduce((a, e) => a + e.amount, 0);
  const byCat = CATEGORIES.map((c) => ({
    c,
    n: s.expenses.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0),
  })).filter((x) => x.n > 0);

  return `
    <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-extrabold">Gastos operativos</h1>
        <p class="text-sm text-stone-500">Renta, servicios, combustible y caja chica — independientes del costo de mercadería.</p>
      </div>
      <button id="btn-new-exp" class="btn-primary" type="button">Registrar gasto</button>
    </div>
    <div class="grid gap-4 sm:grid-cols-3">
      <article class="card">
        <p class="text-xs font-semibold uppercase tracking-wide text-stone-500">Acumulado (demo)</p>
        <p class="font-display text-2xl font-extrabold">${money(monthTotal)}</p>
      </article>
      <article class="card ring-1 ring-amber-200">
        <p class="text-xs font-semibold uppercase tracking-wide text-stone-500">Pendientes de pago</p>
        <p class="font-display text-2xl font-extrabold">${money(pendingAmt)}</p>
        <p class="text-sm text-stone-500">${pending.length} documentos</p>
      </article>
      <article class="card">
        <p class="text-xs font-semibold uppercase tracking-wide text-stone-500">Por categoría</p>
        <ul class="mt-2 space-y-1 text-sm">
          ${byCat.map((x) => `<li class="flex justify-between"><span>${x.c}</span><span class="font-semibold">${money(x.n)}</span></li>`).join("")}
        </ul>
      </article>
    </div>
    <div class="card mt-4 overflow-x-auto p-0">
      <table class="data">
        <thead>
          <tr>
            <th>Fecha</th><th>Categoría</th><th>Proveedor / beneficiario</th><th>Descripción</th>
            <th>Método</th><th>Monto</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${[...s.expenses]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((e) => {
              const vendor = s.suppliers.find((x) => x.id === e.vendorId);
              return `<tr>
                <td>${dateFmt(e.date)}</td>
                <td><span class="chip bg-stone-100">${e.category}</span></td>
                <td>${escapeHtml(vendor?.name || "—")}</td>
                <td>${escapeHtml(e.desc)}</td>
                <td>${e.method === "cash" ? "Efectivo" : e.method === "transfer" ? "Transferencia" : e.method}</td>
                <td class="font-semibold">${money(e.amount)}</td>
                <td>${e.status === "paid" ? `<span class="chip bg-emerald-50 text-emerald-700">Pagado</span>` : `<span class="chip bg-amber-100 text-amber-800">Pendiente</span>`}</td>
                <td class="space-x-2">
                  ${e.status === "pending" ? `<button data-pay="${e.id}" class="text-xs font-semibold text-amber-700" type="button">Marcar pagado</button>` : ""}
                  <button data-del-exp="${e.id}" class="text-xs font-semibold text-red-600" type="button">Anular</button>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

export function bindGastos() {
  document.getElementById("btn-new-exp")?.addEventListener("click", () => {
    const s = getState();
    const modal = openModal({
      title: "Nuevo gasto operativo",
      body: `
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Fecha</label>
            <input id="ex-date" class="field" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          </div>
          <div>
            <label class="label">Categoría</label>
            <select id="ex-cat" class="field">${CATEGORIES.map((c) => `<option>${c}</option>`).join("")}</select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Proveedor / beneficiario</label>
            <select id="ex-vendor" class="field">
              ${s.suppliers.map((v) => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join("")}
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Descripción</label>
            <input id="ex-desc" class="field" placeholder="Ej. energía eléctrica sucursal" />
          </div>
          <div>
            <label class="label">Monto GTQ</label>
            <input id="ex-amt" class="field" type="number" min="0.01" step="0.01" />
          </div>
          <div>
            <label class="label">Forma de pago</label>
            <select id="ex-method" class="field">
              <option value="cash">Efectivo (caja)</option>
              <option value="transfer">Transferencia / banco</option>
              <option value="card">Tarjeta corporativa</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="label">Estado</label>
            <select id="ex-status" class="field">
              <option value="paid">Pagado ahora</option>
              <option value="pending">Queda pendiente (cuenta por pagar)</option>
            </select>
          </div>
        </div>`,
      footer: `<button data-close class="btn-secondary" type="button">Cancelar</button>
               <button id="ex-ok" class="btn-primary" type="button">Guardar</button>`,
    });
    modal.root.querySelector("#ex-ok").addEventListener("click", () => {
      const amount = Number(modal.root.querySelector("#ex-amt").value);
      const desc = modal.root.querySelector("#ex-desc").value.trim();
      if (!amount || !desc) {
        toast("Descripción y monto son obligatorios", "warn");
        return;
      }
      const date = modal.root.querySelector("#ex-date").value;
      const category = modal.root.querySelector("#ex-cat").value;
      const vendorId = modal.root.querySelector("#ex-vendor").value;
      const method = modal.root.querySelector("#ex-method").value;
      const status = modal.root.querySelector("#ex-status").value;
      const vendor = getState().suppliers.find((x) => x.id === vendorId);
      setState((st) => {
        const id = uid("e");
        st.expenses.push({
          id,
          date: new Date(date).toISOString(),
          category,
          vendorId,
          desc,
          amount,
          method,
          status,
        });
        if (status === "paid" && method === "cash") {
          st.cashMovements.push({
            id: uid("m"),
            kind: "PETTY",
            amount: -amount,
            at: new Date().toISOString(),
            reason: `Gasto: ${desc}`,
          });
        }
        if (status === "pending") {
          const due = new Date(date);
          due.setDate(due.getDate() + 7);
          st.payables.push({
            id: uid("ap"),
            type: "expense",
            party: vendor?.name || "Gasto",
            ref: id.toUpperCase(),
            issue: new Date(date).toISOString(),
            due: due.toISOString(),
            amount,
            paid: 0,
            notes: desc,
            expenseId: id,
          });
        }
      });
      modal.close();
      toast("Gasto registrado");
      window.dispatchEvent(new CustomEvent("store:change"));
    });
  });

  document.querySelectorAll("[data-pay]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-pay");
      setState((st) => {
        const e = st.expenses.find((x) => x.id === id);
        if (!e) return;
        e.status = "paid";
        const ap = st.payables.find((p) => p.expenseId === id || (p.notes === e.desc && p.amount === e.amount));
        if (ap) ap.paid = ap.amount;
        if (e.method === "cash") {
          st.cashMovements.push({
            id: uid("m"),
            kind: "PETTY",
            amount: -e.amount,
            at: new Date().toISOString(),
            reason: `Pago gasto: ${e.desc}`,
          });
        }
      });
      toast("Gasto marcado como pagado");
      window.dispatchEvent(new CustomEvent("store:change"));
    })
  );

  document.querySelectorAll("[data-del-exp]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del-exp");
      setState((st) => {
        st.expenses = st.expenses.filter((x) => x.id !== id);
        st.payables = st.payables.filter((p) => p.expenseId !== id);
      });
      toast("Gasto anulado", "warn");
      window.dispatchEvent(new CustomEvent("store:change"));
    })
  );
}
