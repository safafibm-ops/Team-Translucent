"""Train the DEFECT model (finds and names defects with boxes).

Run from the casting-qi folder:
    python scripts/train_defect.py --data data/msdd_yolo/data.yaml

Results land in runs/detect/defect_v1/ :
  weights/best.pt        the trained model (this is what the dashboard uses)
  results.png            loss and accuracy curves per epoch
  confusion_matrix.png   which defects get mixed up
  val_batch0_pred.jpg    example photos with the model's boxes
"""
import argparse

from ultralytics import YOLO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/msdd_yolo/data.yaml")
    ap.add_argument("--model", default="yolo11s.pt", help="yolo11n.pt = fastest, yolo11s.pt = good balance")
    ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=-1, help="-1 = pick the biggest batch that fits in GPU memory")
    ap.add_argument("--name", default="defect_v1")
    ap.add_argument("--device", default="0", help="0 = first NVIDIA GPU, cpu = no GPU")
    a = ap.parse_args()

    model = YOLO(a.model)  # starts from a model pre-trained on everyday photos (transfer learning)
    model.train(
        data=a.data, epochs=a.epochs, imgsz=a.imgsz, batch=a.batch, device=a.device,
        workers=2,              # Windows works best with few loader processes
        patience=25,            # stop early if validation score has not improved for 25 epochs
        name=a.name, exist_ok=True,
        # lighting / camera robustness (augmentation): random brightness, colour, flips, rotation
        hsv_v=0.5, hsv_s=0.5, hsv_h=0.015, fliplr=0.5, flipud=0.5, degrees=10, scale=0.5,
        mosaic=1.0,             # stitches 4 photos into one: more defects per image, helps rare classes
        plots=True,
    )
    print("\nScoring on the held-back TEST photos (never seen in training):")
    best = YOLO(f"runs/detect/{a.name}/weights/best.pt")
    m = best.val(data=a.data, split="test", device=a.device, workers=2, name=f"{a.name}_test", exist_ok=True)
    print(f"Test mAP50: {m.box.map50:.3f}   precision: {m.box.mp:.3f}   recall: {m.box.mr:.3f}")
    print("Per-class scores are in the table printed above. Copy that table to Claude.")


if __name__ == "__main__":
    main()
