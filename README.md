# Plainhand

Paste a draft written with AI help. Plainhand scores it for AI-writing habits, applies the safe fixes instantly, and (with a key) has Claude rewrite the rest without changing facts, numbers, code or citations.

- **Scan**: sloptrim's `detect.py` (62 machine-checked patterns) runs in the browser through Pyodide. Nothing is uploaded.
- **Quick clean**: the character layer from `detect.py` plus rule fixes in `clean.js`. Code spans are skipped.
- **Deep rewrite**: `claude-opus-5-5`, with rules condensed from the humanizer skill (`prompt.js`), five styles and optional voice matching. Visitors either bring their own Anthropic key (sent straight from the browser) or buy Pro.
- **Image to text**: Tesseract.js OCR for screenshots (file picker or paste).

Static site: `index.html`, `app.js`, `clean.js`, `prompt.js`, `pyworker.js`, `config.js`, `style.css`, `py/detect.py`.

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

## Cost per rewrite

Opus 5.5 is $4 / $20 per million input / output tokens. A 500-word rewrite is about 3k input and 1.5-3k output tokens including thinking, roughly $0.04-0.07. At the default 150 rewrites a month, a heavy user costs about $6-10, so $9 a month only covers average users. Raise the price or lower `QUOTA` (wrangler.toml and `config.js`) if usage runs high.

## What it does not claim

The score counts writing habits; it is not a prediction of any detector's verdict, and the site says so. Rules about disclosing AI use still apply to text that went through it.

## Credits

Scanner: sloptrim `detect.py`, Apache-2.0 (`licenses/`). Rewrite rules adapted from the humanizer skill (MIT), based on Wikipedia's "Signs of AI writing".
