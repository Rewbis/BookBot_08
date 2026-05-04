@echo off
call .venv\Scripts\activate.bat
"%~dp0.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
pause
