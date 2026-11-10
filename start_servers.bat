
@echo off
cd /d "C:\Users\ASUS\PycharmProjects\Bharini"

npx concurrently -k -n DJANGO,FRONTEND -c blue,green ^
  "cd backend && ..\venv\Scripts\python.exe manage.py runserver 8000" ^
  "cd apps/web && npm run dev"
