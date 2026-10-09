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

More detail: [docs/ENGINEERING.md](docs/ENGINEERING.md) (retraining, versions, review range, CPU optimisation, Docker).
