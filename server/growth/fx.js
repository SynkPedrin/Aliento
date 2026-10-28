// Cotação do dia (frankfurter.dev) para somar vendas de moedas diferentes na moeda dos relatórios.
// O valor de cada venda continua exato na moeda paga; só os totais são convertidos (aproximados).
const TTL_MS = 12 * 3600_000;

export function createFx({ base, fetchImpl = globalThis.fetch, log = console }) {
  const BASE = String(base).toUpperCase();
  let cache = null; // { at, rates: { BRL: 5.4, EUR: 0.92, … } } = unidades por 1 BASE

  async function rates() {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.rates;
    try {
      const r = await fetchImpl(`https://api.frankfurter.dev/v2/rates?base=${BASE}`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = await r.json(); // [{ quote: 'BRL', rate: 5.3 }, …]
      cache = { at: Date.now(), rates: Object.fromEntries((Array.isArray(list) ? list : []).map((x) => [x.quote, x.rate])) };
    } catch (err) {
      log.warn(`[fx] cotação indisponível: ${err.message}`);
      if (!cache) return {};
      cache.at = Date.now() - TTL_MS + 10 * 60_000; // tenta de novo em 10 min, usando a última cotação
    }
    return cache.rates;
  }

  /** Soma [{ currency, cents }] na moeda base. Moeda sem cotação fica fora do total e vai em `missing`. */
  async function total(rows) {
    const list = rows.map((x) => ({ currency: String(x.currency ?? BASE).toUpperCase(), cents: Number(x.cents) || 0 })).filter((x) => x.cents);
    const rt = list.some((x) => x.currency !== BASE) ? await rates() : {};
    let cents = 0; const missing = [];
    for (const x of list) {
      if (x.currency === BASE) cents += x.cents;
      else if (rt[x.currency]) cents += Math.round(x.cents / rt[x.currency]);
      else missing.push(x.currency);
    }
    return { cents, missing: [...new Set(missing)] };
  }

  return { rates, total };
}
