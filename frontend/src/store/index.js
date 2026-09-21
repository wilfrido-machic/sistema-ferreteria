const KEY = "sig-ferreteria-v1";

function seed() {
  return {
    tenant: {
      name: "Ferretería Laguna",
      slug: "ferrelaguna",
      nit: "8745123-K",
      branch: "Casa matriz · Mixco",
      warehouse: "Piso de venta",
    },
    session: {
      user: "Carlos Méndez",
      role: "Cajero POS",
      shiftOpen: true,
      openingAmount: 500,
    },
    products: [
      { id: "p1", sku: "PVC-050", name: "Tubo PVC hidráulico 1/2\"", unit: "UND", stock: 148, min: 40, price: 18.5, list: "PUBLIC" },
      { id: "p2", sku: "MNG-025", name: "Manguera jardín 1/2\" (metro)", unit: "M", stock: 86.5, min: 30, price: 12.75, list: "PUBLIC", fractional: true },
      { id: "p3", sku: "ALM-12", name: "Alambre galvanizado cal. 12", unit: "LB", stock: 210, min: 80, price: 9.9, list: "PUBLIC", fractional: true },
      { id: "p4", sku: "TRN-38", name: "Tornillo drywall 6x1 1/4 (caja 100)", unit: "CAJA", stock: 42, min: 12, price: 28, list: "PUBLIC" },
      { id: "p5", sku: "THN-GAL", name: "Thinner estándar", unit: "GAL", stock: 19, min: 8, price: 85, list: "PUBLIC" },
      { id: "p6", sku: "LAM-26", name: "Lámina zinc cal. 26 3.05m", unit: "PLIEGO", stock: 64, min: 20, price: 78.5, list: "PUBLIC" },
      { id: "p7", sku: "CEM-42", name: "Cemento Progreso 42.5 kg", unit: "UND", stock: 11, min: 25, price: 92, list: "PUBLIC" },
      { id: "p8", sku: "INT-LED", name: "Interruptor simple LED", unit: "UND", stock: 73, min: 20, price: 22, list: "PUBLIC" },
    ],
    customers: [
      { id: "c1", name: "Consumidor Final", nit: "CF", credit: false, limit: 0, balance: 0, list: "PUBLIC" },
      { id: "c2", name: "Constructora Valle S.A.", nit: "2458910-5", credit: true, limit: 15000, balance: 4820, list: "CONTRACTOR" },
      { id: "c3", name: "Instalaciones López", nit: "7891234-3", credit: true, limit: 5000, balance: 5100, list: "CONTRACTOR" },
      { id: "c4", name: "Ferretería El Tornillo (mayoreo)", nit: "1122334-1", credit: true, limit: 8000, balance: 1250, list: "WHOLESALE" },
    ],
    suppliers: [
      { id: "s1", name: "Distribuidora Cemaco Mayorista" },
      { id: "s2", name: "Pinturas Sur S.A." },
      { id: "s3", name: "Aceros de Guatemala" },
      { id: "s4", name: "EEGSA / Energuate" },
      { id: "s5", name: "Inmobiliaria Mixco Plaza" },
    ],
    sales: [
      { id: "v1", number: "V-1044", at: isoDays(-1), total: 356.8, fel: "certified", pay: "cash", customerId: "c1" },
      { id: "v2", number: "V-1045", at: isoDays(0), total: 1280, fel: "pending_fel", pay: "on_account", customerId: "c2" },
      { id: "v3", number: "V-1046", at: isoDays(0), total: 92, fel: "certified", pay: "cash", customerId: "c1" },
    ],
    quotes: [
      { id: "q1", number: "COT-088", customerId: "c2", total: 2450, status: "sent", validUntil: isoDays(8) },
      { id: "q2", number: "COT-089", customerId: "c4", total: 880, status: "draft", validUntil: isoDays(12) },
    ],
    expenses: [
      { id: "e1", date: isoDays(-6), category: "Renta", vendorId: "s5", desc: "Alquiler local septiembre", amount: 6500, method: "transfer", status: "paid" },
      { id: "e2", date: isoDays(-2), category: "Servicios", vendorId: "s4", desc: "Energía eléctrica sucursal", amount: 1120.4, method: "transfer", status: "pending" },
      { id: "e3", date: isoDays(-1), category: "Combustible", vendorId: "s1", desc: "Gasolina delivery", amount: 350, method: "cash", status: "paid" },
      { id: "e4", date: isoDays(0), category: "Mantenimiento", vendorId: "s3", desc: "Reparación portón bodega", amount: 780, method: "cash", status: "pending" },
    ],
    payables: [
      { id: "ap1", type: "supplier", party: "Aceros de Guatemala", ref: "FC-88921", issue: isoDays(-40), due: isoDays(-10), amount: 9200, paid: 0, notes: "Varilla y malla" },
      { id: "ap2", type: "supplier", party: "Pinturas Sur S.A.", ref: "FC-1204", issue: isoDays(-12), due: isoDays(5), amount: 2100, paid: 700, notes: "Thinner y esmalte" },
      { id: "ap3", type: "expense", party: "EEGSA / Energuate", ref: "SRV-ENE", issue: isoDays(-8), due: isoDays(-1), amount: 1120.4, paid: 0, notes: "Energía" },
    ],
    receivables: [
      { id: "ar1", customerId: "c2", ref: "V-1031", issue: isoDays(-45), due: isoDays(-15), amount: 3200, paid: 0 },
      { id: "ar2", customerId: "c2", ref: "V-1045", issue: isoDays(0), due: isoDays(15), amount: 1280, paid: 0 },
      { id: "ar3", customerId: "c3", ref: "V-1022", issue: isoDays(-70), due: isoDays(-40), amount: 5100, paid: 0 },
      { id: "ar4", customerId: "c4", ref: "V-1038", issue: isoDays(-20), due: isoDays(10), amount: 1250, paid: 0 },
    ],
    cashMovements: [
      { id: "m1", kind: "OPENING", amount: 500, at: isoDays(0), reason: "Fondo de apertura" },
      { id: "m2", kind: "SALE_CASH", amount: 356.8, at: isoDays(-1), reason: "V-1044" },
      { id: "m3", kind: "PETTY", amount: -350, at: isoDays(-1), reason: "Combustible delivery" },
    ],
  };
}

function isoDays(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(9, 30, 0, 0);
  return d.toISOString();
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw);
  } catch {
    return seed();
  }
}

let state = load();

export function getState() {
  return state;
}

export function setState(mutator) {
  mutator(state);
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("store:change"));
}

export function resetDemo() {
  state = seed();
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("store:change"));
}

export const CATEGORIES = [
  "Renta",
  "Servicios",
  "Salarios",
  "Combustible",
  "Mantenimiento",
  "Papelería",
  "Transporte",
  "Otros",
];
