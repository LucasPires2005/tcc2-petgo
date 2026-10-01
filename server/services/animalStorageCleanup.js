// Aceita apenas URLs do próprio projeto e do bucket fixo animals.
function animalObjectPath(value, supabaseUrl) {
  if (typeof value !== 'string' || !value) return null;
  try {
    // Verifica também o caminho original: URL normaliza segmentos "..".
    const rawPath = /^https:\/\/[^/?#]+(\/[^?#]*)/.exec(value)?.[1];
    if (!rawPath || decodeURIComponent(rawPath).split('/').some(part => part === '.' || part === '..')
        || /[\\\x00-\x1f\x7f]/.test(decodeURIComponent(rawPath))) return null;
    const base = new URL(supabaseUrl);
    const url = new URL(value);
    if (base.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password) return null;
    const match = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/animals\/(.+)$/.exec(url.pathname);
    if (!match) return null;
    const path = decodeURIComponent(match[1]);
    if (/[\\\x00-\x1f\x7f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) return null;
    return path;
  } catch { return null; }
}

async function withDeadline(work, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('STORAGE_TIMEOUT')), timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

async function cleanupAnimalPhotos({ animal, db, storage, supabaseUrl, timeoutMs = 10000 }) {
  const urls = [animal.image_url, animal.rescue_image_url].filter(Boolean);
  const paths = [...new Set(urls.map(url => animalObjectPath(url, supabaseUrl)).filter(Boolean))];
  const result = { removed: 0, shared: 0, failed: 0, skipped: urls.filter(url => !animalObjectPath(url, supabaseUrl)).length };
  if (paths.length) {
    try {
      // Compara caminhos, não somente URLs literais (assinaturas/codificação podem variar).
      // Falha na leitura preserva os arquivos, em vez de arriscar imagens ainda em uso.
      const rows = await withDeadline(() => new Promise((resolve, reject) => db.all(
        'SELECT image_url, rescue_image_url FROM public.animals WHERE image_url IS NOT NULL OR rescue_image_url IS NOT NULL', [],
        (error, data) => error ? reject(error) : resolve(data))), timeoutMs);
      const referenced = new Set(rows.flatMap(row => [row.image_url, row.rescue_image_url])
        .map(url => animalObjectPath(url, supabaseUrl)).filter(Boolean));
      await Promise.all(paths.map(async path => {
        if (referenced.has(path)) { result.shared++; return; }
        try {
          const { error } = await withDeadline(() => storage.from('animals').remove([path]), timeoutMs);
          const missing = error?.code === 'NoSuchKey' || error?.code === 'ObjectNotFound'
            || (Number(error?.statusCode ?? error?.status) === 404 && !['NoSuchBucket', 'BucketNotFound'].includes(error?.code));
          if (error && !missing) throw error;
          result.removed++;
        } catch (error) {
          result.failed++;
          console.error('Limpeza de foto não confirmada:', { animalId: animal.id, code: error.code || 'STORAGE_CLEANUP_FAILED' });
        }
      }));
    } catch (error) {
      result.failed = paths.length;
      console.error('Não foi possível conferir fotos compartilhadas:', { animalId: animal.id, code: error.code || 'STORAGE_REFERENCES_FAILED' });
    }
  }
  return { ...result, status: result.failed || result.skipped ? 'partial' : 'complete' };
}

module.exports = { animalObjectPath, cleanupAnimalPhotos };
