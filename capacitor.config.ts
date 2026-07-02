import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.github.apachedragonfly.fourleaf',
  appName: '4leaf',
  webDir: 'dist',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#f7f3e8',
  },
}

export default config
