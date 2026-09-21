import { getState } from "../store/index.js";
import { money, dateFmt, agingBucket } from "../lib/format.js";

export function renderDashboard() {
  const s = getState();
  const todaySales = s.sales.filter((v) => dateFmt(v.at) === dateFmt(new Date().toISOString()));
  const todayTotal = todaySales.reduce((a, v) => a + v.total, 0);
  const low = s.products.filter((p) => p.stock <= p.min);
  const expPending = s.expenses.filter((e) => e.status === "pending").reduce((a, e) => a + e.amount, 0);
  const arOpen = s.receivables.reduce((a, r) => a + (r.amount - r.paid), 0);
  const apOpen = s.payables.reduce((a, r) => a + (r.amount - r.paid), 0);
  const overdueAp = s.payables.filter((p) => agingBucket(p.due) !== "vigente" && p.amount > p.paid).length;
  const overdueAr = s.receivables.filter((p) => agingBucket(p.due) !== "vigente" && p.amount > p.paid).length;

  return `
    <div class="mb-6">
      <h1 class="font-display text-2xl font-extrabold text-stone-900">Tablero operativo</h1>
      <p class="text-sm text-stone-500">Mostrador, caja, stock y obligaciones del tenant ${s.tenant.name}.</p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      ${kpi("Ventas de hoy", money(todayTotal), `${todaySales.length} tickets`)}
      ${kpi("Gastos por pagar", money(expPending), "Operativos pendientes", "warn")}
      ${kpi("Cuentas por cobrar", money(arOpen), `${overdueAr} vencidas`, overdueAr ? "warn" : "")}
      ${kpi("Cuentas por pagar", money(apOpen), `${overdueAp} vencidas`, overdueAp ? "alert" : "")}
    </div>
    <div class="mt-6 grid gap-4 lg:grid-cols-3">
      <section class="card lg:col-span-2">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-semibold">Alertas de reposición</h2>
          <a href="#/inventario" class="text-sm font-semibold text-amber-700">Ver inventario</a>
        </div>
        <div class="overflow-x-auto">
          <table class="data">
            <thead><tr><th>SKU</th><th>Producto</th><th>Stock</th><th>Mínimo</th></tr></thead>
            <tbody>
              ${
                low.length
                  ? low
                      .map(
                        (p) => `<tr>
                        <td class="font-mono text-xs">${p.sku}</td>
                        <td>${p.name}</td>
                        <td class="font-semibold text-red-600">${p.stock} ${p.unit}</td>
                        <td>${p.min}</td>
                      </tr>`
                      )
                      .join("")
                  : `<tr><td colspan="4" class="text-stone-500">Sin alertas.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <h2 class="mb-3 font-semibold">Atajos de mostrador</h2>
        <ul class="space-y-2 text-sm text-stone-600">
          <li><span class="kbd">F2</span> Buscar producto</li>
          <li><span class="kbd">F4</span> Cobrar</li>
          <li><span class="kbd">Esc</span> Cancelar cobro / modal</li>
        </ul>
        <a href="#/pos" class="btn-primary mt-4 w-full">Abrir POS</a>
        <a href="#/cuentas" class="btn-secondary mt-2 w-full">Ver cuentas pendientes</a>
      </section>
    </div>`;
}

function kpi(label, value, hint, tone) {
  const ring = tone === "alert" ? "ring-red-200" : tone === "warn" ? "ring-amber-200" : "";
  return `<article class="card ${ring}">
    <p class="text-xs font-semibold uppercase tracking-wide text-stone-500">${label}</p>
    <p class="mt-1 font-display text-2xl font-extrabold">${value}</p>
    <p class="mt-1 text-sm text-stone-500">${hint}</p>
  </article>`;
}
