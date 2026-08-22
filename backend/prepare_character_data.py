import os
import cv2
import pandas as pd
import numpy as np

def extract_character_contours(img, expected_len):
    best_candidates = []
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h_img, w_img = img.shape[:2]
    
    # Try different thresholding methods
    methods = [
        lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2),
        lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 15, 3),
        lambda g: cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 11, 2),
        lambda g: cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1],
    ]
    
    for method in methods:
        thresh = method(gray)
        
        # Optional: morph open
        kernel = np.ones((3, 3), np.uint8)
        thresh_morph = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)
        
        for t in [thresh, thresh_morph]:
            contours, _ = cv2.findContours(t, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            
            char_boxes = []
            for c in contours:
                x, y, w, h = cv2.boundingRect(c)
                aspect_ratio = w / float(h) if h > 0 else 0
                
                # Characters span at least 15% of plate height and are not extremely wide
                if 0.1 < aspect_ratio < 1.5 and h > h_img * 0.15:
                    if x > 0.03 * w_img and (x + w) < 0.97 * w_img:
                        char_boxes.append((x, y, w, h))
                        
            # Remove inside boxes
            final_boxes = []
            for i, box1 in enumerate(char_boxes):
                is_inside = False
                for j, box2 in enumerate(char_boxes):
                    if i != j:
                        # if box1 is completely inside box2
                        if box1[0] >= box2[0] and box1[1] >= box2[1] and \
                           (box1[0] + box1[2]) <= (box2[0] + box2[2]) and \
                           (box1[1] + box1[3]) <= (box2[1] + box2[3]):
                            is_inside = True
                            break
                if not is_inside:
                    final_boxes.append(box1)
                    
            # Filter based on median height to remove outliers
            if len(final_boxes) > 0:
                heights = [b[3] for b in final_boxes]
                median_h = np.median(heights)
                
                # Characters should be roughly the same height
                filtered_boxes = [b for b in final_boxes if 0.7 * median_h < b[3] < 1.3 * median_h]
            else:
                filtered_boxes = []
                    
            if expected_len != -1 and len(filtered_boxes) == expected_len:
                filtered_boxes = sorted(filtered_boxes, key=lambda b: b[0])
                return filtered_boxes
            elif expected_len == -1:
                # Keep track of best candidate for test time (allow 5 to 12 characters for Indian/EU/US plates)
                if len(filtered_boxes) >= 5 and len(filtered_boxes) <= 12:
                    best_candidates.append(filtered_boxes)
                    
    if expected_len == -1 and best_candidates:
        # Pick the candidate that found the most valid characters (up to 12)
        best_candidate = max(best_candidates, key=len)
        return sorted(best_candidate, key=lambda b: b[0])
        
    return []

def prepare_data():
    csv_path = 'Licplatesrecognition_train.csv'
    img_dir = 'Licplatesrecognition_train/license_plates_recognition_train'
    out_dir = 'character_dataset/train'
    
    df = pd.read_csv(csv_path)
    
    os.makedirs(out_dir, exist_ok=True)
    
    success_count = 0
    fail_count = 0
    
    for index, row in df.iterrows():
        img_id = row['img_id']
        text = str(row['text'])
        
        img_path = os.path.join(img_dir, img_id)
        if not os.path.exists(img_path):
            continue
            
        img = cv2.imread(img_path)
        if img is None:
            continue
            
        boxes = extract_character_contours(img, len(text))
        
        # We only use images where the number of detected contours matches the text length
        if len(boxes) == len(text):
            for i, (x, y, w, h) in enumerate(boxes):
                char = text[i]
                
                # Expand box slightly
                pad = 2
                x1 = max(0, x - pad)
                y1 = max(0, y - pad)
                x2 = min(img.shape[1], x + w + pad)
                y2 = min(img.shape[0], y + h + pad)
                
                char_img = img[y1:y2, x1:x2]
                
                char_dir = os.path.join(out_dir, char)
                os.makedirs(char_dir, exist_ok=True)
                
                save_path = os.path.join(char_dir, f"{os.path.splitext(img_id)[0]}_{i}.jpg")
                cv2.imwrite(save_path, char_img)
            success_count += 1
        else:
            fail_count += 1
            
    print(f"Extraction finished. Success: {success_count}, Failed to align: {fail_count}")

if __name__ == '__main__':
    prepare_data()
