"""
anpr.py - Automatic Number-Plate Recognition with YOLOv8 + LPRNet.

Two-stage pipeline:
  1. **Detection / Localisation** - YOLOv8 neural network detects
     the bounding box of the license plate in the image.
  2. **OCR** - LPRNet reads the text from the cropped plate region.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING

import cv2
import numpy as np
import torch

from lprnet import LPRNet

if TYPE_CHECKING:
    pass  # only for static analysis

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CHARS = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J',
    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
    'U', 'V', 'W', 'X', 'Y', 'Z', '-'
]

# ---------------------------------------------------------------------------
# Singleton YOLOv8 model for plate detection
# ---------------------------------------------------------------------------

_yolo_model = None


def _get_yolo_model():
    """Load the YOLOv8 model for license plate detection."""
    global _yolo_model
    if _yolo_model is not None:
        return _yolo_model

    try:
        from ultralytics import YOLO  # type: ignore[import-untyped]
        
        # Determine the absolute path to the backend directory
        backend_dir = Path(__file__).resolve().parent
        model_path = backend_dir / "models" / "plate_yolo.pt"
        
        # Load the YOLOv8 model
        _yolo_model = YOLO(str(model_path))
        print(f"[anpr] YOLOv8 loaded from {model_path.relative_to(backend_dir)}")
    except ImportError:
        print("[anpr] ultralytics is not installed - YOLO will not be available.")
    except Exception as exc:  # noqa: BLE001
        print(f"[anpr] Failed to load YOLO: {exc}")

    return _yolo_model


def detect_plate_regions(image: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Detect licence plates in an image using YOLOv8."""
    yolo = _get_yolo_model()
    if yolo is None:
        return []

    # Run YOLO inference
    results = yolo(image, verbose=False)
    
    # Extract bounding boxes
    boxes = []
    for result in results:
        for box in result.boxes:
            # box.xyxy is [x1, y1, x2, y2] format
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
            
            # Ensure coordinates are within image boundaries
            h, w = image.shape[:2]
            x1 = max(0, x1)
            y1 = max(0, y1)
            x2 = min(w, x2)
            y2 = min(h, y2)
            
            width = x2 - x1
            height = y2 - y1
            
            if width > 0 and height > 0:
                boxes.append((x1, y1, width, height))
                
    # Sort boxes by area (largest first) assuming the primary car is the largest
    boxes.sort(key=lambda b: b[2] * b[3], reverse=True)
    return boxes


# ---------------------------------------------------------------------------
# Singleton LPRNet reader
# ---------------------------------------------------------------------------

_lprnet_model = None
_lprnet_device = None


def _get_lprnet_model():
    """Return (and lazily create) the LPRNet singleton."""
    global _lprnet_model, _lprnet_device

    if _lprnet_model is not None:
        return _lprnet_model, _lprnet_device

    try:
        backend_dir = Path(__file__).resolve().parent
        model_path = backend_dir / "models" / "best_lprnet.pth"
        
        _lprnet_device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        net = LPRNet(lpr_max_len=18, phase=False, class_num=len(CHARS), dropout_rate=0)
        net.to(_lprnet_device)
        net.load_state_dict(torch.load(str(model_path), map_location=_lprnet_device))
        net.eval()
        
        _lprnet_model = net
        print(f"[anpr] LPRNet reader initialised on {_lprnet_device}.")
    except Exception as exc:  # noqa: BLE001
        print(f"[anpr] Failed to initialise LPRNet: {exc}")
        return None, None

    return _lprnet_model, _lprnet_device


# ---------------------------------------------------------------------------
# Core plate-reading (OCR only)
# ---------------------------------------------------------------------------

