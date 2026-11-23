# Plainhand

Paste a draft written with AI help. Plainhand scores it for AI-writing habits, applies the safe fixes instantly, and (with a key) has Claude rewrite the rest without changing facts, numbers, code or citations.

- **Scan**: sloptrim's `detect.py` (62 machine-checked patterns) runs in the browser through Pyodide. Nothing is uploaded.
- **Humanize** (free): the character layer from `detect.py`, then the rule engine in `humanize.js`: stock-word swaps, contrast and closer rewrites, throat-clearing removal, copula fixes, heading case, contractions, long-sentence splits. Code spans are skipped. On the 7-text test set it moves the mean score from 51 to 10 and leaves human text alone.
- **Deep rewrite**: `claude-opus-5-5`, with rules condensed from the humanizer skill (`prompt.js`), five styles and optional voice matching. Pass 1 rewrites, the result is polished by `humanize.js` and rescanned, and if spots are still flagged a second pass fixes only those. Used when a visitor adds their own Anthropic key (sent straight from the browser) or has Pro; otherwise the free in-browser model runs.
- **Free AI rewrite** (no key, no server): Qwen3 4B runs on the visitor's GPU through WebLLM (`localai.js`, `llmworker.js`), using the short prompt `SMALL_PROMPT` and paragraph chunks of about 220 words, then `humanize.js` polishes the result. First use downloads about 2.3 GB, cached afterwards. Needs WebGPU (desktop Chrome or Edge, Safari 26+). Picked over Ministral 3 3B after both ran on the test set: similar scores (11.4 vs 10.1), but Ministral added a preface, invented sentences and dropped an email sign-off, while Qwen kept every identifier, number and citation.
- **Image to text**: Tesseract.js OCR for screenshots (file picker or paste).

Static site: `index.html`, `app.js`, `humanize.js`, `prompt.js`, `pyworker.js`, `config.js`, `style.css`, `py/detect.py`.

## Turning on Pro (paid plan)

1. Deploy the relay:
   ```
   cd worker && npm install
   npx wrangler login
   npx wrangler kv namespace create LICENSES      # paste the id into wrangler.toml
   npx wrangler secret put ANTHROPIC_API_KEY
   npx wrangler secret put STRIPE_SECRET_KEY      # a restricted key with read access to Checkout Sessions and Subscriptions is enough
   npx wrangler deploy
   ```
2. In Stripe, create a recurring product and a Payment Link. Set its confirmation to "Don't show confirmation page" and redirect to
   `https://rounak251.github.io/plainhand/?session_id={CHECKOUT_SESSION_ID}`.
3. Put the Worker URL and the Payment Link in `config.js`, commit, push.

After checkout the page calls `/claim`, which checks the session with Stripe and issues a `ph_live_` key (the same key if called twice). `/rewrite` meters `QUOTA` rewrites per calendar month and re-checks the subscription once a day.

## Price and cost per rewrite

Pro is ₹200 a month (about $2.35) for 30 deep rewrites. Opus 5.5 is $4 / $20 per million input / output tokens. One 500-word pass is about 4k input and 1.5-3k output tokens including thinking, roughly $0.05. The second, targeted pass runs only when the first result still scores above 20 and is free for the user. A user who spends all 30 rewrites costs about $1.5-2.5 (₹130-210), so the plan stays slightly profitable even for heavy users and clearly profitable for typical ones. Change `QUOTA` in `worker/wrangler.toml` and `PRO_QUOTA` / `PRO_PRICE` in `config.js` together.

## What it does not claim

The score counts writing habits; it is not a prediction of any detector's verdict, and the site says so. Rules about disclosing AI use still apply to text that went through it.

## Credits

Scanner: sloptrim `detect.py`, Apache-2.0 (`licenses/`). Rewrite rules adapted from the humanizer skill (MIT), based on Wikipedia's "Signs of AI writing".
