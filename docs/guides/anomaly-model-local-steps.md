# Anomaly heat-map model on your own laptop (Windows, RTX 5050)

This repeats what you did on Colab, but trains on **all 2,875 good parts** in one go.

Type every command in **Command Prompt** (Start menu, type `cmd`, press Enter), not PowerShell.

## 1. Check the NVIDIA driver

```
nvidia-smi
```

The top line shows `Driver Version`. It must be **570 or higher**. If it is lower, update it from the NVIDIA app (or nvidia.com/drivers), restart, and check again.

## 2. Check Python is 3.11.9

```
py -3.11 --version
```

It must print `Python 3.11.9`. If it prints `3.11.0` (or says not found), install **Python 3.11.9 (Windows installer 64-bit)** from python.org, tick "Add python.exe to PATH", then run the command again.

## 3. Get the newest scripts

The training script was updated today so that all 2,875 parts fit in the laptop's 8 GB of GPU memory.

1. Download `casting-qi-scripts.zip` from the project files.
2. Extract it anywhere (e.g. Downloads).
3. Copy the `scripts` folder from inside it into `C:\casting-qi`, and choose **Replace** when Windows asks.
   Do not touch `C:\casting-qi\data`.

Check you have the new one:

```
cd C:\casting-qi
findstr patch-keep scripts\train_anomaly.py
```

If that prints a line, you have it.

## 4. Make a fresh Python environment

The old `.venv` was made with the wrong Python (it showed pip 21.2.3), so delete it and make a new one.

```
cd C:\casting-qi
rmdir /s /q .venv
py -3.11 -m venv .venv
.venv\Scripts\activate
```

You should now see `(.venv)` at the start of the line. **Every time you open a new Command Prompt, run `cd C:\casting-qi` and `.venv\Scripts\activate` again.**

## 5. Install the libraries

Run these one at a time. The first one downloads about 3 GB.

```
python -m pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r requirements.txt
```

## 6. Check the GPU is seen

```
python scripts\check_gpu.py
```

Good result: `GPU found: NVIDIA GeForce RTX 5050 ...` and `Test calculation on GPU OK: True`.
If it says `NO GPU`, run `pip uninstall -y torch torchvision`, then the `cu128` line from step 5 again.

## 7. Check the dataset is where the script expects

```
dir data\kaggle /s /b | findstr /e "train\ok_front"
```

It should print one folder path ending in `train\ok_front`. If it prints nothing, the dataset is not inside `data\kaggle`.

## 8. Train on all good parts

```
python scripts\train_anomaly.py --data data/kaggle --n-train 3000 --n-test 262
```

What this means:
- `--n-train 3000`: use every good part (there are 2,875, so it takes all of them).
- `--n-test 262`: test on 262 good and 262 defective parts (all the good test photos there are), so the score is fairer than the 150 used on Colab.

At the start it prints a line like
`Storing 10% of each photo's patches (~307,200), then keeping 4.9% of them (~15,000 in the memory bank).`
That is expected: it is how 2,875 photos fit in GPU memory while keeping the model fast on a CPU later.

It does not count epochs. It reads all the photos once, then shows "Selecting Coreset Indices" with a progress bar, then tests.

**If it stops with "CUDA out of memory"**, run it again with half the patches:

```
python scripts\train_anomaly.py --data data/kaggle --n-train 3000 --n-test 262 --patch-keep 0.05
```

## 9. Send back the results

1. A screenshot of the score table at the end (`image_AUROC` and `image_F1Score`). Colab with 300 parts gave AUROC 0.88 and F1 0.76.
2. 4 to 6 heat-map pictures from the `test_good` and `test_defect` folders in
   `C:\casting-qi\results\anomaly\Patchcore\casting\v0\images`
   (each run makes a new folder: v0, v1, v2 ... so use the highest number)
3. The trained model file `model.ckpt` from
   the same `v` folder, inside `weights\lightning\`
   It is too big for GitHub, so put it on Google Drive and share the link.
