import { getState, setState } from "../store/index.js";
import { money, datetimeFmt, escapeHtml, uid } from "../lib/format.js";
import { openModal, toast } from "../lib/ui.js";

export function renderCaja() {
  const s = getState();
  const inflows = s.cashMovements.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0);
  const outflows = s.cashMovements.filter((m) => m.amount < 0).reduce((a, m) => a + m.amount, 0);
  const theoretical = s.cashMovements.reduce((a, m) => a + m.amount, 0);

  return `
    <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-extrabold">Caja y turno</h1>
        <p class="text-sm text-stone-500">Apertura, entradas/salidas de efectivo, corte ciego y cierre Z.</p>
      </div>
      <div class="flex gap-2">
        <button id="btn-payout" class="btn-secondary" type="button">Salida de efectivo</button>
        <button id="btn-z" class="btn-primary" type="button">Cierre Z (ciego)</button>
      </div>
    </div>
    <div class="grid gap-4 sm:grid-cols-3">
      <article class="card"><p class="text-xs uppercase text-stone-500">Entradas</p><p class="font-display text-2xl font-extrabold">${money(inflows)}</p></article>
      <article class="card"><p class="text-xs uppercase text-stone-500">Salidas</p><p class="font-display text-2xl font-extrabold">${money(outflows)}</p></article>
      <article class="card"><p class="text-xs uppercase text-stone-500">Teórico en caja</p><p class="font-display text-2xl font-extrabold">${money(theoretical)}</p></article>
    </div>
    <div class="card mt-4 overflow-x-auto p-0">
      <table class="data">
        <thead><tr><th>Hora</th><th>Tipo</th><th>Motivo</th><th class="text-right">Monto</th></tr></thead>
        <tbody>
          ${[...s.cashMovements]
            .reverse()
            .map(
              (m) => `<tr>
              <td>${datetimeFmt(m.at)}</td>
              <td>${m.kind}</td>
              <td>${escapeHtml(m.reason)}</td>
              <td class="text-right font-semibold ${m.amount < 0 ? "text-red-600" : ""}">${money(m.amount)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

export function bindCaja() {
  document.getElementById("btn-payout")?.addEventListener("click", () => {
    const modal = openModal({
      title: "Salida de efectivo / caja chica",
      body: `
        <label class="label">Monto</label>
        <input id="pay-amt" class="field" type="number" min="0.01" step="0.01" />
        <label class="label mt-3">Motivo</label>
        <input id="pay-reason" class="field" placeholder="Retiro a bóveda, gasto menor…" />`,
      footer: `<button data-close class="btn-secondary" type="button">Cancelar</button>
               <button id="pay-ok" class="btn-primary" type="button">Registrar</button>`,
    });
    modal.root.querySelector("#pay-ok").addEventListener("click", () => {
      const amount = Number(modal.root.querySelector("#pay-amt").value);
      const reason = modal.root.querySelector("#pay-reason").value.trim() || "Salida de caja";
      if (!amount) {
        toast("Indique un monto", "warn");
        return;
      }
      setState((st) => {
        st.cashMovements.push({
          id: uid("m"),
          kind: "PETTY",
          amount: -Math.abs(amount),
          at: new Date().toISOString(),
          reason,
        });
      });
      modal.close();
      toast("Salida registrada");
      window.dispatchEvent(new CustomEvent("store:change"));
    });
  });

  document.getElementById("btn-z")?.addEventListener("click", () => {
    const theoretical = getState().cashMovements.reduce((a, m) => a + m.amount, 0);
    const modal = openModal({
      title: "Corte ciego — Cierre Z",
      body: `<p class="mb-3 text-sm text-stone-600">Declare el efectivo contado <strong>sin ver el teórico</strong>.</p>
        <label class="label">Efectivo declarado</label>
        <input id="z-amt" class="field" type="number" min="0" step="0.01" />`,
      footer: `<button data-close class="btn-secondary" type="button">Cancelar</button>
               <button id="z-ok" class="btn-primary" type="button">Cerrar turno</button>`,
    });
    modal.root.querySelector("#z-ok").addEventListener("click", () => {
      const declared = Number(modal.root.querySelector("#z-amt").value);
      const diff = declared - theoretical;
      setState((st) => {
        st.session.shiftOpen = false;
        st.cashMovements.push({
          id: uid("m"),
          kind: "Z_CLOSE",
          amount: 0,
          at: new Date().toISOString(),
          reason: `Cierre Z declarado ${declared} · diferencia ${diff.toFixed(2)}`,
        });
      });
      modal.close();
      toast(`Turno cerrado. Diferencia ${money(diff)}`, diff ? "warn" : "ok");
      window.dispatchEvent(new CustomEvent("store:change"));
    });
  });
}
