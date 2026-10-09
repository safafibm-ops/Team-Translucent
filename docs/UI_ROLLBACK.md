# Dashboard UI redesign: how to go back

## Premium UI (2026-10-09, second redesign)

The dashboard was restyled a second time on 2026-10-09: light and dark themes, a review rail next to the
inspector, a large review viewer with keyboard shortcuts, a clearer early-warning chart and a bottom tab bar on phones.
Only files under `web/` changed (`web/src`, `web/index.html`, `web/vite.config.js` dev proxy, and the built `web/dist`).
`api.py`, `qi/`, the models and the data were not touched.

### Go back to the previous dark "graphite" UI

That version was never committed to git, so it was copied before the change to
`C:\team-translucent\.ui-backup\web-v2-graphite\` (git ignores this folder). Open Command Prompt:

```
cd /d C:\team-translucent
xcopy /e /y .ui-backup\web-v2-graphite\src web\src\
copy /y .ui-backup\web-v2-graphite\index.html web\index.html
copy /y .ui-backup\web-v2-graphite\vite.config.js web\vite.config.js
rmdir /s /q web\dist
xcopy /e /i /y .ui-backup\web-v2-graphite\dist web\dist
del web\src\format.js
```

Restart the server and press Ctrl+F5. The same files are also in the project files as
`ui-backups/web-ui-v2-graphite.zip`.

### Go back to the very first UI (sidebar version)

```
cd /d C:\team-translucent
git checkout ui-v1-before-redesign -- web
```

(Details below.)

---

## First redesign (2026-10-09, morning)

The dashboard UI was redesigned on 2026-10-09 (top tabs, new layout and styling).
Only files under `web/` changed. `api.py`, `qi/` and the models were not touched.

Before the redesign, the old UI was saved as the git tag `ui-v1-before-redesign`.

### Go back to the old UI

Open Command Prompt:

```
cd /d C:\team-translucent
git checkout ui-v1-before-redesign -- web
```

Restart the server (`uvicorn api:app --port 8000`) and press Ctrl+F5 in the browser.
The old dashboard is back. No rebuild is needed because the built files in `web/dist` come back too.

To keep the old UI on GitHub as well:

```
git commit -m "Go back to the old dashboard UI"
git push
```

### Return to the new UI after going back

```
git checkout main -- web
```

(Only works if you did not commit the rollback. If you did, use `git revert HEAD` instead.)

### Make sure teammates have the safety point

The tag lives on your laptop until you push it once:

```
git push origin ui-v1-before-redesign
```

### What is where

| Old place | Place now |
|---|---|
| Sidebar "Live line", inspector | Inspection tab |
| Review queue | Inspection tab, in a column to the right of the inspector (below it on smaller screens); amber count on the tab |
| Early warning, machine risk | Line health tab; red count on the tab when a machine needs attention |
| Self-learning, versions, review range sliders | Models & rules tab; a pulsing dot on the tab while retraining |
| KPI row | Under the page title on every tab |
| Model loaded status, light/dark switch, API docs | Top right |

A copy of the first UI's `web/` folder is also at `ui-backups/web-ui-v1.zip` in the project files.
