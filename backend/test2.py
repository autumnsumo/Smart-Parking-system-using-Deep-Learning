import os
import cv2
import torch
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Slot
from occupancy import OccupancyDetector
from torchvision import transforms
from PIL import Image

engine = create_engine('sqlite:///parking.db')
Session = sessionmaker(bind=engine)
db = Session()
slots = db.query(Slot).all()
slot_dicts = [{'slot_id': s.slot_id, 'x1': s.x1, 'y1': s.y1, 'x2': s.x2, 'y2': s.y2} for s in slots if s.x1 is not None]

detector = OccupancyDetector()
image = cv2.imread('uploads/video_preview_0000.jpg')

def letterbox_image(img):
    # Padding instead of stretching
    h, w = img.shape[:2]
    size = max(h, w)
    pad_h = (size - h) // 2
    pad_w = (size - w) // 2
    padded = cv2.copyMakeBorder(img, pad_h, size - h - pad_h, pad_w, size - w - pad_w, cv2.BORDER_CONSTANT, value=[0,0,0])
    return padded

transform_letterbox = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

print("--- With Letterbox Padding ---")
for s in slot_dicts:
    roi = image[s['y1']:s['y2'], s['x1']:s['x2']]
    rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
    
    padded = letterbox_image(rgb)
    tensor = transform_letterbox(padded).unsqueeze(0).to(detector.device)
    with torch.no_grad():
        output = detector.model(tensor)
        confidence = torch.sigmoid(output).item()
    status = 'Vacant' if confidence > 0.5 else 'Occupied'
    print(f"{s['slot_id']}: Raw Sigmoid={confidence:.4f} -> {status}")
