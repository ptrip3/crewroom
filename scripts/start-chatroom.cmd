@echo off
rem Starts the crewroom hub in the background (if it is not already running) and opens the chatroom.
rem A hub that finds its port taken just exits, so running this twice is harmless.
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process node -ArgumentList '\"%~dp0..\src\hub.js\"' -WorkingDirectory '%~dp0..' -WindowStyle Hidden"
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
