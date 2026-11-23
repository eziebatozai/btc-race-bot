// btc-race-bot — CBBTC/USDC trend bot for make.fun bars-replay/v1.
// One rule set, fully deterministic: no clock, no environment, no randomness.
// It buys pullbacks near the 60-bar average while the trend is rising and
// sells into overbought strength, so it rides uptrends and sits out chop.
//
// Fills land at the NEXT bar's open, so every decision uses the latest close
// and is filled one bar later. A full-size round trip costs roughly 40-45 bps
// (4 bps fee + 2 bps modelled slippage + price impact), so the bot only
// trades when the expected move is clearly larger than that cost.
import { runBars } from './vendor/makefun-bars.ts';

const SYM = 'CBBTC';
const SMA_PERIOD = 60;
const BUY_BAND_BPS = 20; // buy when close is within 0.20% of the 60-bar average
const SELL_BAND_BPS = 150; // sell when close is 1.50% above the 60-bar average
const TREND_BREAK_BPS = 100; // sell when close falls 1.00% below the 60-bar average
const STOP_BPS = 100; // sell when close falls 1.00% below the entry price
const MAX_DD_BPS = 800; // halt: if equity falls 8% from its peak, sell and stop trading
const MAX_SLIPPAGE_BPS = 300; // 3% — fills are at the next open, moves are ~5 bps/min

const closes: number[] = []; // raw close units (price_scale 5), one per bar
const smaByBar: (number | null)[] = []; // 60-bar average, indexed by bar number
let inPos = false;
let entryRaw = 0; // fill price of the open position, in raw price units
let halted = false; // set by the drawdown guard; trading never resumes
let peakEq = 1000n * 1000000n; // peak equity in micro-USDC, starts at 1,000 USDC
let pendingBuyId: string | null = null;
let orderSeq = 0;

function smaAt(k: number): number | null {
  if (k < SMA_PERIOD - 1) return null;
  let sum = 0;
  for (let j = k - SMA_PERIOD + 1; j <= k; j++) sum += closes[j];
  return sum / SMA_PERIOD;
}

await runBars({
  onBatch: (state, batch) => {
    const closeRaw = state.close(SYM);
    if (closeRaw === null) return [];
    const close = Number(closeRaw);
    const k = closes.length;
    closes.push(close);
    smaByBar.push(smaAt(k));

    if (state.warmingUp) return [];

    // Track the peak equity and the exact fill price of the open position.
    if (state.equity > peakEq) peakEq = state.equity;
    for (const f of batch.fills) {
      if (f.client_id === pendingBuyId && f.status === 'filled') {
        entryRaw = Number(f.price);
        pendingBuyId = null;
      }
    }

    // Drawdown guard: an 8% fall from peak equity sells the position and
    // halts the bot for the rest of the window. It is the last line of
    // defence for the 25% race guardrail; it never fired on the dev window.
    const pos = state.positions.get(SYM);
    // Reconcile with the real position: a rejected order must not leave the
    // bot thinking it is long (or flat) when it is not.
    if (pos === undefined) inPos = false;
    else if (!inPos) {
      inPos = true;
      if (entryRaw === 0) entryRaw = close;
    }
    if (state.equity * 10000n < peakEq * BigInt(10000 - MAX_DD_BPS)) {
      halted = true;
      if (inPos && pos !== undefined) {
        inPos = false;
        orderSeq++;
        return [
          {
            side: 'sell',
            symbol: SYM,
            qty: pos.qty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
            client_id: `sell${orderSeq}`,
          },
        ];
      }
      return [];
    }
    if (halted) return [];

    const sma = smaByBar[k];
    if (sma === null) return [];

    if (!inPos && pos === undefined) {
      // Flat: buy the pullback while the trend is rising on both a 30-bar and
      // a 60-bar slope. The 60-bar slope is the regime filter: in a steady
      // decline the average itself falls, so the bot stays flat instead of
      // buying every dip on the way down.
      const sma30Ago = k >= 30 ? smaByBar[k - 30] : null;
      const sma60Ago = k >= 60 ? smaByBar[k - 60] : null;
      const rising =
        sma30Ago !== null && sma > sma30Ago && sma60Ago !== null && sma > sma60Ago;
      if (close < sma * (1 + BUY_BAND_BPS / 10000) && rising) {
        inPos = true;
        entryRaw = close; // fallback; the fill price overwrites this next batch
        orderSeq++;
        pendingBuyId = `buy${orderSeq}`;
        return [
          {
            side: 'buy',
            symbol: SYM,
            notional_quote_units: state.cash,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
            client_id: pendingBuyId,
          },
        ];
      }
      return [];
    }

    if (inPos && pos !== undefined) {
      // Long: sell into overbought strength, on a trend break, or on the
      // per-trade stop. All three are exits, not reversals — the bot never
      // shorts, it goes flat and waits for the next pullback.
      const overbought = close > sma * (1 + SELL_BAND_BPS / 10000);
      const trendBreak = close < sma * (1 - TREND_BREAK_BPS / 10000);
      const stopped = close < entryRaw * (1 - STOP_BPS / 10000);
      if (overbought || trendBreak || stopped) {
        inPos = false;
        orderSeq++;
        return [
          {
            side: 'sell',
            symbol: SYM,
            qty: pos.qty,
            max_slippage_bps: MAX_SLIPPAGE_BPS,
            client_id: `sell${orderSeq}`,
          },
        ];
      }
    }

    return [];
  },
});
