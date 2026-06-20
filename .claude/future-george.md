# Future George — Profile System

The **Future George** profile is George's stated direction: the man he is deliberately
becoming. It is not a task list and not today's data — it is the durable target that
Jarvis filters every response through. When George asks anything, Jarvis answers in
service of this profile, referencing it naturally rather than reciting it.

## Storage

- **Supabase:** `app_state` table, `key = 'future-george'`, payload in the `data` column.
- **API:** `api/future-george.js` (`GET` to read, `POST` to write).
- **Local cache:** `localStorage['future_george_v1']` — written on save and on load so the
  greeting card and system prompt work offline / before the network resolves.

## Shape

```json
{
  "spiritual":  { "summary": "", "goals": [] },
  "physical":   { "summary": "", "goals": [] },
  "mental":     { "summary": "", "goals": [] },
  "financial":  { "summary": "", "goals": [] },
  "creative":   { "summary": "", "goals": [] },
  "character":  { "summary": "", "goals": [] },
  "updatedAt":  "ISO-8601"
}
```

Every dimension holds a free-text `summary` (the one-paragraph north star) and an array
of concrete `goals` (short strings). Both are optional — a partial profile is valid.

## The six dimensions

| Key | Domain | What it captures |
|---|---|---|
| `spiritual` | Faith & inner life | Bible reading cadence, prayer habits, who he answers to. |
| `physical`  | Body | Target weight, calorie discipline, training split, conditioning. |
| `mental`    | Mind | Books to read, topics/skills to learn, focus and attention habits. |
| `financial` | Money | Income targets, business goals (Kourtis Construction), savings, investing. |
| `creative`  | Output | Music produced, releases shipped, the body of work he's building. |
| `character` | Conduct | How he carries himself — discipline, word kept, composure, who he is to others. |

## Setup flow

Jarvis builds the profile by interview, **one question at a time** (the Future George
overlay in `ai.html`). He asks per dimension, accepts a free-form answer, and writes the
result back to Supabase. Re-opening the flow edits the existing profile rather than
starting over.

## How Jarvis uses it

Injected into the system prompt under a `FUTURE GEORGE` block ahead of the live data.
Jarvis treats it as the lens, not the subject: he measures today's water, training, and
spending against where George said he's going, and surfaces drift plainly. He references
it the way a chief-of-staff references the boss's known priorities — naturally, never by
reading the profile back.
