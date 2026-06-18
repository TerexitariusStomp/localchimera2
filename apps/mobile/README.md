# Mobile Apps

Capacitor-wrapped mobile apps for iOS and Android. Each phone is a standalone Chimera node.

## Build

```bash
cd qvac/frontend
npm install && npm run build
npx cap sync

# iOS
npx cap open ios
# Xcode → Product → Archive → Distribute App

# Android
npx cap open android
# Android Studio → Build → Generate Signed Bundle
```

## Planned

- [ ] iOS App Store submission
- [ ] Android Play Store submission
- [ ] Push notifications for mining status
- [ ] Background mining with battery-aware scheduling
