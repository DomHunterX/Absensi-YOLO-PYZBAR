#!/usr/bin/env python3
"""
Script untuk migrasi kamera dari RTSP ke Webcam
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database_manager import DatabaseManager

def main():
    db = DatabaseManager()
    
    print("=" * 60)
    print("MIGRASI KAMERA: RTSP → WEBCAM")
    print("=" * 60)
    
    # Get existing cameras
    cameras = db._execute("SELECT * FROM camera_streams", fetch_all=True)
    
    if not cameras:
        print("\n❌ Tidak ada kamera yang terdaftar.")
        print("\nSilakan tambah webcam baru melalui dashboard:")
        print("1. Login ke http://localhost:5000")
        print("2. Klik menu 'Kelola Kamera'")
        print("3. Klik 'Tambah Webcam'")
        return
    
    print(f"\n📹 Ditemukan {len(cameras)} kamera:")
    for i, cam in enumerate(cameras, 1):
        print(f"\n{i}. ID: {cam['id']}")
        print(f"   Nama: {cam['name']}")
        print(f"   RTSP URL: {cam['rtsp_url']}")
        print(f"   Lokasi: {cam['location']}")
        print(f"   Status: {'Aktif' if cam['is_active'] else 'Nonaktif'}")
    
    print("\n" + "=" * 60)
    print("PILIHAN:")
    print("=" * 60)
    print("1. Hapus semua kamera lama (recommended)")
    print("2. Update kamera pertama ke Webcam 0")
    print("3. Batal")
    
    choice = input("\nPilih opsi (1/2/3): ").strip()
    
    if choice == "1":
        # Delete all cameras
        confirm = input("\n⚠️  Hapus SEMUA kamera? (yes/no): ").strip().lower()
        if confirm == "yes":
            db._execute("DELETE FROM camera_streams")
            print("\n✅ Semua kamera berhasil dihapus!")
            print("\nSekarang tambah webcam baru melalui dashboard:")
            print("1. Login ke http://localhost:5000")
            print("2. Klik menu 'Kelola Kamera'")
            print("3. Klik 'Tambah Webcam'")
            print("4. Pilih 'Webcam 0' dari dropdown")
            print("5. Isi nama dan lokasi")
            print("6. Simpan")
        else:
            print("\n❌ Dibatalkan.")
    
    elif choice == "2":
        # Update first camera to webcam 0
        cam = cameras[0]
        confirm = input(f"\n⚠️  Update kamera '{cam['name']}' ke Webcam 0? (yes/no): ").strip().lower()
        if confirm == "yes":
            db._execute("""
                UPDATE camera_streams 
                SET rtsp_url = '0', 
                    name = %s,
                    location = %s
                WHERE id = %s
            """, (cam['name'], cam['location'], cam['id']))
            print(f"\n✅ Kamera '{cam['name']}' berhasil diupdate ke Webcam 0!")
            print("\nSekarang restart server:")
            print("1. Stop server (Ctrl+C)")
            print("2. Jalankan: python run.py")
            print("3. Buka http://localhost:5000/monitor")
        else:
            print("\n❌ Dibatalkan.")
    
    else:
        print("\n❌ Dibatalkan.")

if __name__ == "__main__":
    main()
