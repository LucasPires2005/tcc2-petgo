const MODERATION_ENDPOINT = 'https://api.sightengine.com/1.0/check.json';
const MODERATION_MODELS = 'nudity-2.1,gore-2.0,face-analysis';
const MODERATION_TIMEOUT_MS = 20000;

function isConfigured() {
  return ['SIGHTENGINE_API_USER', 'SIGHTENGINE_API_SECRET'].every(key => process.env[key]?.trim());
}

function unavailable() {
  return Object.assign(new Error('Não foi possível analisar a imagem. Tente novamente em instantes.'), { code: 'MODERATION_UNAVAILABLE' });
}

function evaluateModeration(result) {
  const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  if (!result || !Array.isArray(result.faces) || !Array.isArray(result.artificial_faces)
      || ![result.nudity?.sexual_activity, result.nudity?.sexual_display, result.nudity?.erotica, result.gore?.prob].every(probability)) throw unavailable();
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

  const prominentFace = [...result.faces, ...result.artificial_faces].some(face => {
    if (!face || ![face.x1, face.y1, face.x2, face.y2].every(probability)
        || face.x2 <= face.x1 || face.y2 <= face.y1) throw unavailable();
    // Coordenadas normalizadas documentadas pelo face-analysis.
    // Pessoas pequenas ao fundo não são o alvo deste bloqueio de selfies.
    return (face.x2 - face.x1) * (face.y2 - face.y1) >= 0.02;
  });
  if (prominentFace) return { allowed: false,
    reason: 'A foto contém um rosto humano em destaque. Envie uma foto focada no cão ou gato, sem selfies.' };
  return { allowed: true };
}

async function moderateImage(file) {
  if (!file) {
    return { allowed: true };
  }

  if (!isConfigured()) {
    // Não aprovar silenciosamente uploads que não foram analisados.
    throw unavailable();
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

module.exports = { moderateImage, evaluateModeration };
