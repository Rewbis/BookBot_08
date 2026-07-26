title BookBot 08 — close this window to stop server
@echo off
echo.
echo  BookBot 08 — startup checklist
echo  ================================
echo  [1] Ollama must be running BEFORE this server starts.
echo      If you see a red dot in the UI, open Ollama and wait
echo      for it to load, then the dot will turn green on its own.
echo  [2] The browser opens automatically after 2 seconds.
echo  [3] Close THIS window to stop the server.
echo.
call .venv\Scripts\activate.bat
start /b cmd /c "timeout /t 2 >nul && start http://localhost:8000/"
"%~dp0.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
pause
