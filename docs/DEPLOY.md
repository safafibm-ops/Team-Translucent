# Put the app online (Hugging Face Spaces, free CPU)

One time:
1. Make a free account at huggingface.co.
2. New Space: name `team-translucent`, SDK **Docker**, template **Blank**, hardware **CPU basic (free)**, Public.
3. Settings > Access Tokens: create a token with **Write** access and copy it.

Upload (from C:\team-translucent, with the venv active):

```
pip install -U huggingface_hub
hf auth login
hf upload YOUR_HF_NAME/team-translucent . . --repo-type=space --exclude ".venv/*" "data/*" "models/anomaly/versions/*" ".ui-backup/*" ".git/*" "__pycache__/*" "*/__pycache__/*" "web/node_modules/*" "README.md"
```

README.md is skipped on purpose: the Space's own README holds the `sdk: docker` setting.
The upload includes both model files, so it takes a while the first time.

The Space builds by itself (about 5-10 minutes; watch the Logs tab). The site is then
https://YOUR_HF_NAME-team-translucent.hf.space

Notes:
- The live site starts on the original anomaly model (v1). Self-learning still works there,
  but without the exam photos (they live in data/), so new versions are used without the check.
- Reviews and retrained versions on the live site are lost when the Space restarts.
- The free Space sleeps after 48 hours without visitors; the first visit wakes it (about a minute).

Quick alternative for a live demo from the laptop:
`cloudflared tunnel --url http://localhost:8000` prints a public https link while the app runs.
