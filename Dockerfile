# Casting inspection app: FastAPI + React dashboard, CPU only.
# Build: docker build -t casting-qi .
# Run:   docker run -p 8000:7860 casting-qi   then open http://localhost:8000
FROM python:3.11-slim


# Hugging Face Spaces runs containers as user 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PORT=7860
WORKDIR /home/user/app

# CPU-only PyTorch first (much smaller than the GPU build), then the rest
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir --user torch torchvision --index-url $TORCH_INDEX
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt \
    && pip uninstall -y opencv-python \
    && pip install --no-cache-dir --user --force-reinstall --no-deps opencv-python-headless
# (headless OpenCV needs no screen libraries, so no apt-get step is required)

# app code, built dashboard (web/dist) and the two model files
COPY --chown=user . .

EXPOSE 7860
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port $PORT"]
