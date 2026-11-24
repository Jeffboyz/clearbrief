import { aiConfig, firebaseConfig, isFirebaseConfigured } from './config.js';
import { parseBriefResponse } from './brief.js';

let firebasePromise;
let modelCache = new Map();

const ROUTE_MODES = {
  hybrid: 'PREFER_ON_DEVICE',
  device: 'ONLY_ON_DEVICE',
  'cloud-first': 'PREFER_IN_CLOUD',
  cloud: 'ONLY_IN_CLOUD'
};

function sdkUrl(moduleName) {
  return `https://www.gstatic.com/firebasejs/${aiConfig.firebaseSdkVersion}/${moduleName}`;
}

async function loadFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured yet. Add the web app config from the Firebase Console.');
  }

  if (!firebasePromise) {
    firebasePromise = (async () => {
      const appModule = await import(sdkUrl('firebase-app.js'));
      const aiModule = await import(sdkUrl('firebase-ai.js'));
      const app = appModule.initializeApp(firebaseConfig);

      let appCheckStatus = 'not-initialized';
      try {
        const appCheckModule = await import(sdkUrl('firebase-app-check.js'));
        const { debug, debugToken, recaptchaEnterpriseSiteKey } = aiConfig.appCheck;

        if (debug) {
          self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
          const provider = new appCheckModule.DebugProvider();
          appCheckModule.initializeAppCheck(app, {
            provider,
            isTokenAutoRefreshEnabled: true
          });
          appCheckStatus = 'debug-provider';
        } else if (recaptchaEnterpriseSiteKey) {
          const provider = new appCheckModule.ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey);
          appCheckModule.initializeAppCheck(app, {
            provider,
            isTokenAutoRefreshEnabled: true
          });
          appCheckStatus = 'recaptcha-enterprise';
        } else {
          appCheckStatus = 'missing-provider-key';
        }
      } catch (error) {
        appCheckStatus = `failed: ${error.message}`;
      }

      const ai = aiModule.getAI(app, { backend: new aiModule.GoogleAIBackend() });
      return { ai, aiModule, appCheckStatus };
    })();
  }

  return firebasePromise;
}

function buildBriefSchema(Schema) {
  const actionSchema = Schema.object({
    properties: {
      task: Schema.string(),
      owner: Schema.string(),
      due: Schema.string(),
      priority: Schema.enumString({ enum: ['High', 'Medium', 'Low'] })
    }
  });

  const flashcardSchema = Schema.object({
    properties: {
      front: Schema.string(),
      back: Schema.string()
    }
  });

  return Schema.object({
    properties: {
      headline: Schema.string(),
      summary: Schema.string(),
      decisions: Schema.array({ items: Schema.string() }),
      actions: Schema.array({ items: actionSchema }),
      risks: Schema.array({ items: Schema.string() }),
      questions: Schema.array({ items: Schema.string() }),
      evidence: Schema.array({ items: Schema.string() }),
      nextSteps: Schema.array({ items: Schema.string() }),
      flashcards: Schema.array({ items: flashcardSchema }),
      confidenceNote: Schema.string()
    }
  });
}

async function getModel(route, onProgress) {
  const cacheKey = `${route}:${aiConfig.cloudModel || 'default'}`;
  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey);

  const { ai, aiModule, appCheckStatus } = await loadFirebase();
  const { InferenceMode, Schema } = aiModule;
  const modeName = ROUTE_MODES[route] || ROUTE_MODES.hybrid;
  const schema = buildBriefSchema(Schema);
  const cloudModel = aiConfig.cloudModel || aiConfig.fallbackCloudModel;

  let model;
  if (route === 'cloud') {
    model = aiModule.getGenerativeModel(ai, {
      model: cloudModel,
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    });
  } else {
    model = aiModule.getGenerativeModel(ai, {
      mode: InferenceMode[modeName],
      inCloudParams: {
        model: cloudModel,
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      },
      onDeviceParams: {
        promptOptions: {
          responseConstraint: schema
        }
      }
    });
  }

  if (route !== 'cloud' && typeof model.initializeDeviceModel === 'function') {
    await model.initializeDeviceModel((value) => {
      if (typeof value === 'number') onProgress?.(value);
    });
  }

  const entry = { model, appCheckStatus };
  modelCache.set(cacheKey, entry);
  return entry;
}

export async function getFirebaseStatus() {
  if (!isFirebaseConfigured()) {
    return { configured: false, appCheckStatus: 'waiting-for-config' };
  }

  const { appCheckStatus } = await loadFirebase();
  return { configured: true, appCheckStatus };
}

export async function getOnDeviceAvailability() {
  if (!('LanguageModel' in window)) {
    return { available: false, status: 'unsupported', label: 'Chrome Prompt API not exposed' };
  }

  try {
    const status = await window.LanguageModel.availability();
    return {
      available: status === 'available',
      status,
      label: status === 'available'
        ? 'Gemini Nano available on this device'
        : `Gemini Nano status: ${status}`
    };
  } catch (error) {
    return { available: false, status: 'error', label: `Prompt API check failed: ${error.message}` };
  }
}

export async function prepareOnDeviceModel(onProgress) {
  const { model } = await getModel('hybrid', onProgress);
  return model;
}

export async function generateWithFirebase({ prompt, route, onProgress }) {
  const started = performance.now();
  const { model, appCheckStatus } = await getModel(route, onProgress);
  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  const inferenceSource = response.inferenceSource || result.inferenceSource || 'UNKNOWN';

  return {
    brief: parseBriefResponse(text),
    source: inferenceSource,
    appCheckStatus,
    latencyMs: Math.round(performance.now() - started),
    rawText: text
  };
}
