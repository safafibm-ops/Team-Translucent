"""Settings shared by the app: model paths, thresholds, class names, severity rules."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Put the trained files here (see models/README.md)
DEFECT_MODEL = ROOT / "models" / "defect" / "best.pt"            # or the best_openvino_model folder
ANOMALY_MODEL = ROOT / "models" / "anomaly" / "model.ckpt"

DEFECT_CONF = 0.40      # boxes below this are ignored
SURE_DEFECT = 0.50      # a box this confident means "known defect", the anomaly model is skipped
ANOMALY_THRESHOLD = 0.50  # anomaly score above this means "unlike a good part"
WARNING_LEVEL = 0.35      # early warning: good parts drifting toward the limit

# Dataset class name -> problem-statement category
CATEGORY = {
    "crack": "crack",
    "blowholes": "porosity",
    "shrinkage": "porosity",
    "cold shot": "deformation",
    "misrun": "deformation",
    "flash": "other",
    "scar": "scratch",
    "scratch": "scratch",
}

# Base severity points per category (crack is the most dangerous)
BASE_POINTS = {"crack": 3, "porosity": 2, "deformation": 2, "corrosion": 2, "dent": 1, "scratch": 1, "other": 1}
LEVELS = ["Low", "Medium", "High", "Critical"]

CORRECTIVE_ACTION = {
    ("injection_pressure", "low"): "Check the hydraulic unit and raise injection pressure to the set point.",
    ("injection_pressure", "high"): "Lower injection pressure and inspect die seals for leaks.",
    ("melt_temp", "low"): "Raise furnace temperature; check thermocouples and ladle transfer time.",
    ("melt_temp", "high"): "Lower melt temperature; check degassing to reduce gas pick-up.",
    ("die_temp", "low"): "Pre-heat the die longer; check die heaters and cooling water flow.",
    ("die_temp", "high"): "Increase die cooling; check spray nozzles.",
    ("vibration", "high"): "Inspect machine mounts and ejector alignment; schedule maintenance.",
    ("die_age", "high"): "Die is worn; schedule die polishing or replacement.",
    ("conveyor_speed", "high"): "Slow the conveyor and check part handling guides.",
    ("cycle_time", "low"): "Cycle is too short; restore standard solidification time.",
}

# Automatic retraining of the anomaly model from inspector decisions (see qi/retrain.py)
RETRAIN_AFTER = 5           # confirmed good photos needed to start a retrain
RETRAIN_ON_GPU = True       # retrain on the graphics card if PyTorch sees one (inspection always stays on the CPU)
PATTERNS_PER_PHOTO = 200    # at most this many new patch patterns are added per photo
EXAM_LIMIT = 60             # photos per exam set (more = slower but surer check)
EXAM_TOLERANCE = 1          # the new model may miss at most this many more defect photos
EXAM_GOOD_DIR = ROOT / "data" / "exam" / "good"          # optional: known good parts not used for training
EXAM_DEFECT_DIRS = [ROOT / "data" / "exam" / "defect",   # first folder with photos is used
                    ROOT.parent / "casting-qi" / "data" / "casting_rf" / "test" / "images"]
