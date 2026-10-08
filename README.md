# Casting Quality Inspection (Team Translucent)

AI inspection for cast aluminium parts, built for the Singularity hackathon, Track 3.

Two models work together on each part photo:

1. **Defect model** (YOLO11s): finds 8 known casting defects (crack, blowholes, shrinkage, cold shot, misrun, flash, scar, scratch) and draws boxes.
2. **Anomaly model** (PatchCore): trained on good parts only. When the defect model is unsure, it checks whether the part looks unusual and shows a heat-map.

The app then gives a **PASS / REVIEW / REJECT** decision, a **severity** (Low to Critical), the **likely root cause** from machine readings with a confidence score, a **corrective action**, and a **risk forecast** per machine.

Everything runs on a normal CPU. No GPU is needed in the factory.

## Results so far

| Model | Data | Test score | CPU time per photo (i5-13450HX) |
| --- | --- | --- | --- |
| Defect, YOLO11s | Roboflow casting_dataset_kaggle, 174 test photos | mAP50 0.749 (crack 0.929) | 77 ms (PyTorch), 45 ms (OpenVINO INT8, mAP50 0.722) |
| Anomaly, PatchCore | Kaggle casting dataset, about 15k-patch memory | image AUROC 0.96, F1 0.88 (524 test parts) | about 330 ms (PyTorch), 206 ms (OpenVINO) on a 4-core CPU |

Machine readings are **simulated**, because no public dataset links casting photos to process data. The simulator plants known causes (for example, low injection pressure leads to porosity), and the root-cause model has to find them again.

## Run the app

```
python -m venv .venv
.venv\Scripts\activate          (Windows)   or   source .venv/bin/activate
pip install -r requirements.txt
```

Copy the trained model files into `models/` (see `models/README.md`), then:

```
streamlit run app.py
```

It opens in the browser. Upload part photos, or type a folder such as `data/casting_rf/test/images`, then click **Inspect**.

## Project layout

```
app.py              Streamlit dashboard (inspect parts, line dashboard, how it works)
qi/config.py        model paths, thresholds, class mapping, corrective actions
qi/models.py        loads and runs the defect and anomaly models
qi/decision.py      combines both models into a decision and severity
qi/process.py       simulated machine data, root cause (LightGBM + SHAP), risk prediction
scripts/            training scripts for both models
models/             trained model files (not in git)
```

## Train the models

```
python scripts/check_gpu.py
python scripts/train_defect.py --data data/casting_rf/data.yaml
python scripts/train_anomaly.py --data data/kaggle/casting_data/casting_data --n-train 1000 --coreset 0.015
```

Export the defect model for fast CPU use:

```
yolo export model=runs/detect/defect_v1/weights/best.pt format=openvino
```
