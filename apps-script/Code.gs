const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/ats-tutoring/databases/(default)/documents';
const DOCUMENT_PREFIX = 'projects/ats-tutoring/databases/(default)/documents/mail/';
const SUPPORT_PREFIX = 'projects/ats-tutoring/databases/(default)/documents/supportReports/';
const HANDLER = 'sendQueuedApplicationNotifications';
const ACKNOWLEDGEMENT = 'sentNotificationAwaitingRemoval';

function checkNotifier() {
  const token = ScriptApp.getOAuthToken();
  readReviewer_(token);
  const pending = readQueue_(token).length + readSupportQueue_(token).length;
  console.log('Firestore and reviewer settings are accessible. Pending in first batch: ' + pending);
  console.log('Remaining email quota today: ' + MailApp.getRemainingDailyQuota());
}

function sendTestNotification() {
  const { email, dashboardUrl } = readReviewer_(ScriptApp.getOAuthToken());
  MailApp.sendEmail({
    to: email,
    subject: 'ATS Tutoring notification test',
    body: 'This is a test of ATS Tutoring email delivery. Reviewer dashboard: ' + dashboardUrl,
    name: 'ATS Tutoring'
  });
  console.log('Test notification accepted for sending to the configured reviewer.');
}

function installNotifier() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === HANDLER)) {
      console.log('A notification trigger already exists for this account.');
      return;
    }
    checkNotifier();
    ScriptApp.newTrigger(HANDLER).timeBased().everyMinutes(5).create();
    console.log('The notifier is scheduled to check for applications every five minutes.');
  } finally {
    lock.releaseLock();
  }
}

function sendQueuedApplicationNotifications() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    const token = ScriptApp.getOAuthToken();
    const properties = PropertiesService.getScriptProperties();

    // A previous run may have sent the email before Firestore acknowledged removal.
    const previous = properties.getProperty(ACKNOWLEDGEMENT);
    if (previous) removeSentNotification_(token, properties, JSON.parse(previous));

    const queue = [...readQueue_(token), ...readSupportQueue_(token)];
    if (queue.length === 0) return;

    const { email, dashboardUrl, supportEmail } = readReviewer_(token);
    const capacity = Math.min(queue.length, MailApp.getRemainingDailyQuota());
    if (capacity === 0) {
      console.warn('Email quota reached. Pending notifications will remain queued.');
      return;
    }

    const notifications = queue.slice(0, capacity);
    for (const { name, updateTime } of notifications) {
      if ((!name.startsWith(DOCUMENT_PREFIX) && !name.startsWith(SUPPORT_PREFIX)) || !updateTime) {
        throw new Error('Firestore returned an unexpected notification document.');
      }

      let recipient = email;
      let subject = 'New ATS tutor application';
      let body = 'A student submitted a tutor application. Review it here: ' + dashboardUrl;
      if (name.startsWith(SUPPORT_PREFIX)) {
        const report = firestoreRequest_(token, '/supportReports/' + encodeURIComponent(name.slice(SUPPORT_PREFIX.length)));
        if (report.updateTime !== updateTime) throw new Error('The report changed before sending.');
        const category = report.fields?.category?.stringValue;
        const message = report.fields?.message?.stringValue;
        if (!['Website problem','Tutoring concern','Suggestion','General help'].includes(category)
          || typeof message !== 'string' || message.length < 10 || message.length > 2000) {
          throw new Error('A support report has an invalid format.');
        }
        recipient = supportEmail;
        subject = 'ATS Tutoring report: ' + category;
        body = 'A student sent the following report. No account name or email is attached.\n\nCategory: '
          + category + '\n\n' + message;
      }
      MailApp.sendEmail({to: recipient, subject, body, name: 'ATS Tutoring'});
      properties.setProperty(ACKNOWLEDGEMENT, JSON.stringify({ name, updateTime }));
      removeSentNotification_(token, properties, { name, updateTime });
    }
    console.log('Notifications accepted for sending: ' + notifications.length);
  } finally {
    lock.releaseLock();
  }
}

function readReviewer_(token) {
  const settings = firestoreRequest_(token, '/settings/review');
  const email = settings.fields?.reviewerEmail?.stringValue;
  if (!email || !/^[^@\s]+@ats\.edu\.mx$/i.test(email)) {
    throw new Error('Set reviewerEmail on Firestore settings/review to an ATS email address.');
  }
  const dashboardUrl = settings.fields?.reviewUrl?.stringValue;
  if (!dashboardUrl || !/^https:\/\/[a-z0-9.-]+\/[^\s?#]*\?review=1$/i.test(dashboardUrl)) {
    throw new Error('Set reviewUrl on Firestore settings/review to the published HTTPS reviewer link.');
  }
  const supportEmail = settings.fields?.supportEmail?.stringValue || email;
  if (!/^[^@\s]+@(ats\.edu\.mx|gmail\.com)$/i.test(supportEmail)) throw new Error('Set a valid supportEmail in settings/review.');
  return { email, dashboardUrl, supportEmail };
}

function readQueue_(token) {
  // Request metadata only. The document body and application data stay in Firestore.
  const result = firestoreRequest_(token, '/mail?pageSize=10&fields=documents(name,updateTime)');
  return result.documents || [];
}

function readSupportQueue_(token) {
  const result = firestoreRequest_(token, '/supportReports?pageSize=10&fields=documents(name,updateTime)');
  return result.documents || [];
}

function removeSentNotification_(token, properties, notification) {
  const { name, updateTime } = notification;
  if ((!name.startsWith(DOCUMENT_PREFIX) && !name.startsWith(SUPPORT_PREFIX)) || !updateTime) {
    throw new Error('Unexpected notification acknowledgement.');
  }
  const isSupport = name.startsWith(SUPPORT_PREFIX);
  const id = name.slice(isSupport ? SUPPORT_PREFIX.length : DOCUMENT_PREFIX.length);
  const path = (isSupport ? '/supportReports/' : '/mail/') + encodeURIComponent(id)
    + '?currentDocument.updateTime=' + encodeURIComponent(updateTime);
  firestoreRequest_(token, path, 'delete');
  properties.deleteProperty(ACKNOWLEDGEMENT);
}

function firestoreRequest_(token, path, method = 'get', allowMissing = false) {
  const response = UrlFetchApp.fetch(FIRESTORE + path, {
    method,
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status === 404 && (method === 'delete' || allowMissing)) return null;

  const body = response.getContentText();
  const data = body ? JSON.parse(body) : {};
  if (status < 200 || status >= 300) {
    if (method === 'delete' && data.error?.status === 'FAILED_PRECONDITION') {
      // A failed precondition can also mean the preceding delete already committed.
      const documentPath = path.split('?')[0];
      if (!firestoreRequest_(token, documentPath, 'get', true)) return null;
    }
    throw new Error('Firestore ' + method + ' returned HTTP ' + status
      + ' (' + (data.error?.status || 'UNKNOWN') + ').');
  }

  return data;
}
