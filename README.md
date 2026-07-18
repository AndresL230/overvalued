# Overvalued

Overvalued is a live party-game prediction market for self-submitted résumé claims. Every candidate opens a binary market: will the résumé pass its reference check, or is it inflated LARP?

## Frontend

The current frontend is a polished interactive prototype with:

- a responsive three-pane candidate exchange
- live probability movement and a scrolling trade tape
- functional YES/NO buy and sell tickets
- portfolio and leaderboard panels
- a self-listing flow with a résumé randomizer
- a dedicated `/board` broadcast view for a booth display

All trading data is currently local mock state. The next implementation layer should connect these surfaces to the Supabase schema and RPC contract described in the product requirements.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run build
npm test
```

The app uses the Next.js App Router through vinext and keeps the Sites deployment declaration in `.openai/hosting.json`.
