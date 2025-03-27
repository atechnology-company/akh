@echo off
echo Building SvelteKit app...
call npm run build

echo Copying SvelteKit build to mobile app...
if not exist "app\www" mkdir app\www
xcopy /E /Y "build\*" "app\www\"

echo Building Android APK...
call ns build android --release
echo APK build completed! Check platforms/android/app/build/outputs/apk/release 