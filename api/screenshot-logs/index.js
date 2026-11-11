const { getJsonBody, getSupabase, json, methodNotAllowed, readSession, requireAdmin, serviceErrorMessage } = require('../_lib/service');
const { listScreenshotLogs, recordScreenshotLog } = require('../_lib/site-supabase');

const KEYS = new Set(['PrintScreen', 'Win+Shift+S', 'Command+Shift+3', 'Command+Shift+4', 'Command+Shift+5']);

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  return String(forwarded).split(',')[0].trim().slice(0, 80);
}

async function citizenNameForStatement(req, caseId) {
  const session = readSession(req);
  if (session.citizenName) return String(session.citizenName).slice(0, 80);
  if (!session.user || !caseId) return '';
  const found = await getSupabase().from('service_cases').select('citizen_name').eq('id', caseId).maybeSingle();
  if (found.error || !found.data?.citizen_name) return '';
  return String(found.data.citizen_name).slice(0, 80);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const result = await listScreenshotLogs(getSupabase());
      return json(res, result.status, result.payload || { error: result.error });
    }
    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
    const body = await getJsonBody(req);
    const keyLabel = String(body.keyLabel || '');
    const page = String(body.page || '').slice(0, 300);
    if (!KEYS.has(keyLabel) || !page.startsWith('/')) return json(res, 400, { error: '紀錄內容不正確' });
    const caseId = String(body.caseId || '').slice(0, 80);
    const account = await citizenNameForStatement(req, caseId);
    if (!account) return json(res, 204, {});
    const result = await recordScreenshotLog(getSupabase(), {
      page,
      keyLabel,
      ip: clientIp(req),
      account
    });
    json(res, result.status, result.payload || { error: result.error });
  } catch (error) {
    json(res, 500, { error: serviceErrorMessage(error, '截圖紀錄失敗') });
  }
};
