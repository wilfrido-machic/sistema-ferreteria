import { getState, setState } from "../store/index.js";
import { money, escapeHtml, uid } from "../lib/format.js";
import { toast } from "../lib/ui.js";

let cart = [];
let priceList = "PUBLIC";
let customerId = "c1";
let query = "";

const LISTS = { PUBLIC: 1, WHOLESALE: 0.92, CONTRACTOR: 0.88 };

export function renderPos() {
  const s = getState();
  const customer = s.customers.find((c) => c.id === customerId) || s.customers[0];
  const q = query.trim().toLowerCase();
  const hits = s.products.filter(
    (p) => !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
  );
  const subtotal = cart.reduce((a, l) => a + l.qty * l.price, 0);

  return `
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-extrabold">Punto de venta</h1>
        <p class="text-sm text-stone-500">F2 búsqueda · F4 cobrar · Esc limpiar cobro. Ticket interno inmediato; FEL en cola.</p>
      </div>
      <div class="flex flex-wrap gap-2 text-xs text-stone-500">
        <span class="chip bg-stone-100"><span class="kbd mr-1">F2</span> Buscar</span>
        <span class="chip bg-stone-100"><span class="kbd mr-1">F4</span> Cobrar</span>
        <span class="chip bg-stone-100"><span class="kbd mr-1">Esc</span> Cerrar</span>
      </div>
    </div>
    <div class="grid gap-4 xl:grid-cols-5">
      <section class="card xl:col-span-3">
        <label class="label" for="pos-search">Producto / código</label>
        <input id="pos-search" class="field text-base" placeholder="SKU, descripción o pistola…" value="${escapeHtml(query)}" autocomplete="off" />
        <div class="mt-3 max-h-72 overflow-auto rounded-xl ring-1 ring-stone-100">
          <table class="data">
            <thead><tr><th>SKU</th><th>Descripción</th><th>Stock</th><th>Precio</th></tr></thead>
            <tbody>
              ${hits
                .slice(0, 12)
                .map((p) => {
                  const price = p.price * (LISTS[priceList] || 1);
                  return `<tr data-add="${p.id}" class="cursor-pointer">
                    <td class="font-mono text-xs">${p.sku}</td>
                    <td>${escapeHtml(p.name)}</td>
                    <td>${p.stock} ${p.unit}</td>
                    <td class="font-semibold">${money(price)}</td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card xl:col-span-2 flex flex-col">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label">Cliente</label>
            <select id="pos-customer" class="field">
              ${s.customers
                .map(
                  (c) =>
                    `<option value="${c.id}" ${c.id === customerId ? "selected" : ""}>${escapeHtml(c.name)}</option>`
                )
                .join("")}
            </select>
          </div>
          <div>
            <label class="label">Lista (F3)</label>
            <select id="pos-list" class="field">
              <option value="PUBLIC" ${priceList === "PUBLIC" ? "selected" : ""}>Público</option>
              <option value="WHOLESALE" ${priceList === "WHOLESALE" ? "selected" : ""}>Mayoreo</option>
              <option value="CONTRACTOR" ${priceList === "CONTRACTOR" ? "selected" : ""}>Instalador</option>
            </select>
          </div>
        </div>
        ${
          customer.credit
            ? `<p class="mt-2 text-xs ${customer.balance >= customer.limit ? "text-red-600" : "text-stone-500"}">
                Crédito disponible ${money(Math.max(0, customer.limit - customer.balance))} / límite ${money(customer.limit)}
              </p>`
            : ""
        }
        <div class="mt-3 flex-1 overflow-auto">
          ${
            cart.length
              ? `<table class="data">
                <thead><tr><th>Ítem</th><th>Cant.</th><th></th></tr></thead>
                <tbody>${cart
                  .map(
                    (l, i) => `<tr>
                    <td>${escapeHtml(l.name)}<div class="text-xs text-stone-400">${money(l.price)}</div></td>
                    <td><input data-qty="${i}" class="field w-16 py-1" type="number" min="0.01" step="0.01" value="${l.qty}" /></td>
                    <td><button data-del="${i}" class="text-red-600 text-xs font-semibold" type="button">Quitar</button></td>
                  </tr>`
                  )
                  .join("")}</tbody></table>`
              : `<p class="text-sm text-stone-500">Carrito vacío. Pulse Enter sobre un resultado.</p>`
          }
        </div>
        <div class="mt-3 border-t border-stone-100 pt-3">
          <div class="flex justify-between text-lg font-display font-extrabold">
            <span>Total IVA incl.</span><span>${money(subtotal)}</span>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <button id="pos-pay-cash" class="btn-primary" type="button">Cobrar efectivo (F4)</button>
            <button id="pos-pay-credit" class="btn-secondary" type="button">A crédito</button>
          </div>
        </div>
      </section>
    </div>`;
}

export function bindPos() {
  const search = document.getElementById("pos-search");
  search?.focus();

  search?.addEventListener("input", (e) => {
    query = e.target.value;
    rerenderKeepFocus();
  });
  search?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const s = getState();
      const q = query.trim().toLowerCase();
      const p = s.products.find((x) => x.sku.toLowerCase() === q) || s.products.find((x) => x.sku.toLowerCase().includes(q) || x.name.toLowerCase().includes(q));
      if (p) addProduct(p.id);
    }
  });

  document.getElementById("pos-customer")?.addEventListener("change", (e) => {
    customerId = e.target.value;
    const c = getState().customers.find((x) => x.id === customerId);
    if (c?.list) priceList = c.list;
    window.dispatchEvent(new CustomEvent("store:change"));
  });
  document.getElementById("pos-list")?.addEventListener("change", (e) => {
    priceList = e.target.value;
    window.dispatchEvent(new CustomEvent("store:change"));
  });
  document.querySelectorAll("[data-add]").forEach((row) =>
    row.addEventListener("click", () => addProduct(row.getAttribute("data-add")))
  );
  document.querySelectorAll("[data-qty]").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      const i = Number(e.target.getAttribute("data-qty"));
      cart[i].qty = Number(e.target.value) || 1;
      window.dispatchEvent(new CustomEvent("store:change"));
    })
  );
  document.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => {
      cart.splice(Number(btn.getAttribute("data-del")), 1);
      window.dispatchEvent(new CustomEvent("store:change"));
    })
  );
  document.getElementById("pos-pay-cash")?.addEventListener("click", () => checkout("cash"));
  document.getElementById("pos-pay-credit")?.addEventListener("click", () => checkout("on_account"));
}

function rerenderKeepFocus() {
  window.dispatchEvent(new CustomEvent("store:change"));
  requestAnimationFrame(() => {
    const el = document.getElementById("pos-search");
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });
}

function addProduct(id) {
  const p = getState().products.find((x) => x.id === id);
  if (!p) return;
  const price = +(p.price * (LISTS[priceList] || 1)).toFixed(2);
  const line = cart.find((l) => l.id === id);
  if (line) line.qty += 1;
  else cart.push({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, qty: 1, price });
  toast(`${p.sku} agregado`);
  window.dispatchEvent(new CustomEvent("store:change"));
}

function checkout(method) {
  if (!cart.length) {
    toast("El carrito está vacío", "warn");
    return;
  }
  const total = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const s = getState();
  const customer = s.customers.find((c) => c.id === customerId);

  if (method === "on_account") {
    if (!customer?.credit) {
      toast("Este cliente no tiene crédito", "error");
      return;
    }
    if (customer.balance + total > customer.limit) {
      toast("Supera el límite de endeudamiento", "error");
      return;
    }
  }

  setState((st) => {
    const number = `V-${1047 + st.sales.length}`;
    const saleId = uid("v");
    st.sales.push({
      id: saleId,
      number,
      at: new Date().toISOString(),
      total,
      fel: "pending_fel",
      pay: method,
      customerId,
    });
    if (method === "on_account") {
      const c = st.customers.find((x) => x.id === customerId);
      c.balance += total;
      const due = new Date();
      due.setDate(due.getDate() + 15);
      st.receivables.push({
        id: uid("ar"),
        customerId,
        ref: number,
        issue: new Date().toISOString(),
        due: due.toISOString(),
        amount: total,
        paid: 0,
      });
    } else {
      st.cashMovements.push({
        id: uid("m"),
        kind: "SALE_CASH",
        amount: total,
        at: new Date().toISOString(),
        reason: number,
      });
    }
    cart.forEach((l) => {
      const p = st.products.find((x) => x.id === l.id);
      if (p) p.stock = Math.max(0, +(p.stock - l.qty).toFixed(3));
    });
  });
  cart = [];
  toast("Ticket interno emitido. FEL en certificación asíncrona.");
  window.dispatchEvent(new CustomEvent("store:change"));
}

export function posHotkeys(e) {
  if (e.key === "F2") {
    e.preventDefault();
    document.getElementById("pos-search")?.focus();
  }
  if (e.key === "F3") {
    e.preventDefault();
    const order = ["PUBLIC", "WHOLESALE", "CONTRACTOR"];
    priceList = order[(order.indexOf(priceList) + 1) % order.length];
    window.dispatchEvent(new CustomEvent("store:change"));
  }
  if (e.key === "F4") {
    e.preventDefault();
    checkout("cash");
  }
  if (e.key === "Escape") {
    const modal = document.getElementById("modal-root");
    if (modal?.innerHTML.trim()) return;
    if (cart.length) {
      cart = [];
      toast("Carrito cancelado", "warn");
      window.dispatchEvent(new CustomEvent("store:change"));
    }
  }
}
