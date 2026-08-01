@echo off
setlocal
cd /d "%~dp0"
title Matrix // Next-Gen - Release Build
color 0A
echo ==================================================
echo   MATRIX // NEXT-GEN  -  Verteilbaren Build erzeugen
echo ==================================================
echo (self-contained: laeuft auf Ziel-PCs OHNE .NET-Installation)
echo.

where npm >nul 2>nul || (echo FEHLER: Node.js/npm fehlt. & pause & exit /b 1)
where dotnet >nul 2>nul || (echo FEHLER: .NET SDK fehlt. & pause & exit /b 1)

if not exist "node_modules" (
    echo [1/3] Installiere Abhaengigkeiten...
    call npm install || goto :err
)
echo [2/3] Baue Frontend...
call npm run build || goto :err

echo [3/3] Publiziere self-contained Single-File EXE...
dotnet publish "desktop\MatrixNG.csproj" -c Release -r win-x64 --self-contained true ^
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true ^
    -p:EnableCompressionInSingleFile=true -o "release" || goto :err

echo.
echo ============ FERTIG ============
echo Distributable liegt in:  %cd%\release\
echo   - MatrixNG.exe   (Doppelklick - keine .NET-Installation noetig)
echo   - wwwroot\       (muss NEBEN der .exe bleiben)
echo.
echo Bildschirmschoner: MatrixNG.exe in MatrixNG.scr umbenennen.
echo Zum Verteilen: den Ordner "release" als ZIP packen.
echo.
pause
exit /b 0

:err
echo.
echo *** FEHLER beim Release-Build - siehe oben. ***
pause
exit /b 1
