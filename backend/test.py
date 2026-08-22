import os
import cv2
import torch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Slot
from occupancy import OccupancyDetector

engine = create_engine('sqlite:///parking.db')
Session = sessionmaker(bind=engine)
db = Session()
slots = db.query(Slot).all()
slot_dicts = [{'slot_id': s.slot_id, 'x1': s.x1, 'y1': s.y1, 'x2': s.x2, 'y2': s.y2} for s in slots if s.x1 is not None]

detector = OccupancyDetector()
image = cv2.imread('uploads/video_preview_0000.jpg')

for s in slot_dicts:
    roi = image[s['y1']:s['y2'], s['x1']:s['x2']]
    rgb = cv2.cvtColor(roi, cv2.COLOR_BGR2RGB)
    tensor = detector.transform(rgb).unsqueeze(0).to(detector.device)
    with torch.no_grad():
        output = detector.model(tensor)
        confidence = torch.sigmoid(output).item()
    status = 'Vacant' if confidence > 0.5 else 'Occupied'
    print(f"{s['slot_id']}: Raw Sigmoid={confidence:.4f} -> {status}")
