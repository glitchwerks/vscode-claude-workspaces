@echo off
setlocal DisableDelayedExpansion
echo CW_READY
:read
set "CW_ECHO_INPUT="
set /p CW_ECHO_INPUT=
if "%CW_ECHO_INPUT%"=="QUIT" exit /b 0
echo CW_RESULT_%CW_ECHO_INPUT%
goto read
