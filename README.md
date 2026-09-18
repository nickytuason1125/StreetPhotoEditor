# StreetPhotoEditor (FirstCut)

AI-powered street photography editor — grades, sequences, and curates photos
with a fully local vision pipeline. No cloud, no subscription, offline after
setup.

The application source lives in the [`street-story-curator/`](./street-story-curator)
submodule: https://github.com/nickytuason1125/StreetStoryCurator

## Download & run

### Windows (x64)
1. Clone (or Code → Download ZIP) this repo — **with submodules**:
   ```
   git clone --recurse-submodules https://github.com/nickytuason1125/StreetPhotoEditor.git
   ```
2. Open the `street-story-curator` folder and double-click **`Setup.bat`**
   (wizard installs Python deps, Node build of the UI, and downloads ~22 GB of
   models on first run). Requires Python 3.12, Node.js LTS, Git.

### macOS — Apple Silicon (ARM64) & Intel
1. Same clone command as above.
2. Inside `street-story-curator`:
   ```
   chmod +x run_macos.sh && ./run_macos.sh
   ```
   This creates the venv, installs MPS-capable PyTorch (arm64 wheels ship MPS
   support), CPU onnxruntime, builds the frontend from source, and launches at
   http://127.0.0.1:8000. Optional Apple-GPU encoding: `FIRSTCUT_TORCH_DEVICE=mps`.
   Jury/critique features need `llama-cpp-python`, built from source — install
   CMake + Xcode Command Line Tools first.

See `street-story-curator/PORTING.md` for the full macOS/ARM status and
verification checklist, and `street-story-curator/INSTALL.md` for details.

### Linux
Not yet supported. The macOS path (`run_macos.sh`) is the closest reference.

## What is NOT in this repo (downloaded at first run)
- `models/` — ~22 GB of model weights (HuggingFace / ultralytics, cached locally)
- `venv/`, `frontend/dist/`, `frontend/src-tauri/binaries/` — built by Setup
- `llama-quantize/` — Windows x64 quantization helpers (not needed to run; not
  usable on ARM64 — macOS builds llama.cpp from source instead)

## License
MIT
