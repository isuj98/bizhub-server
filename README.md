# bizhub-server

Backend API for Business Hub. Uses **Gemini 2.5 Flash** to inspect the client's website (when a URL is set) and produce accurate, site-based analysis and task output.

## How the AI uses the actual website URL

Both **Analysis** and **Let AI run** (task completion) use the business's `website_url` when set:

1. **Server fetches the URL** – The same `probeWebsite()` helper requests the main page (timeout 8s, follow redirects).
2. **Content is passed to Gemini** – For analysis: full probe (URL, status, content-type, snippet). For run-ai: HTML is stripped to plain text (scripts/styles removed) and up to ~6k chars are sent as context.
3. **AI prompt is explicit** – Either “We have fetched the business's actual website…” + the text, or “No website URL was provided or we could not fetch it” so the model knows whether it’s working from real content or not.
4. **Result is accurate to the site** – Suggestions reference or improve on what’s actually on the page; if no URL/fetch failed, output is general and the AI can suggest adding a URL for next time.

So for accurate results, set **Website URL** when adding/editing a business (and optionally **API / Server URL** for analysis). The AI does not modify the site; it only reads it and returns content you can paste in or use manually.

## Endpoints

- `GET /api/businesses` – List all businesses
- `POST /api/businesses` – Create business (`{ "business_name", "website_url"?, "api_endpoint"?, "business_type"?" }`)
- `POST /api/businesses/:id/tasks` – Add a task
- `PATCH /api/businesses/:id/tasks/:taskId` – Update task status
- `POST /api/businesses/:id/tasks/:taskId/run-ai` – Run AI on a task (`{ "taskTitle" }`) → fetches business website when `website_url` is set, then returns `{ summary, suggestedContent, outcome, completedAt }`
- `POST /api/analyze` – Run AI analysis (`{ "businessId", "businessType"?" }`) → probes website + optional API, returns `{ tasks, recommendations }`

When you run **analysis**, the server probes the website (and optional API), then sends that context to Gemini. When you run **Let AI run** on a task, it does the same: if the business has a `website_url`, it fetches that URL and passes the extracted text to the AI so suggestions are based on the actual site.

## Setup

1. **API key**  
   Create `bizhub-server/.env` (or copy from `.env.example`) and set:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   ```
   Analysis will return 503 if this is missing. **Do not commit `.env`** (it is gitignored).

2. **Run**
   ```bash
   cd bizhub-server
   npm install
   npm run dev
   ```
   Server runs at `http://localhost:5001`.
