import {test} from 'node:test';
import assert from 'node:assert/strict';
import {siteEntry} from '../web/site-entries.mjs';
import {quickPeriod} from '../web/crm/report-period.mjs';

const page = {
  location: new URL('https://site.invalid/?yclid=example-private-value'),
  document: {cookie: '', referrer: ''},
  performance: {getEntriesByType: () => [{type: 'navigate'}]}
};

test('general entry counting works without analytics consent and sends no click identifier', () => {
  const data = siteEntry(page);
  assert.equal(data.page_path, '/');
  assert.equal(data.yclid, 'present');
  assert.doesNotMatch(JSON.stringify(data), /example-private-value/);
  assert.equal(siteEntry({...page, document: {cookie: 'dp_consent=necessary', referrer: ''}}).page_path, '/');
});

test('staff, internal navigation, reloads and the manager are excluded', () => {
  assert.equal(siteEntry({...page, document: {cookie: 'dp_staff=1', referrer: ''}}), null);
  assert.equal(siteEntry({...page, document: {cookie: '', referrer: 'https://site.invalid/bani/'}}), null);
  assert.equal(siteEntry({...page, performance: {getEntriesByType: () => [{type: 'reload'}]}}), null);
  assert.equal(siteEntry({...page, location: new URL('https://site.invalid/manager.html')}), null);
});

test('quick periods use Moscow midnight and handle the year boundary', () => {
  assert.deepEqual(quickPeriod(0, new Date('2026-11-06T20:59:59Z')), {from: '2026-11-06', to: '2026-11-06'});
  assert.deepEqual(quickPeriod(0, new Date('2026-11-06T21:00:00Z')), {from: '2026-11-07', to: '2026-11-07'});
  assert.deepEqual(quickPeriod(-1, new Date('2026-01-01T00:10:00+03:00')), {from: '2025-12-31', to: '2025-12-31'});
});
