import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.gemini.taggerpro',
  appName: 'Gemini Tagger Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
