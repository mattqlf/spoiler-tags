# Spoiler Tags

A Chrome extension that hides text wrapped in `<spoiler>...</spoiler>` tags inside ChatGPT, Claude, and Gemini web apps behind a click-to-reveal blur.

Useful for asking an AI for hints, puzzle answers, plot details, or anything you want to see one step at a time.

## Install

1. Download or clone this repo.
2. Open `chrome://extensions` in Chrome.
3. Toggle **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Confirm "Spoiler Tags" is listed and enabled.

## Usage

Any assistant response containing `<spoiler>...</spoiler>` will have the enclosed text blurred. Click to reveal. Click again to re-hide.

The model has to emit the tags itself. Set that up per-platform below.

## Platform setup

### ChatGPT — custom GPT

1. Go to <https://chatgpt.com/gpts/editor>.
2. Fill in a name (e.g. "Spoiler Hints") and description.
3. In the **Instructions** field, paste:

   ```
   When producing hints, puzzle answers, plot details, or any content the user may want to reveal at their own pace, wrap the sensitive content in <spoiler>...</spoiler> tags.

   Rules:
   - Wrap only the spoilery text itself, not labels like "Hint 1:" or "Answer:".
   - Use a separate <spoiler>...</spoiler> pair for each distinct piece so they can be revealed independently.
   - Do not wrap entire responses — keep structure (lists, headings, prose) outside the tags so the user still sees shape while text is hidden.
   ```

4. Save. Use that GPT when you want spoiler-tagged output.

### Claude — skill (or project)

**Option A — Skill (recommended, Claude ≥ late 2025):**

1. In Claude, go to **Settings → Capabilities → Skills → Create skill**.
2. Name it "Spoiler Tags" and paste the same instruction text as above.
3. Enable the skill whenever you want spoiler-tagged output.

**Option B — Project:**

1. Create a new Project in Claude.
2. Paste the instruction text into the project's **Custom instructions**.
3. Start chats in that project.

### Gemini — system instructions / Saved info

1. Go to <https://gemini.google.com>.
2. Open **Settings → Saved info** (or create a Gem via **Gems → New Gem** for a scoped version).
3. Add the same instruction text. For a Gem, paste it into the Gem's instructions field.

## Syntax

The model should emit literal tags in its response:

```
Book 1: <spoiler>Snape kills Dumbledore</spoiler>. Book 7: <spoiler>Harry lives</spoiler>.
```

Both `<spoiler>...</spoiler>` pairs get blurred independently.

## Notes

- The extension matches on escaped tag text (`&lt;spoiler&gt;...&lt;/spoiler&gt;`) which is how all three platforms' markdown renderers emit unknown HTML tags. If a platform starts stripping the tags entirely, the extension can't recover them — the fix is to change the model's instructions to use a different delimiter (e.g. `||text||`) and update `content.js` accordingly.
- Nothing leaves your browser. No analytics, no network requests.
