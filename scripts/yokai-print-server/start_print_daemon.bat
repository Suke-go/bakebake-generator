@echo off
REM ========================================
REM  BAKEBAKE_XR Print Daemon Auto-Restart
REM  Restarts the daemon on crash/exit
REM ========================================

cd /d "%~dp0"

echo [PrintDaemon] Starting auto-restart wrapper...
echo [PrintDaemon] Press Ctrl+C to stop.
echo.

:loop
echo [PrintDaemon] Starting daemon at %TIME%...
python print_daemon.py --both
echo.
echo [PrintDaemon] Process exited at %TIME%. Restarting in 3 seconds...
echo [PrintDaemon] Press Ctrl+C now to stop.
timeout /t 3 /nobreak >nul
goto loop
