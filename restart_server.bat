@echo off
echo ========================================
echo   SIABSEN - Restart Server
echo ========================================
echo.

echo [1/3] Stopping any running Python processes...
taskkill /F /IM python.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/3] Clearing browser cache instructions...
echo.
echo IMPORTANT: Clear your browser cache!
echo.
echo Chrome/Edge: Press Ctrl+Shift+Delete
echo   - Select "Cached images and files"
echo   - Click "Clear data"
echo.
echo OR: Hard refresh the page with Ctrl+F5
echo.

echo [3/3] Starting API server...
echo.
start cmd /k "python api_server.py"

echo.
echo ========================================
echo Server started!
echo.
echo Next steps:
echo 1. Clear browser cache (Ctrl+Shift+Delete)
echo 2. Go to: http://localhost:5000/login
echo 3. Login with mahasiswa account
echo 4. Check browser console (F12) for logs
echo ========================================
echo.
pause
