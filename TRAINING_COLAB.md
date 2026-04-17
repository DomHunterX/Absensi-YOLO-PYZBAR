# YOLOv8 Training Guide — Google Colab

---

## 1. Cek Koneksi GPU

```bash
!nvidia-smi
```

---

## 2. Install Ultralytics

```bash
!pip install ultralytics==8.0.196
```

```python
from IPython import display
display.clear_output()

import ultralytics
ultralytics.checks()
```

---

## 3. Ultralytics CLI Basic

```
yolo task=detect     mode=train    model=yolov8n.yaml       args...
          classify        predict       yolov8n-cls.yaml     args...
          segment         val           yolov8n-seg.yaml     args...
                          export        yolov8n.pt           format=onnx  args...
```

---

## 4. Import Dataset dari Jupyter (Roboflow)

Import dataset YOLO melalui kode yang tersedia di Jupyter Roboflow.

---

## 5. Install Dataset

```bash
!pip install roboflow
```

> **Catatan:** Sesuaikan dengan kode Jupyter Roboflow yang diberikan pada project Anda.

---

## 6. Training Model

```bash
%cd /content
!yolo task=detect mode=train model=yolov8s.pt \
    data=/content/QR-Paper-Detection-1/data.yaml \
    epochs=25 imgsz=640 plots=True
```

---

## 7. Cek Hasil Folder Training

```bash
!ls /content/runs/detect/train/
```

---

## 8. Cek Graph Training

```python
from IPython.display import display, Image

# Tampilkan gambar hasil evaluasi training
display(Image(filename='/content/runs/detect/train/results.png', width=600))
```

---

## 9. Cek Hasil Gambar Training Batch 0

```python
%cd /content
Image(filename='/content/runs/detect/train/val_batch0_pred.jpg', width=600)
```

---

## 10. Validasi Dataset

```bash
%cd /content
!yolo task=detect mode=val \
    model=/content/runs/detect/train/weights/best.pt \
    data=/content/QR-Paper-Detection-1/data.yaml
```

---

## 11. Predict Dataset

```bash
%cd /content
!yolo task=detect mode=predict \
    model=/content/runs/detect/train/weights/best.pt \
    conf=0.4 \
    source=/content/QR-Paper-Detection-1/test/images \
    save=True
```

---

## 12. Cek Gambar Hasil Prediksi

```python
import os
import glob
import shutil
from IPython.display import Image, display
from google.colab import files
from ultralytics import YOLO

# Tentukan base path tempat folder hasil prediksi disimpan
base_path = '/content/runs/detect/'

# Cari semua subfolder yang berawalan kata 'predict'
subfolders = [
    os.path.join(base_path, d) for d in os.listdir(base_path)
    if os.path.isdir(os.path.join(base_path, d)) and d.startswith('predict')
]

# Cari folder prediksi yang paling baru dibuat
latest_folder = max(subfolders, key=os.path.getmtime)

# Ambil 3 gambar pertama dari folder terbaru
image_paths = glob.glob(f'{latest_folder}/*.jpg')[:3]

# Tampilkan masing-masing gambar
for image_path in image_paths:
    display(Image(filename=image_path, width=600))
    print("\n")
```

---

## 13. Export Model ke Format ONNX

```python
import shutil
from google.colab import files
from ultralytics import YOLO

model_path    = "/content/runs/detect/train/weights/best.pt"
onnx_path     = "/content/runs/detect/train/weights/best.onnx"
download_path = "/content/qr_paper_yolov8.onnx"

print("Mulai mengekspor model ke format ONNX...")
model = YOLO(model_path)
model.export(format="onnx", opset=12, imgsz=[640, 640])  # Samakan imgsz dengan saat training

# Copy dan download file ONNX
print("Menyiapkan file untuk didownload...")
shutil.copy(onnx_path, download_path)
files.download(download_path)
```

---

## 14. Download YOLO Model (ONNX)

```python
from google.colab import files
import shutil

shutil.copy("/content/runs/detect/train/weights/best.onnx", "/content/yolov8.onnx")
files.download("/content/yolov8.onnx")
```

---

## 15. Download best.pt

```python
from google.colab import files

files.download("/content/runs/detect/train/weights/best.pt")
```
