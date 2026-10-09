# Team Translucent: AI Quality Inspection for Cast Parts

AI that inspects photos of cast aluminium parts and decides **PASS / REVIEW / REJECT** in under half a second on a normal factory PC, with no GPU.

Built for Singularity 2026, Track 3 (Automotive Component Quality Inspection).

## The problem

Manual visual inspection is slow and inconsistent, and tired eyes miss cracks. A missed defect means scrap, rework or a recall. Most factory lines have ordinary PCs, not GPUs.

## Our solution

For every part photo the system gives:

- **Decision:** PASS, REVIEW (send to a person) or REJECT
- **Where and what:** boxes around known defects, plus a heat-map of anything unusual
- **Severity:** Low, Medium, High or Critical (a crack is never below High)
- **Root cause and fix:** the likely machine cause, with confidence, and a corrective action
- **Early warning:** flags a machine whose good parts are slowly drifting, before the first defect

## How the engine works

Two AI models work as a **cascade**:

```
Photo
  └─> 1. Defect model (YOLO11s)        ~77 ms
        ├─ sure defect found ────────────────> REJECT
        └─ unsure or nothing found
              └─> 2. Anomaly model (PatchCore)   ~0.2-0.3 s
                    ├─ weak box + unusual ─────> REJECT
                    ├─ unusual, no known defect > REVIEW
                    ├─ weak box only ──────────> REVIEW
                    └─ looks like a good part ─> PASS
```

1. **Defect model** finds and names 8 known casting defects: crack, scratch, blowholes, shrinkage, flash, scar, misrun, cold shot.
2. **Anomaly model** has learned only what a *good* part looks like, so it also catches defect types it was never shown, and draws a heat-map of where.
3. **Root cause:** a LightGBM model on machine readings (temperature, pressure, speed, vibration), explained with SHAP, links a defect to its likely cause and fix.

## Models and data

| | Defect model | Anomaly model |
| --- | --- | --- |
| Algorithm | YOLO11s (Ultralytics) | PatchCore (Anomalib), WideResNet50 features |
| Dataset | [casting_dataset_kaggle](https://universe.roboflow.com/detect-casting-defect/casting_dataset_kaggle), Roboflow, CC BY 4.0 | [Casting product image data](https://www.kaggle.com/datasets/ravirajsinh45/real-life-industrial-dataset-of-casting-product), Kaggle |
| Training images | 1,769 labelled photos (1,239 train / 356 val / 174 test) | 2,875 good parts only, no labels |
| Test result | mAP50 **0.75** (crack 0.93) | image AUROC **0.96**, F1 **0.88** (524 test parts) |
| CPU time | 77 ms per photo | 0.2-0.3 s per photo |

Both datasets show the same part, a cast pump impeller.

## Dashboard

React dashboard served by FastAPI: inspect photos, review queue, KPIs (yield, rejects, waiting reviews, check time), early-warning trend per machine, machine risk ranking, work orders, self-learning status and the review range sliders.

## Run it

**Docker (easiest):**
```
docker build -t casting-qi .
docker run -p 8000:7860 casting-qi
```

**Python:**
```
pip install -r requirements.txt
uvicorn api:app --port 8000
```

Open http://localhost:8000. API docs are at http://localhost:8000/docs. Model files are not in git; see `models/README.md`.

## Tech stack

Python 3.11 · PyTorch · Ultralytics YOLO11 · Anomalib PatchCore · OpenVINO · LightGBM + SHAP · FastAPI · React (Vite) · Docker

## Honest limits

- Machine readings are **simulated**: no public dataset links casting photos to process data.
- The Roboflow set likely has near-duplicate photos across train and test, so 0.75 mAP50 is somewhat optimistic.
- Trained on one part type; a new part needs its own good-part photos.

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

