title BookBot 08 — close this window to stop server
@echo off
call .venv\Scripts\activate.bat
start /b cmd /c "timeout /t 2 >nul && start http://localhost:8000/"
"%~dp0.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
pause
