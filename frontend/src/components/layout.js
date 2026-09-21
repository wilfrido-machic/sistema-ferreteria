import { currentPath, navigate } from "../router.js";
import { getState, resetDemo } from "../store/index.js";
import { toast } from "../lib/ui.js";

const NAV = [
  { href: "/dashboard", label: "Inicio", icon: iconHome },
  { href: "/pos", label: "Punto de venta", icon: iconCart, kbd: "POS" },
  { href: "/inventario", label: "Inventario", icon: iconBox },
  { href: "/cotizaciones", label: "Cotizaciones", icon: iconDoc },
  { href: "/caja", label: "Caja y turno", icon: iconCash },
  { href: "/gastos", label: "Gastos operativos", icon: iconOut },
  { href: "/cuentas", label: "Cuentas pendientes", icon: iconAlert },
  { href: "/clientes", label: "Clientes / CxC", icon: iconUsers },
  { href: "/fel", label: "Documentos FEL", icon: iconQr },
];

function iconHome() {
  return `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="1.8" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`;
}
function iconCart() {
  return `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="1.8" d="M6 6h15l-1.5 9h-12zM6 6 5 3H2m7 16a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm9 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>`;
}
function iconBox() {
  return `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="1.8" d="m21 8-9-5-9 5 9 5 9-5zm0 0v8l-9 5m-9-13v8l9 5"/></svg>`;
}
function iconDoc() {
  return `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="1.8" d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 0v5h5"/></svg>`;
}
function iconCash() {
  return `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="6" width="18" height="12" rx="2" stroke-width="1.8"/><circle cx="12" cy="12" r="2.2" stroke-width="1.8"/></svg>`;
}
function iconOut() {
  return `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="1.8" d="M12 5v14M5 12h14"/></svg>`;
}
function iconAlert() {
  return `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="1.8"/><path stroke-width="1.8" d="M12 8v5m0 3h.01"/></svg>`;
}
function iconUsers() {
  return `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="1.8" d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm11 10v-2a4 4 0 0 0-3-3.87"/></svg>`;
}
function iconQr() {
  return `<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-width="1.8" d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 4h2m4 0h0m-6-4h6v2"/></svg>`;
}

export function renderShell(contentHtml) {
  const { tenant, session } = getState();
  const path = currentPath();
  const pendingFel = getState().sales.filter((s) => s.fel === "pending_fel").length;

  return `
    <div class="flex min-h-screen">
      <aside class="hidden w-64 shrink-0 flex-col bg-ink-950 text-stone-300 lg:flex">
        <div class="px-5 py-5">
          <div class="font-display text-xl font-extrabold tracking-tight text-white">SIG <span class="text-amber-400">Ferretería</span></div>
          <p class="mt-1 text-xs text-stone-500">${tenant.name}</p>
        </div>
        <nav class="flex-1 space-y-0.5 px-3 pb-6">
          ${NAV.map((item) => {
            const active = path === item.href || (item.href !== "/dashboard" && path.startsWith(item.href));
            return `<a href="#${item.href}" class="nav-link flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-300 hover:bg-white/5 ${active ? "active" : ""}">
              ${item.icon()}<span>${item.label}</span>
            </a>`;
          }).join("")}
        </nav>
        <div class="border-t border-white/10 p-4 text-xs">
          <div class="text-stone-400">${session.user}</div>
          <div class="text-stone-500">${session.role} · ${tenant.branch}</div>
          <button id="btn-reset" class="mt-3 text-amber-400 hover:underline" type="button">Restablecer demo</button>
        </div>
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3">
          <div class="flex items-center gap-2 lg:hidden">
            <select id="mobile-nav" class="field py-1.5 text-sm">
              ${NAV.map((n) => `<option value="${n.href}" ${path === n.href ? "selected" : ""}>${n.label}</option>`).join("")}
            </select>
          </div>
          <div class="hidden text-sm text-stone-500 sm:block">
            Almacén: <span class="font-semibold text-stone-800">${tenant.warehouse}</span>
          </div>
          <div class="ml-auto flex items-center gap-2">
            <span class="chip ${pendingFel ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}">
              FEL ${pendingFel ? `${pendingFel} en cola` : "al día"}
            </span>
            <span class="chip bg-stone-100 text-stone-700">Turno ${session.shiftOpen ? "abierto" : "cerrado"}</span>
          </div>
        </header>
        <main class="flex-1 p-4 sm:p-6">${contentHtml}</main>
      </div>
    </div>`;
}

export function bindShell() {
  document.getElementById("mobile-nav")?.addEventListener("change", (e) => navigate(e.target.value));
  document.getElementById("btn-reset")?.addEventListener("click", () => {
    resetDemo();
    toast("Datos de demostración restablecidos");
    navigate(currentPath());
  });
}
