# Panduan Training YOLO untuk Deteksi QR Code Paper

## 📋 Overview

Sistem telah diubah dari deteksi **person** menjadi deteksi **QR code paper**. Anda perlu melatih model YOLO custom untuk mendeteksi kertas yang berisi QR code.

## 🎯 Tujuan Training

Melatih YOLOv8 untuk mendeteksi objek **QR code paper** (kertas/kartu yang berisi QR code) dalam frame video CCTV.

---

## 📦 Persiapan Dataset

### 1. Kumpulkan Gambar

Kumpulkan minimal **500-1000 gambar** yang berisi:
- Kertas QR code dipegang oleh orang
- Kertas QR code di berbagai sudut
- Berbagai kondisi pencahayaan (terang, redup, backlight)
- Berbagai jarak (dekat, sedang, jauh)
- Berbagai background

**Tips:**
- Gunakan kamera CCTV yang sama dengan deployment
- Rekam video lalu extract frames
- Variasi pose: horizontal, vertikal, miring
- Variasi ukuran QR code

### 2. Labeling Dataset

Gunakan tools labeling seperti:
- **Roboflow** (recommended, cloud-based)
- **LabelImg** (desktop app)
- **CVAT** (web-based)

**Format label:** YOLO format (`.txt` file)

```
class_id center_x center_y width height
```

Contoh:
```
0 0.512 0.345 0.234 0.456
```

**Class:**
- `0` = qr_paper (satu class saja)

### 3. Struktur Dataset

```
dataset/
├── train/
│   ├── images/
│   │   ├── img001.jpg
│   │   ├── img002.jpg
│   │   └── ...
│   └── labels/
│       ├── img001.txt
│       ├── img002.txt
│       └── ...
├── valid/
│   ├── images/
│   └── labels/
└── data.yaml
```

### 4. File `data.yaml`

```yaml
path: /path/to/dataset  # root directory
train: train/images
val: valid/images

nc: 1  # number of classes
names: ['qr_paper']  # class names
```

---

## 🚀 Training YOLOv8

### 1. Install Dependencies

```bash
pip install ultralytics
pip install torch torchvision  # jika belum ada
```

### 2. Training Script

Buat file `train_qr_model.py`:

```python
from ultralytics import YOLO

# Load pretrained YOLOv8 model
model = YOLO('yolov8n.pt')  # nano model (fastest)
# atau: yolov8s.pt (small), yolov8m.pt (medium)

# Train model
results = model.train(
    data='dataset/data.yaml',
    epochs=100,              # jumlah epoch
    imgsz=640,               # ukuran gambar
    batch=16,                # batch size (sesuaikan dengan GPU)
    name='qr_paper_detector',
    patience=20,             # early stopping
    save=True,
    device=0,                # 0 untuk GPU, 'cpu' untuk CPU
    workers=8,
    augment=True,            # data augmentation
    hsv_h=0.015,             # hue augmentation
    hsv_s=0.7,               # saturation
    hsv_v=0.4,               # value
    degrees=10,              # rotation
    translate=0.1,           # translation
    scale=0.5,               # scaling
    flipud=0.0,              # flip up-down
    fliplr=0.5,              # flip left-right
    mosaic=1.0,              # mosaic augmentation
)

# Evaluate
metrics = model.val()

# Export model
model.export(format='onnx')  # optional
```

### 3. Jalankan Training

```bash
python train_qr_model.py
```

**Training akan menghasilkan:**
- `runs/detect/qr_paper_detector/weights/best.pt` - model terbaik
- `runs/detect/qr_paper_detector/weights/last.pt` - model terakhir

### 4. Monitoring Training

Training akan menampilkan:
- Loss (box, cls, dfl)
- Precision, Recall
- mAP50, mAP50-95

**Target metrics:**
- mAP50 > 0.85 (85%)
- Precision > 0.80
- Recall > 0.75

---

## 🔧 Integrasi ke Sistem

### 1. Copy Model

```bash
cp runs/detect/qr_paper_detector/weights/best.pt models/yolov8n.pt
```

### 2. Update Class ID

Edit `attendance_engine.py`:

