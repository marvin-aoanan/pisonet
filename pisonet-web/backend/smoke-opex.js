const axios = require('axios');
const { randomUUID } = require('crypto');

const baseUrl = (process.env.OPEX_SMOKE_BASE_URL || process.env.API_URL || 'http://localhost:5001/api').replace(/\/$/, '');
const adminPassword = process.env.OPEX_SMOKE_PASSWORD || process.env.ADMIN_PASSWORD || process.env.BACKEND_ADMIN_PASSWORD;

if (!adminPassword) {
  console.error('Missing admin password. Set OPEX_SMOKE_PASSWORD, ADMIN_PASSWORD, or BACKEND_ADMIN_PASSWORD.');
  process.exit(1);
}

const client = axios.create({
  baseURL: baseUrl,
  headers: {
    'x-admin-password': adminPassword,
  },
  timeout: 20000,
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function uniqueLabel(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function main() {
  const entryDate = new Date().toISOString();
  const createdDescription = uniqueLabel('opex-smoke-created');
  const updatedDescription = uniqueLabel('opex-smoke-updated');
  const voidReason = uniqueLabel('opex-smoke-void');

  const createPayload = {
    direction: 'expense',
    ledger_group: 'operating',
    entry_type: 'other_opex',
    category: 'Smoke Test',
    source_type: 'manual',
    source_or_payee: 'Smoke Test Runner',
    description: createdDescription,
    amount: 123.45,
    entry_date: entryDate,
    created_by: 'Smoke Test',
  };

  const createResponse = await client.post('/opex', createPayload);
  assert(createResponse.status === 201, `Expected create status 201, got ${createResponse.status}`);
  const created = createResponse.data?.data;
  assert(created?.id, 'Create response did not include an id');
  assert(created.description === createdDescription, 'Create response description mismatch');

  const id = created.id;

  const updateResponse = await client.put(`/opex/${id}`, {
    description: updatedDescription,
    amount: 234.56,
    changed_by: 'Smoke Test',
    change_reason: 'Smoke update',
  });
  assert(updateResponse.status === 200, `Expected update status 200, got ${updateResponse.status}`);
  const updated = updateResponse.data?.data;
  assert(updated?.description === updatedDescription, 'Update response description mismatch');
  assert(Number(updated?.amount || 0) === 234.56, 'Update response amount mismatch');

  const listResponse = await client.get('/opex', { params: { q: updatedDescription, limit: 5 } });
  assert(Array.isArray(listResponse.data?.data), 'List response is not an array');
  const listed = listResponse.data.data.find((row) => Number(row.id) === Number(id));
  assert(listed, 'Updated entry was not found in the list endpoint');
  assert(listed.description === updatedDescription, 'List response did not include updated description');

  const summaryResponse = await client.get('/opex/summary', { params: { include_voided: true } });
  const summary = summaryResponse.data?.data;
  assert(summary && typeof summary === 'object', 'Summary response missing data');
  assert(Object.prototype.hasOwnProperty.call(summary, 'cogs'), 'Summary missing cogs');
  assert(Object.prototype.hasOwnProperty.call(summary, 'gross_profit'), 'Summary missing gross_profit');
  assert(Object.prototype.hasOwnProperty.call(summary, 'operating_profit'), 'Summary missing operating_profit');
  assert(Object.prototype.hasOwnProperty.call(summary, 'roi_percent'), 'Summary missing roi_percent');
  assert(Array.isArray(summary.by_category), 'Summary by_category is not an array');
  assert(Array.isArray(summary.by_entry_type), 'Summary by_entry_type is not an array');

  const timelineResponse = await client.get('/opex/timeline', { params: { days: 30, include_voided: true } });
  const timeline = timelineResponse.data?.data;
  assert(Array.isArray(timeline), 'Timeline response is not an array');
  assert(timeline.length > 0, 'Timeline response is empty');
  assert(Object.prototype.hasOwnProperty.call(timeline[0], 'cogs'), 'Timeline items missing cogs');
  assert(Object.prototype.hasOwnProperty.call(timeline[0], 'gross_profit'), 'Timeline items missing gross_profit');
  assert(Object.prototype.hasOwnProperty.call(timeline[0], 'operating_profit'), 'Timeline items missing operating_profit');

  const voidResponse = await client.post(`/opex/${id}/void`, {
    reason: voidReason,
    voided_by: 'Smoke Test',
  });
  assert(voidResponse.status === 200, `Expected void status 200, got ${voidResponse.status}`);
  const voided = voidResponse.data?.data;
  assert(voided?.status === 'voided', 'Void response did not mark the entry as voided');

  const fetchedAfterVoid = await client.get(`/opex/${id}`);
  const voidedRow = fetchedAfterVoid.data?.data;
  assert(voidedRow?.status === 'voided', 'Voided entry is not persisted as voided');

  const activeSummaryResponse = await client.get('/opex/summary');
  const activeSummary = activeSummaryResponse.data?.data;
  assert(activeSummary && typeof activeSummary === 'object', 'Active summary response missing data');

  console.log(JSON.stringify({
    ok: true,
    created_id: id,
    created_reference_no: created.reference_no,
    updated_description: updatedDescription,
    void_reason: voidReason,
    active_operating_profit: activeSummary.operating_profit,
    roi_percent: summary.roi_percent,
    timeline_points: timeline.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.response?.data || error.message || error);
  process.exit(1);
});
