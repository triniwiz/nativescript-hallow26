import { NativeScriptConfig } from '@nativescript/core';

export default {
  id: 'io.github.triniwiz.hallow',
  appPath: 'src',
  appResourcesPath: 'App_Resources',
  android: {
    v8Flags: '--expose_gc --allow-natives-syntax --turbo-fast-api-calls',
    gcThrottleTime: 1000,
    markingMode: 'none'
  },
  bundler: 'vite',
  bundlerConfigPath: 'vite.config.mts',
} as NativeScriptConfig;