import threading
import time
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
from torchvision import models, transforms


class OccupancyDetector:
    def __init__(self, model_path: str = "models/parking_vgg16.pth"):
        self.model = None
        self.model_path = model_path
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._running_cameras: dict[str, bool] = {}  # camera_id -> running flag
        self._threads: dict[str, threading.Thread] = {}
        
        # PyTorch ImageNet preprocessing transforms
        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], 
                                 std=[0.229, 0.224, 0.225])
        ])
        
        self._load_model()
    
    def _load_model(self):
        """Load the PyTorch VGG16 model."""
        model_file = Path(self.model_path)
        if not model_file.exists():
            print(f"[OccupancyDetector] Model not found at {self.model_path}. Running in demo mode.")
            self.model = None
            return
            
        try:
            print(f"[OccupancyDetector] Loading PyTorch model on {self.device}...")
            
            # Recreate the exact architecture from train_vgg16.py
            self.model = models.vgg16(weights=None)
            num_features = self.model.classifier[0].in_features
            
            self.model.classifier = nn.Sequential(
                nn.Linear(num_features, 256),
                nn.ReLU(inplace=True),
                nn.Dropout(0.5),
                nn.Linear(256, 1)
            )
            
            # Load weights
            state_dict = torch.load(self.model_path, map_location=self.device)
            self.model.load_state_dict(state_dict)
            
            self.model = self.model.to(self.device)
            self.model.eval()  # Set to inference mode
            
            print(f"[OccupancyDetector] PyTorch Model loaded successfully from {self.model_path}")
        except Exception as e:
            print(f"[OccupancyDetector] Failed to load model: {e}. Running in demo mode.")
            self.model = None
            
    def predict_slot(self, slot_image: np.ndarray) -> tuple[str, float]:
        """Predict if a single slot is occupied or vacant.
        Returns ('occupied'/'vacant', confidence)
        If model not loaded, returns random demo predictions."""
        if self.model is None:
            # Demo mode: return random predictions
            import random
            status = random.choice(['occupied', 'vacant'])
            return status, random.uniform(0.7, 0.99)
            
        try:
            # OpenCV BGR -> RGB
            rgb = cv2.cvtColor(slot_image, cv2.COLOR_BGR2RGB)
            
            # Apply PyTorch transforms and add batch dimension
            tensor = self.transform(rgb).unsqueeze(0).to(self.device)
            
            # Inference
            with torch.no_grad():
                output = self.model(tensor)
                confidence = torch.sigmoid(output).item()
                
            # Adjusted threshold to 0.05 to prevent deep shadows from being classified as occupied cars
            status = 'vacant' if confidence > 0.05 else 'occupied'
            
            # Make confidence relative to class prediction
            if status == 'occupied':
                confidence = 1.0 - confidence
                
            return status, confidence
        except Exception as e:
            print(f"[OccupancyDetector] Inference error: {e}")
            return 'vacant', 0.0
            
    def process_frame(self, frame: np.ndarray, slots: list[dict]) -> list[dict]:
        """Process a full frame: crop each slot ROI and classify.
        slots: list of {slot_id, x1, y1, x2, y2}
        Returns: list of {slot_id, status, confidence}"""
        results = []
        for slot in slots:
            crop = frame[slot['y1']:slot['y2'], slot['x1']:slot['x2']]
            if crop.size == 0:
                continue
            status, confidence = self.predict_slot(crop)
            results.append({
                'slot_id': slot['slot_id'],
                'status': status,
                'confidence': confidence
            })
        return results
    
    def start_camera(self, source, camera_id: str, slots: list[dict], 
                     on_update=None, interval: int = 5):
        """Start occupancy detection for a camera in a background thread."""
        if camera_id in self._running_cameras and self._running_cameras[camera_id]:
            print(f"[OccupancyDetector] Camera {camera_id} is already running.")
            return

        self._running_cameras[camera_id] = True
        
        def loop():
            print(f"[OccupancyDetector] Started thread for camera {camera_id} (source={source})")
            
            # Use DirectShow backend on Windows for better webcam support
            if isinstance(source, int) or str(source).isdigit():
                cap = cv2.VideoCapture(int(source), cv2.CAP_DSHOW)
            else:
                cap = cv2.VideoCapture(source)
                
            if not cap.isOpened():
                print(f"[OccupancyDetector] ERROR: Cannot open source {source} for {camera_id}")
                self._running_cameras[camera_id] = False
                return

            while self._running_cameras.get(camera_id, False):
                ret, frame = cap.read()
                if not ret:
                    print(f"[OccupancyDetector] Failed to read frame from {camera_id}")
                    # If it's a video file, loop it. If webcam, just wait and retry.
                    if isinstance(source, str) and not source.isdigit():
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        time.sleep(1)
                        continue
                    else:
                        time.sleep(1)
                        continue
                
                results = self.process_frame(frame, slots)
                
                if on_update and results:
                    on_update(results)
                
                time.sleep(interval)
                
            cap.release()
            print(f"[OccupancyDetector] Stopped thread for camera {camera_id}")

        t = threading.Thread(target=loop, daemon=True)
        self._threads[camera_id] = t
        t.start()
        
    def stop_camera(self, camera_id: str):
        """Stop the background thread for a given camera."""
        if camera_id in self._running_cameras:
            self._running_cameras[camera_id] = False
            # Wait for thread to finish
            if camera_id in self._threads:
                self._threads[camera_id].join(timeout=2.0)
                del self._threads[camera_id]
            print(f"[OccupancyDetector] Requested stop for camera {camera_id}")

    def stop_all(self):
        """Stop all background threads."""
        for camera_id in list(self._running_cameras.keys()):
            self.stop_camera(camera_id)

    def process_image(self, image_path: str, slots: list[dict]) -> list[dict]:
        """Process a single image file for detection testing or ROI updates."""
        image = cv2.imread(image_path)
        if image is None:
            print(f"[OccupancyDetector] ERROR: Could not read image {image_path}")
            return []
        return self.process_frame(image, slots)
