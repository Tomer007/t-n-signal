# T&N Alpha Terminal

AI-powered equity research and market analysis tool.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```
2. Set the `CHATGPT_API_KEY` in `.env` to your OpenAI API key (see `.env.example`)
3. Run the app:
   ```
   npm run dev
   ```

## Testing

```
npm test              # Run tests once
npm run test:coverage # Run with coverage report
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CHATGPT_API_KEY` | Yes | OpenAI API key |
| `NEWS_API_KEY` | No | newsapi.org key |
| `GNEWS_API_KEY` | No | gnews.io key |
| `APP_URL` | No | Production URL (for CORS) |
