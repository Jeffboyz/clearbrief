// Runtime configuration for ClearBrief.
//
// The defaults below are the real Firebase web config for the
// "ClearBrief Hybrid AI" project. Parent setup options:
// 1. Use the built-in defaults as-is.
// 2. Or define window.CLEARBRIEF_FIREBASE_CONFIG before loading src/app.js
//    to override any value at runtime.
// 3. Or create src/config.local.js and import it before app.js in a deployment branch.
//
// Firebase web config values are identifiers, not server secrets.

const runtimeConfig = typeof window !== 'undefined' ? window.CLEARBRIEF_FIREBASE_CONFIG : undefined;

// Real Firebase web config for the "ClearBrief Hybrid AI" project
// (projectId: clearbrief-hybrid-ai), registered in the Firebase Console and
// verified by the parent agent. These are public web-app identifiers, not
// secrets. A runtime override via window.CLEARBRIEF_FIREBASE_CONFIG still
// takes precedence when present.

export const firebaseConfig = {
  apiKey: runtimeConfig?.apiKey || 'AIzaSyDVi0cMSBv1uh2JFnjiLp5nJETJDclQOps',
  authDomain: runtimeConfig?.authDomain || 'clearbrief-hybrid-ai.firebaseapp.com',
  projectId: runtimeConfig?.projectId || 'clearbrief-hybrid-ai',
  storageBucket: runtimeConfig?.storageBucket || 'clearbrief-hybrid-ai.firebasestorage.app',
  messagingSenderId: runtimeConfig?.messagingSenderId || '547304287461',
  appId: runtimeConfig?.appId || '1:547304287461:web:cea73e0b737281a0eaf80c',
  measurementId: runtimeConfig?.measurementId || ''
};

export const aiConfig = {
  // Keep empty to use the Firebase hybrid sample's default cloud fallback model,
  // or set a currently available Gemini model from the Firebase Console.
  cloudModel: runtimeConfig?.cloudModel || '',
  fallbackCloudModel: 'gemini-3.5-flash',
  firebaseSdkVersion: '12.5.0',
  appCheck: {
    debug: Boolean(runtimeConfig?.appCheckDebug),
    debugToken: runtimeConfig?.appCheckDebugToken || '',
    // Public reCAPTCHA Enterprise site key for Firebase App Check, registered
    // in the Firebase Console for the "ClearBrief Web" app with the
    // production domain jeffboyz.github.io. Site keys are public
    // identifiers, not secrets. A runtime override still takes precedence.
    recaptchaEnterpriseSiteKey: runtimeConfig?.recaptchaEnterpriseSiteKey || '6LfrujAuAAAAAOLerVfj-3q-A00ENnFgQGpsHIX7'
  }
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId &&
    !Object.values(firebaseConfig).some((value) => typeof value === 'string' && value.startsWith('REPLACE_WITH'))
  );
}
