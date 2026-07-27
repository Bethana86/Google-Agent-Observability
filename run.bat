@echo off
title Google ADK Observability Console
echo =========================================================
echo Google Native ADK & OpenTelemetry Observability Console
echo =========================================================
echo.
echo Launching default web browser to http://127.0.0.1:8000 ...
start "" "http://127.0.0.1:8000"
echo.
echo Starting FastAPI server on port 8000...
py backend/main.py
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Failed to start the server. Make sure Python is in your PATH.
    pause
)
