@echo off
chcp 65001 >nul

:menu
cls
echo ==========================================
echo       Google Apps Script (GAS) 部署工具
echo ==========================================
echo.
echo 目前工作目錄: %CD%
echo.
echo 請選擇部署環境：
echo [1] 測試版 (Beta)
echo [2] 正式版 (Production)
echo [3] 結束離開
echo.
set /p choice="請輸入選項 [1-3]: "

if "%choice%"=="1" goto deploy_beta
if "%choice%"=="2" goto deploy_prod
if "%choice%"=="3" goto end
goto invalid_choice

:deploy_beta
echo.
echo 正在準備部署至【測試版】...
cd /d "%~dp0gas"
(
echo {
echo   "scriptId": "1ZZH4HaFEEjYOqtS1X-FcD5r5pAGMBDDMrRO0aZI62-eSeFtV0QxlGNek",
echo   "rootDir": "."
echo }
) > .clasp.json
echo .clasp.json 已更新為【測試版】。
pause

echo 正在執行 clasp push...
call clasp push
if %errorlevel% neq 0 goto error
echo.
echo clasp push 完成！
pause

echo 正在執行 clasp deploy...
call clasp deploy --deploymentId AKfycbyhepYA8SA-M2Ulil9itz3dOeKNoBxfPLPUSllt78UAujASG7UpQUPwm02ZbMJzXFKXtg
if %errorlevel% neq 0 goto error
echo.
echo clasp deploy 完成！
pause

echo.
echo 測試版部署成功！
cd /d "%~dp0"
pause
goto menu

:deploy_prod
echo.
echo 正在準備部署至【正式版】...
cd /d "%~dp0gas"
(
echo {
echo   "scriptId": "1EjTEwRUcs9rG0XpGHHM8C-NjhnyRNC8UtTf127HqIwtjZ_lU-vfAZWra",
echo   "rootDir": "."
echo }
) > .clasp.json
echo .clasp.json 已更新為【正式版】。
pause

echo 正在執行 clasp push...
call clasp push
if %errorlevel% neq 0 goto error
echo.
echo clasp push 完成！
pause

echo 正在執行 clasp deploy...
call clasp deploy --deploymentId AKfycbxkAXCtVguzGYAQtnBwnghnTklw4itP7sFEyITcRJpFvTcnmTG6XOKJElRlfPosf3CV
if %errorlevel% neq 0 goto error
echo.
echo clasp deploy 完成！
pause

echo.
echo 正式版部署成功！
cd /d "%~dp0"
pause
goto menu

:invalid_choice
echo.
echo 無效的選項，請重新選擇。
pause
goto menu

:error
echo.
echo 部署過程中出錯，請檢查上方錯誤訊息。
cd /d "%~dp0"
pause
goto menu

:end
cd /d "%~dp0"
echo.
echo 感謝使用，再見！
pause
