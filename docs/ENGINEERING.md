# Engineering notes: retraining, versions, review range, CPU speed, Docker

Part 2 of the README. Each section says whether a feature is **built** or **planned**.

## 1. Self-learning anomaly model (built)

The system learns from the inspectors who review its unsure parts.

1. A part the system is unsure about goes to the **review queue**. An inspector clicks **Pass** or **Reject**.
2. Every **Pass** is a confirmed good part. After **5** of them, retraining starts by itself in the background.
3. The anomaly model adds the new parts' patterns to its memory of good parts (up to 200 new patch patterns per photo, the ones most different from what it already knows). This takes **about 35 s on a CPU**. No GPU, no full retrain.
4. **Exam before switching:** old and new versions are both tested on up to 60 known-defect photos that were never used for training (plus known-good photos, if provided). The new version goes live only if it misses at most 1 more defect than the old one and raises no more false alarms. Otherwise the old version stays.

Test result: the exam caught **39 of 39** defects, and the learned parts' scores fell from **0.90 to 0.45**, so they no longer raise false alarms.

**Rejects** are saved to `data/labels/defect` for the defect model. Retraining the defect model on them, on a cloud GPU (AWS), is **planned**.

## 2. Model versions (built)

- Version 1 (the original trained model) is always kept, plus up to **5 retrained versions** in `models/anomaly/versions/`.
- The **Versions** row on the dashboard switches between them in one click, and the choice survives a restart.
- Every retrain, accepted or not, is logged in `data/retrain_log.csv`.
- Example: the same photo scored 0.82 (REVIEW) on v1 and 0.39 (PASS) on v2.

## 3. Review range selector (built)

Each factory can tune how strict the system is, from the dashboard, without touching code.

| Setting | Default | Meaning |
| --- | --- | --- |
| Ignore below | 40% | Defect boxes below this confidence are ignored |
| Reject above | 50% | A box at or above this is a sure defect: REJECT, anomaly model skipped |
| Between the two | | Unsure: the anomaly model double-checks, a person reviews |
| Anomaly review line | 0.50 | Anomaly score above this means "unlike a good part" |

Settings are saved in `data/rules.json` and survive a restart; **Reset** restores the defaults. A wider range sends more parts to a person: 30-75% moved 4 of 12 test photos from PASS to REVIEW.

## 4. Running on factory CPUs

| Technique | Status | Effect |
| --- | --- | --- |
| **Cascade:** anomaly model runs only when the defect model is unsure | Built | Sure defects take ~77 ms instead of ~0.3 s |
| **Small memory bank:** 15k patches chosen from 2,875 good parts | Built | 206 ms vs 490 ms for a 51k bank (OpenVINO) |
| **OpenVINO** (Intel's CPU runtime) for the anomaly model | Measured | 327 ms to 206 ms |
| **OpenVINO INT8** for the defect model | Measured, not used | 77 ms to 45 ms, but mAP50 fell 0.75 to 0.72, too much for safety defects. The app accepts the OpenVINO export as a drop-in (`qi/config.py`) |
| **ResNet18** backbone for the anomaly model | Measured | 81 ms vs 206 ms with WideResNet50, for the cheapest PCs; accuracy check pending |

Timings: defect model on an i5-13450HX laptop CPU, anomaly model on a 4-core CPU.

## 5. Parallel processing

- **Built:** retraining runs in a background thread, so inspection never stops while the model learns. A lock makes the switch to a new version safe mid-shift.
- **Planned:** capture the next photo while the current one is inspected, and one edge PC per line so lines run in parallel, with a plant server collecting results.

## 6. Docker (built)

One container holds the API, the dashboard and both models, so a factory PC needs only Docker.

- `python:3.11-slim` with **CPU-only PyTorch** (much smaller image) and headless OpenCV
- Runs as a non-root user on port 7860, ready for Hugging Face Spaces
- Models are baked into the image

```
docker build -t casting-qi .
docker run -p 8000:7860 casting-qi
```

Retrained versions live inside the container and are lost when it is removed. To keep them, mount the folders:
```
docker run -p 8000:7860 -v ./data:/home/user/app/data -v ./models/anomaly/versions:/home/user/app/models/anomaly/versions casting-qi
```

## 7. API

FastAPI, interactive docs at `/docs`.

| Endpoint | Purpose |
| --- | --- |
| `POST /inspect` | Inspect photos: decision, boxes, heat-map, severity, cause |
| `GET /review`, `POST /review/{id}` | Review queue, Pass or Reject |
| `GET/POST /retrain`, `POST /retrain/use` | Self-learning status, start, switch version |
| `GET/POST /rules` | Review range settings |
| `GET /early-warning`, `GET /machines/risk` | Drift trend and machine risk |
| `GET /summary`, `POST /work-orders` | KPIs and work orders |

## 8. Code layout

```
api.py           FastAPI service
web/             React dashboard (dist/ is served by FastAPI)
qi/models.py     loads and runs both models
qi/decision.py   cascade, decision and severity
qi/retrain.py    self-learning, exam and versions
qi/process.py    simulated machine data, root cause, risk, early warning
qi/config.py     thresholds, class mapping, corrective actions
scripts/         training scripts
```
