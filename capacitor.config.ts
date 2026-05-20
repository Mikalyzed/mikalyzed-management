import type { CapacitorConfig } from '@capacitor/cli'

/**
 * DEV MODE — pointed at local Next.js dev server for fast iteration.
 * Every code change hot-reloads in the iOS Simulator without redeploying.
 *
 * To ship to TestFlight / production: change `server.url` back to the
 * Vercel URL (https://mikalyzed-management.vercel.app), set cleartext: false,
 * then run `npm run ios:sync` and rebuild.
 */
const config: CapacitorConfig = {
  appId: 'com.mikalyzed.management',
  appName: 'Mikalyzed',
  webDir: 'public',
  server: {
    url: 'http://localhost:3000',
    cleartext: true,  // required for plain HTTP localhost
    allowNavigation: [
      'localhost',
      '*.vercel.app',
      'mikalyzed-management.vercel.app',
    ],
  },
  ios: {
    // 'never' = WebView extends edge-to-edge under notch + home indicator.
    // Our CSS safe-area-inset padding handles content positioning.
    contentInset: 'never',
    backgroundColor: '#141414',
    scheme: 'Mikalyzed',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#1a1a1a',
      androidScaleType: 'CENTER_CROP',
      iosSpinnerStyle: 'small',
      spinnerColor: '#dffd6e',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a1a',
    },
    Keyboard: {
      resize: 'native',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