def greedy_decode(prebs: np.ndarray) -> str:
    """Decode LPRNet output into string."""
    preb = prebs[0, :, :]
    preb_label = list()
    for j in range(preb.shape[1]):
        preb_label.append(np.argmax(preb[:, j], axis=0))

    no_repeat_blank_label = list()
    pre_c = preb_label[0]
    if pre_c != len(CHARS) - 1:
        no_repeat_blank_label.append(pre_c)
    for c in preb_label:
        if (pre_c == c) or (c == len(CHARS) - 1):
            if c == len(CHARS) - 1:
                pre_c = c
            continue
        no_repeat_blank_label.append(c)
        pre_c = c

    text = "".join([CHARS[c] for c in no_repeat_blank_label])
    return text

def read_plate(image: np.ndarray, apply_preprocessing: bool = True) -> tuple[str | None, float]:
    """Read a licence plate from an image array using a hybrid LPRNet and EasyOCR approach."""
    # 1. Run EasyOCR
    easy_text = ""
    try:
        import easyocr
        reader = easyocr.Reader(['en'], gpu=torch.cuda.is_available(), verbose=False)
        results = reader.readtext(image)
        if results:
            # Sort by confidence or size, usually just take the first bounding box
            _, text, _ = results[0]
            cleaned = re.sub(r"[^A-Z0-9]", "", text.upper())
            if len(cleaned) >= 4:
                easy_text = cleaned
    except Exception as exc:
        print(f"[anpr] EasyOCR error: {exc}")

    # 2. Run LPRNet
    lpr_text = ""
    try:
        lprnet, device = _get_lprnet_model()
        if lprnet:
            img_resized = cv2.resize(image, (94, 24))
            img_resized = img_resized.astype('float32')
            img_resized -= 127.5
            img_resized *= 0.0078125
            img_transposed = np.transpose(img_resized, (2, 0, 1))

            tensor = torch.from_numpy(img_transposed).unsqueeze(0).to(device)
            with torch.no_grad():
                prebs = lprnet(tensor)
                
            prebs_np = prebs.cpu().detach().numpy()
            raw_text = greedy_decode(prebs_np)
            cleaned = re.sub(r"[^A-Z0-9]", "", raw_text.upper())
            if len(cleaned) >= 4:
                lpr_text = cleaned
    except Exception as exc:
        print(f"[anpr] LPRNet error: {exc}")

    # 3. Hybrid Decision Logic
    # Indian plate pattern: 2 Letters, 1-2 Numbers, 1-2 Letters, 3-4 Numbers
    indian_pattern = re.compile(r"^[A-Z]{2}\d{1,2}[A-Z]{1,2}\d{3,4}$")
    
    # Priority 1: If LPRNet matches the Indian pattern, trust it (LPRNet excels at Indian fonts)
    if lpr_text and indian_pattern.match(lpr_text):
        return lpr_text, 0.95
        
    # Priority 2: If EasyOCR perfectly matches the Indian pattern, trust it
    if easy_text and indian_pattern.match(easy_text):
        return easy_text, 0.90
        
    # Priority 3: If LPRNet produces a long string (hallucinating to fit 10-char format)
    # but EasyOCR gives a concise string (e.g., UK or EU plates), trust EasyOCR
    if easy_text and lpr_text and len(lpr_text) >= 9 and len(easy_text) < 9:
        return easy_text, 0.85
        
    # Priority 4: Default to EasyOCR if it got something, as it handles generic fonts better
    if easy_text:
        return easy_text, 0.80
        
    # Priority 5: Fallback to LPRNet
    if lpr_text:
        return lpr_text, 0.75

    return None, 0.0


# ---------------------------------------------------------------------------
# High-level pipeline entrypoints
# ---------------------------------------------------------------------------

def read_plate_from_image(image_path: str | Path) -> tuple[str | None, float]:
    """Full two-stage ANPR pipeline."""
    image = cv2.imread(str(image_path))
    if image is None:
        return None, 0.0

    boxes = detect_plate_regions(image)
    if boxes:
        x, y, w, h = boxes[0]
        
        plate_roi = image[y:y+h, x:x+w]
        text, conf = read_plate(plate_roi)
        
        if text:
            print(f"[anpr] YOLO + LPRNet detected plate: {text}")
            return text, conf
            
    return None, 0.0
