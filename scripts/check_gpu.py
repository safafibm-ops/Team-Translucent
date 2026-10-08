"""Step 1 check: is PyTorch using your NVIDIA card?   Run:  python scripts/check_gpu.py"""
import torch

print("PyTorch version:", torch.__version__)
if torch.cuda.is_available():
    print("GPU found:", torch.cuda.get_device_name(0))
    print("GPU memory: %.1f GB" % (torch.cuda.get_device_properties(0).total_memory / 1e9))
    x = torch.rand(2000, 2000, device="cuda")
    print("Test calculation on GPU OK:", float((x @ x).sum()) > 0)
else:
    print("NO GPU. PyTorch is the CPU-only version or the NVIDIA driver is old.")
    print("Fix: pip uninstall -y torch torchvision, then reinstall with the CUDA command in the guide.")
