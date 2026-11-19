import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "market-charts",
  name: "Market Charts",
  description:
    "Charts, watchlists, price alerts, paper trading and a screener over price data your team imports.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
  },
  capabilities: {
    email: {
      access: "write",
      why: "Emails the owner of an alert set to email them when it fires.",
    },
  },
  features: {
    email: {
      name: "Alert emails",
      why: "Alerts can also arrive by email.",
      capabilities: ["email"],
    },
    "market-data": {
      name: "Daily prices",
      why: "Adds each symbol's new daily bars every weekday evening, so alerts and paper orders run without imports.",
      steps: [
        "Get a free API key at https://www.alphavantage.co/support/#api-key",
      ],
      secrets: [
        {
          name: "MARKET_DATA_API_KEY",
          how: "The key Alpha Vantage shows after you sign up",
        },
      ],
    },
  },
});
