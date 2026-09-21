export function toast(message, type = "ok") {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  const tone =
    type === "error"
      ? "bg-red-600"
      : type === "warn"
        ? "bg-amber-600"
        : "bg-stone-900";
  el.className = `${tone} text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg max-w-sm`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

export function openModal({ title, body, footer = "" }) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4">
      <div data-close class="absolute inset-0 bg-stone-900/50 backdrop-blur-[2px]"></div>
      <div class="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-stone-200">
        <div class="flex items-center justify-between border-b border-stone-100 px-5 py-3">
          <h3 class="font-display text-lg font-bold">${title}</h3>
          <button data-close class="btn-ghost px-2" type="button" aria-label="Cerrar">Esc</button>
        </div>
        <div class="px-5 py-4">${body}</div>
        ${footer ? `<div class="flex justify-end gap-2 border-t border-stone-100 px-5 py-3">${footer}</div>` : ""}
      </div>
    </div>`;
  const close = () => {
    root.innerHTML = "";
  };
  root.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));
  const onKey = (e) => {
    if (e.key === "Escape") {
      close();
      window.removeEventListener("keydown", onKey);
    }
  };
  window.addEventListener("keydown", onKey);
  return { close, root };
}
