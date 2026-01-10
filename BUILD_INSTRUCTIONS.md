
# Expo Build Instructions

This document provides the instructions to build the Livechat Consultant Panel app for Android and iOS using Expo.

## Prerequisites

- Node.js and npm installed
- Expo CLI installed (`npm install -g expo-cli`)
- EAS CLI installed (`npm install -g eas-cli`)
- An Expo account

## Configuration

1. **Login to your Expo account:**

   ```bash
   expo login
   ```

2. **Configure the project for EAS Build:**

   ```bash
   eas build:configure
   ```

   This will create an `eas.json` file in your project root. You can customize the build profiles in this file.

## Building for Android

To build the app for Android, run the following command:

```bash
eas build -p android --profile preview
```

This will create a development build that you can install on your Android device or emulator.

For a production build, you can create a new profile in `eas.json` and run:

```bash
eas build -p android --profile production
```

## Building for iOS

To build the app for iOS, run the following command:

```bash
eas build -p ios --profile preview
```

This will create a development build that you can install on your iOS device or simulator.

For a production build, you can create a new profile in `eas.json` and run:

```bash
eas build -p ios --profile production
```

## Submitting to App Stores

Once you have a production build, you can submit it to the Google Play Store and Apple App Store using the EAS CLI.

```bash
eas submit -p android
```

```bash
eas submit -p ios
```
