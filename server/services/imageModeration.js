const MODERATION_ENDPOINT = 'https://api.sightengine.com/1.0/check.json';
const MODERATION_MODELS = 'nudity-2.1,gore-2.0';
const MODERATION_TIMEOUT_MS = 20000;

let missingCredentialsWarningShown = false;

function isConfigured() {
  return Boolean(
    process.env.SIGHTENGINE_API_USER &&
    process.env.SIGHTENGINE_API_SECRET
  );
}

function evaluateModeration(result) {
  const nudity = result.nudity || {};
  const gore = result.gore || {};
  const goreClasses = gore.classes || {};

  const explicitSexualContent =
    Number(nudity.sexual_activity || 0) >= 0.6 ||
    Number(nudity.sexual_display || 0) >= 0.6 ||
    Number(nudity.erotica || 0) >= 0.8;

  const graphicViolence =
    Number(gore.prob || 0) >= 0.85 ||
    Number(goreClasses.very_bloody || 0) >= 0.7 ||
    Number(goreClasses.body_organ || 0) >= 0.7 ||
    Number(goreClasses.dismemberment || 0) >= 0.7;

  if (explicitSexualContent) {
    return {
      allowed: false,
      reason: 'A imagem contém conteúdo sexual ou explícito.'
    };
  }

  if (graphicViolence) {
    return {
      allowed: false,
      reason: 'A imagem contém conteúdo gráfico ou violência extrema.'
    };
  }

  return { allowed: true };
}

async function moderateImage(file) {
  if (!file) {
    return { allowed: true };
  }

  if (!isConfigured()) {
    if (!missingCredentialsWarningShown) {
      console.warn(
        'Moderação de imagens desativada: configure SIGHTENGINE_API_USER e SIGHTENGINE_API_SECRET.'
      );
      missingCredentialsWarningShown = true;
    }

    return { allowed: true, skipped: true };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);

  try {
    const formData = new FormData();
    const imageBlob = new Blob([file.buffer], { type: file.mimetype });

    formData.append('media', imageBlob, file.originalname || 'image.jpg');
    formData.append('models', MODERATION_MODELS);
    formData.append('api_user', process.env.SIGHTENGINE_API_USER);
    formData.append('api_secret', process.env.SIGHTENGINE_API_SECRET);

    const response = await fetch(MODERATION_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    const result = await response.json();

    if (!response.ok || result.status !== 'success') {
      const error = new Error('O serviço de moderação não conseguiu analisar a imagem.');
      error.code = 'MODERATION_UNAVAILABLE';
      throw error;
    }

    return evaluateModeration(result);
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('O serviço de moderação demorou para responder.');
      timeoutError.code = 'MODERATION_UNAVAILABLE';
      throw timeoutError;
    }

    if (!error.code) {
      error.code = 'MODERATION_UNAVAILABLE';
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { moderateImage };
