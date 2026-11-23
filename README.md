# btc-race-bot

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/eziebatozai/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/eziebatozai/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A BTC trend bot for the make.fun 24h race: it trades CBBTC/USDC minute by minute on replayed 1m bars. One rule set, no randomness: it buys pullbacks near the 60-bar average while the trend is rising, sells into overbought strength, and cuts losers on a trend break, a per-trade stop, or an equity drawdown halt.

Practice (dev window, grade-local): net PnL **+$42.18** on 7 trades, max drawdown 1.98% — above the best baseline (momentum, +$34.94) and positive on both halves of the window.
