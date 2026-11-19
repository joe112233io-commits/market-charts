# Market Charts

A private market workspace for your team: keep a shared list of symbols and their price history, chart them with indicators and drawings, and track them with watchlists, price alerts, practice trading and a screener.

Inspired by https://tradingview.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Add stocks, crypto, forex, futures, indexes and funds, and load their price history from CSV.
- Chart any symbol as candles, hollow candles, bars, line, area or Heikin Ashi, from intraday to monthly, with indicators and drawings saved as private layouts.
- Keep private watchlists with last price, change and volume, sorted or in your own order.
- Set price alerts that are checked on the server whenever new bars arrive, with a log and optional email.
- Practice with paper trading accounts using market, limit and stop orders.
- Screen every symbol by type, exchange, price, change, volume, RSI and moving averages, and save your screens.

Left out: accounts and sign-in, which your Gateway handles; community ideas and scripts; a scripting language and backtester; live broker trading; licensed real-time data and news; bar replay and multi-chart grids; webhook, SMS and push alerts; heatmaps; native mobile and desktop apps.

## Setup

Install it on your Gateway from this repository with `pnpm everyapp install <repository url>`, or from a checkout:

```sh
pnpm install
pnpm dev          # local app with a test member
pnpm test         # unit tests
pnpm run deploy   # deploy to your Cloudflare account behind your Gateway
```

Nothing has to be set before the app opens. Two optional features, set with `pnpm everyapp configure market-charts`:

- **Daily prices**: `MARKET_DATA_API_KEY`, a free [Alpha Vantage](https://www.alphavantage.co/support/#api-key) key. Each weekday at 22:30 UTC the app adds every symbol's new daily bars, then checks alerts and fills paper orders against them.
- **Alert emails**: your Gateway's email service, used when an alert is set to email its owner.

Scripts can use the JSON API under `/api` (symbols, bars as CSV, watchlists, alerts, layouts, paper accounts, screener) with a Gateway personal access token.

## Limitations

- Prices come only from your CSV imports and the optional daily fetch; there is no real-time feed.
- Alpha Vantage's free tier allows 25 requests a day, one per symbol, so the daily fetch covers about 25 symbols.
- Paper orders fill against stored bars only: a working order fills when an imported or fetched bar reaches its price.
- The release checks run against a local Gateway; email delivery and the Alpha Vantage fetch were not exercised there.
