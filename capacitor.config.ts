import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Server URL is controlled by CAP_ENV:
 *   - CAP_ENV=dev  → http://localhost:3000 (fast iteration in Simulator)
 *   - CAP_ENV=prod → Vercel URL (for TestFlight builds)
 *
 * Use `npm run cap:dev` or `npm run cap:prod` to sync. Never archive without
 * running cap:prod first — testers would get a broken localhost build.
 */
const isDev = process.env.CAP_ENV !== 'prod'

const config: CapacitorConfig = {
  appId: 'com.mikalyzed.mgmt',
  appName: 'Mikalyzed',
  webDir: 'public',
  server: {
    url: isDev ? 'http://localhost:3000' : 'https://mikalyzed-management.vercel.app',
    cleartext: isDev,
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
