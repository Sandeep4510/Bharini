
@echo off
cd /d "C:\Users\ASUS\PycharmProjects\Bharini"

npx concurrently -k -n DJANGO,FRONTEND -c blue,green ^
  "cd backend && python manage.py runserver" ^
  "cd apps/web && npm run dev"
