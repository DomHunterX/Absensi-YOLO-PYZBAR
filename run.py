"""
SIABSEN - Sistem Absensi Cerdas
Main entry point untuk menjalankan aplikasi
"""

import sys
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.api_server import app

if __name__ == '__main__':
    print("=" * 60)
    print("  SIABSEN — Sistem Absensi Cerdas v2.4")
    print("  Starting Flask API Server...")
    print("=" * 60)
    print()
    print("Server akan berjalan di:")
    print("  - Login:     http://localhost:5000/login")
    print("  - Dashboard: http://localhost:5000")
    print("  - Mahasiswa: http://localhost:5000/mahasiswa")
    print("  - Monitor:   http://localhost:5000/monitor")
    print()
    print("Tekan Ctrl+C untuk menghentikan server")
    print("=" * 60)
    print()
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        threaded=True
    )
