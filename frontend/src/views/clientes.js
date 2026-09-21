import { getState } from "../store/index.js";
import { money, escapeHtml } from "../lib/format.js";

export function renderClientes() {
  const { customers } = getState();
  return `
    <div class="mb-5">
      <h1 class="font-display text-2xl font-extrabold">Clientes y crédito</h1>
      <p class="text-sm text-stone-500">Límite de endeudamiento para instaladores y constructoras.</p>
    </div>
    <div class="card overflow-x-auto p-0">
      <table class="data">
        <thead><tr><th>Nombre</th><th>NIT</th><th>Lista</th><th>Límite</th><th>Saldo</th><th>Disponible</th></tr></thead>
        <tbody>
          ${customers
            .map((c) => {
              const avail = c.credit ? c.limit - c.balance : 0;
              const over = c.credit && c.balance >= c.limit;
              return `<tr>
                <td class="font-medium">${escapeHtml(c.name)}</td>
                <td class="font-mono text-xs">${c.nit}</td>
                <td>${c.list}</td>
                <td>${c.credit ? money(c.limit) : "—"}</td>
                <td class="${over ? "font-semibold text-red-600" : ""}">${c.credit ? money(c.balance) : "—"}</td>
                <td>${c.credit ? money(Math.max(0, avail)) : "Contado"}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}
