import { getState } from "../store/index.js";
import { money, escapeHtml } from "../lib/format.js";

export function renderInventario() {
  const { products, tenant } = getState();
  return `
    <div class="mb-5 flex items-end justify-between">
      <div>
        <h1 class="font-display text-2xl font-extrabold">Inventario y kardex</h1>
        <p class="text-sm text-stone-500">${tenant.warehouse} · stock en unidad base · alertas de reorden.</p>
      </div>
    </div>
    <div class="card overflow-x-auto p-0">
      <table class="data">
        <thead>
          <tr>
            <th>SKU</th><th>Descripción</th><th>U. base</th><th>Existencia</th><th>Punto reorden</th><th>Precio público</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map((p) => {
              const alert = p.stock <= p.min;
              return `<tr>
                <td class="font-mono text-xs">${p.sku}</td>
                <td>${escapeHtml(p.name)}</td>
                <td>${p.unit}${p.fractional ? " · frac." : ""}</td>
                <td class="font-semibold ${alert ? "text-red-600" : ""}">${p.stock}</td>
                <td>${p.min}</td>
                <td>${money(p.price)}</td>
                <td>${alert ? `<span class="chip bg-red-50 text-red-700">Reponer</span>` : `<span class="chip bg-emerald-50 text-emerald-700">OK</span>`}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}