```python
class YOLOProcessor:
    def __init__(self, model_path: Path):
        logger.info("Memuat model YOLO...")
        self.model = YOLO(str(model_path))
        # Update class ID sesuai hasil training
        self.qr_paper_class_id = 0  # Jika class qr_paper adalah class 0
        logger.info(f"Model YOLO siap. Target class: QR Paper (ID: {self.qr_paper_class_id})")
```

### 3. Test Model

```bash
python attendance_engine.py
```

---

## 📊 Tips Meningkatkan Akurasi

### 1. Data Augmentation
- Tambahkan variasi brightness/contrast
- Rotasi random
- Blur/noise
- Crop random

### 2. Hyperparameter Tuning

```python
# Coba berbagai kombinasi
model.train(
    lr0=0.01,           # initial learning rate
    lrf=0.01,           # final learning rate
    momentum=0.937,
    weight_decay=0.0005,
    warmup_epochs=3,
    box=7.5,            # box loss gain
    cls=0.5,            # cls loss gain
    dfl=1.5,            # dfl loss gain
)
```

### 3. Model Size

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| YOLOv8n | 3MB | Fastest | Good |
| YOLOv8s | 11MB | Fast | Better |
| YOLOv8m | 26MB | Medium | Best |

**Rekomendasi:** Mulai dengan `yolov8n`, jika akurasi kurang upgrade ke `yolov8s`.

---

## 🧪 Testing & Validation

### 1. Test pada Single Image

```python
from ultralytics import YOLO
import cv2

model = YOLO('models/yolov8n.pt')
img = cv2.imread('test_image.jpg')

results = model(img, conf=0.3)
for r in results:
    boxes = r.boxes
    for box in boxes:
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        conf = float(box.conf[0])
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(img, f'{conf:.2f}', (x1, y1-10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

cv2.imshow('Result', img)
cv2.waitKey(0)
```

### 2. Test pada Video

```python
model = YOLO('models/yolov8n.pt')
cap = cv2.VideoCapture('test_video.mp4')

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
    
    results = model(frame, conf=0.3)
    annotated = results[0].plot()
    
    cv2.imshow('Detection', annotated)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

---

## 🐛 Troubleshooting

### Model tidak mendeteksi QR paper

**Solusi:**
1. Turunkan confidence threshold: `YOLO_CONF_THRESHOLD = 0.2`
2. Tambah data training dengan variasi lebih banyak
3. Cek apakah class ID sudah benar
4. Pastikan model sudah di-load dengan benar

### False positive tinggi

**Solusi:**
1. Naikkan confidence threshold: `YOLO_CONF_THRESHOLD = 0.5`
2. Tambah negative samples (gambar tanpa QR paper)
3. Training lebih lama (lebih banyak epoch)

### Deteksi lambat

**Solusi:**
1. Gunakan model lebih kecil (yolov8n)
2. Resize frame sebelum inference
3. Skip frames (process setiap 2-3 frame)

---

## 📚 Resources

- [Ultralytics YOLOv8 Docs](https://docs.ultralytics.com/)
- [Roboflow - Dataset Labeling](https://roboflow.com/)
- [YOLOv8 Training Tutorial](https://docs.ultralytics.com/modes/train/)
- [Custom Dataset Guide](https://docs.ultralytics.com/datasets/)

---

## ✅ Checklist

- [ ] Kumpulkan 500+ gambar QR paper
- [ ] Label semua gambar dengan bounding box
- [ ] Split dataset (80% train, 20% validation)
- [ ] Buat file `data.yaml`
- [ ] Training model dengan YOLOv8
- [ ] Evaluasi metrics (mAP > 85%)
- [ ] Copy model ke `models/yolov8n.pt`
- [ ] Update `qr_paper_class_id` di code
- [ ] Test dengan kamera CCTV real
- [ ] Fine-tune threshold jika perlu

---

## 💡 Catatan Penting

1. **Kualitas data > Kuantitas data**
   - 500 gambar berkualitas > 2000 gambar asal-asalan

2. **Variasi adalah kunci**
   - Berbagai sudut, jarak, pencahayaan, background

3. **Test di kondisi real**
   - Test dengan kamera CCTV yang akan dipakai
   - Test di lokasi deployment sebenarnya

4. **Iterasi**
   - Training → Test → Kumpulkan data error → Re-train

Good luck dengan training! 🚀
