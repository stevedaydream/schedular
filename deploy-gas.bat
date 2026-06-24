@echo off

:menu
cls
echo ==========================================
echo       Google Apps Script (GAS) Deployer
echo ==========================================
echo.
echo Current Directory: %CD%
echo.
echo Select deployment environment:
echo [1] Beta (Testing)
echo [2] Production
echo [3] Exit
echo.
set /p choice="Enter choice [1-3]: "

if "%choice%"=="1" goto deploy_beta
if "%choice%"=="2" goto deploy_prod
if "%choice%"=="3" goto end
goto invalid_choice

:deploy_beta
echo.
echo Preparing deployment to [Beta]...
cd /d "%~dp0gas"
(
echo {
echo   "scriptId": "1ZZH4HaFEEjYOqtS1X-FcD5r5pAGMBDDMrRO0aZI62-eSeFtV0QxlGNek",
echo   "rootDir": "."
echo }
) > .clasp.json
echo .clasp.json updated for [Beta].
pause

echo Running clasp push...
call clasp push
if %errorlevel% neq 0 goto error
echo.
echo clasp push completed!
pause

echo Running clasp deploy...
call clasp deploy --deploymentId AKfycbyhepYA8SA-M2Ulil9itz3dOeKNoBxfPLPUSllt78UAujASG7UpQUPwm02ZbMJzXFKXtg
if %errorlevel% neq 0 goto error
echo.
echo clasp deploy completed!
pause

echo.
echo Beta deployment successful!
cd /d "%~dp0"
pause
goto menu

:deploy_prod
echo.
echo Preparing deployment to [Production]...
cd /d "%~dp0gas"
(
echo {
echo   "scriptId": "1EjTEwRUcs9rG0XpGHHM8C-NjhnyRNC8UtTf127HqIwtjZ_lU-vfAZWra",
echo   "rootDir": "."
echo }
) > .clasp.json
echo .clasp.json updated for [Production].
pause

echo Running clasp push...
call clasp push
if %errorlevel% neq 0 goto error
echo.
echo clasp push completed!
pause

echo Running clasp deploy...
call clasp deploy --deploymentId AKfycbxkAXCtVguzGYAQtnBwnghnTklw4itP7sFEyITcRJpFvTcnmTG6XOKJElRlfPosf3CV
if %errorlevel% neq 0 goto error
echo.
echo clasp deploy completed!
pause

echo.
echo Production deployment successful!
cd /d "%~dp0"
pause
goto menu

:invalid_choice
echo.
echo Invalid choice. Please try again.
pause
goto menu

:error
echo.
echo An error occurred during deployment. Please check the messages above.
cd /d "%~dp0"
pause
goto menu

:end
cd /d "%~dp0"
echo.
echo Thank you for using! Goodbye.
pause
