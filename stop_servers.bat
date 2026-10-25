
@echo off
echo Stopping Django and frontend development servers...

:: Stop Django server on port 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul

:: Stop frontend dev server on port 5173
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a 2>nul

echo Servers stopped.
pause
