const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
function fixture(quota = 10, recovering = false) {
    const prefix = 'projects/ats-tutoring/databases/(default)/documents/';
    const queue = new Map([
        ['mail/application', {name: prefix + 'mail/application', updateTime: 'v1'}],
        ['supportReports/report', {name: prefix + 'supportReports/report', updateTime: 'v2', fields: {
            category: {stringValue: 'Website problem'}, message: {stringValue: 'A fictional issue with the subject menu.'}
        }}]
    ]);
    const sent = [];
    const properties = new Map();
    if (recovering) properties.set('sentNotificationAwaitingRemoval', JSON.stringify({name: prefix + 'supportReports/report', updateTime: 'v2'}));
    const context = vm.createContext({console, ScriptApp: {getOAuthToken: () => 'mock-token'},
        LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})},
        PropertiesService: {getScriptProperties: () => ({getProperty: key => properties.get(key), setProperty: (key, value) => properties.set(key, value), deleteProperty: key => properties.delete(key)})},
        MailApp: {getRemainingDailyQuota: () => quota, sendEmail: message => sent.push(message)},
        UrlFetchApp: {fetch: (url, options) => {
            const path = decodeURIComponent(url.split('/documents/')[1].split('?')[0]);
            let data;
            if (options.method === 'delete') queue.delete(path);
            else if (path === 'settings/review') data = {fields: {reviewerEmail: {stringValue: 'principal@ats.edu.mx'}, supportEmail: {stringValue: 'coordinator@ats.edu.mx'}, reviewUrl: {stringValue: 'https://example.com/?review=1'}}};
            else if (path === 'mail' || path === 'supportReports') data = {documents: [...queue.entries()].filter(([key]) => key.startsWith(path + '/')).map(([, value]) => ({name: value.name, updateTime: value.updateTime}))};
            else data = queue.get(path);
            return {getResponseCode: () => 200, getContentText: () => JSON.stringify(data || {})};
        }}
    });
    vm.runInContext(source, context);
    context.sendQueuedApplicationNotifications();
    return {sent, queue, properties};
}
const normal = fixture();
assert.equal(normal.sent.length, 2);
assert.equal(normal.sent[0].to, 'principal@ats.edu.mx');
assert.equal(normal.sent[1].to, 'coordinator@ats.edu.mx');
assert.equal(normal.sent[1].subject, 'ATS Tutoring report: Website problem');
assert.match(normal.sent[1].body, /A fictional issue/);
assert.doesNotMatch(normal.sent[1].body, /mock-token|studentUid|userId|supportLimits/);
assert.equal(normal.queue.size, 0);
assert.equal(normal.properties.size, 0);
const limited = fixture(0);
assert.equal(limited.sent.length, 0);
assert.equal(limited.queue.size, 2);
const recovery = fixture(10, true);
assert.equal(recovery.sent.length, 1, 'A previously sent report is acknowledged without resending');
assert.equal(recovery.queue.size, 0);
console.log('PASS: application/support recipients, report contents, queue acknowledgement, quota deferral and duplicate-send recovery.');
