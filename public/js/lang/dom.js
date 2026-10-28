// Aplica o catálogo do idioma à tela: cada texto (e placeholder, aria-label, title, alt) que for
// uma chave do catálogo é trocado pela tradução, inclusive o que aparecer depois (observador).
// Roda antes da pintura (microtarefa), então a pessoa não vê o espanhol piscar.
// Para não traduzir um trecho (ex.: texto digitado pela pessoa): translate="no".
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);

export function startDomTranslation(t) {
  const done = new WeakMap(); // nó → texto já traduzido (evita retraduzir o próprio resultado)
  const skip = (el) => !el || el.closest?.('[translate="no"], [contenteditable="true"]') || SKIP.has(el.tagName);

  function text(node) {
    const raw = node.nodeValue;
    if (!raw || done.get(node) === raw || !/[A-Za-zÁÉÍÓÚáéíóúñÑ¿¡]/.test(raw) || skip(node.parentElement)) return;
    const core = raw.trim();
    const out = t(core);
    if (out !== core) node.nodeValue = raw.replace(core, () => out);
    done.set(node, node.nodeValue);
  }
  function attrs(el) {
    if (!el || el.closest?.('[translate="no"], [contenteditable="true"]')) return; // placeholder de textarea também traduz
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v && /[A-Za-zÁÉÍÓÚáéíóúñ]/.test(v)) { const out = t(v.trim()); if (out !== v.trim()) el.setAttribute(a, out); }
    }
    if (el.tagName === 'INPUT' && ['button', 'submit'].includes(el.type) && el.value) el.value = t(el.value);
  }
  function walk(root) {
    if (root.nodeType === Node.TEXT_NODE) return text(root);
    if (root.nodeType !== Node.ELEMENT_NODE || skip(root)) return;
    attrs(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === Node.TEXT_NODE) text(n); else attrs(n); }
  }

  // Textos com negrito/links no meio (termos, privacidade): o parágrafo inteiro é a chave.
  const BLOCKS = '[data-i18n-block] :is(p, li, h1, h2, h3, th, td)';
  const htmlKey = (el) => el.innerHTML.replace(/\s+/g, ' ').trim();
  function blocks(root) {
    for (const el of root.querySelectorAll?.(BLOCKS) ?? []) {
      const key = htmlKey(el), out = t(key);
      if (out !== key) el.innerHTML = out;
    }
  }

  document.title = t(document.title.trim());
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') text(m.target);
      else if (m.type === 'attributes') attrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const titleEl = document.querySelector('title');
  if (titleEl) new MutationObserver(() => { const tt = t(document.title.trim()); if (tt !== document.title) document.title = tt; }).observe(titleEl, { childList: true });
  const start = () => { blocks(document.body); walk(document.body); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}
