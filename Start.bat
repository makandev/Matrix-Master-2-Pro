@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Matrix // Next-Gen
color 0A
set "EXE=desktop\bin\Release\net10.0-windows\MatrixNG.exe"

echo ==================================================
echo     MATRIX // NEXT-GEN   -   All-in-One Start
echo ==================================================
echo.

REM --- Schon gebaut? Dann einfach starten (schnell). ---
if exist "%EXE%" if /I not "%~1"=="rebuild" (
    echo Starte App...
    start "" "%EXE%"
    exit /b 0
)

echo Erststart oder Rebuild - das dauert einmalig ca. 1-2 Minuten.
echo ^(Spaeter startet die App sofort.^)
echo.

REM --- Voraussetzungen pruefen ---
where npm >nul 2>nul || (echo FEHLER: Node.js/npm nicht gefunden. Bitte Node.js installieren: https://nodejs.org & pause & exit /b 1)
where dotnet >nul 2>nul || (echo FEHLER: .NET SDK nicht gefunden. Bitte .NET 10 SDK installieren. & pause & exit /b 1)

REM --- 1) Abhaengigkeiten ---
if not exist "node_modules" (
    echo [1/3] Installiere Abhaengigkeiten...
    call npm install || goto :err
) else (
    echo [1/3] Abhaengigkeiten vorhanden - ok.
)

REM --- 2) Frontend bauen ---
echo [2/3] Baue Frontend...
call npm run build || goto :err

REM --- 3) Windows-App bauen ---
echo [3/3] Baue Windows-App...
dotnet build "desktop\MatrixNG.csproj" -c Release -v minimal || goto :err

echo.
echo Fertig! Starte Matrix // Next-Gen...
start "" "%EXE%"
exit /b 0

:err
echo.
echo *** FEHLER beim Build - siehe Meldungen oben. ***
pause
exit /b 1
