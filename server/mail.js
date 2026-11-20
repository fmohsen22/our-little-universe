// Sends the contact-form messages to the owner by email, through the owner's own Gmail (or any SMTP server).
// No outside packages. The addresses and the app password come only from the server's settings file
// (/etc/our-little-universe.env, written by server/set-email.sh) and are never sent to the website or logged.
//   MAIL_TO     where the messages go (the owner's address)
//   MAIL_USER   the account that sends them (for Gmail, the Gmail address)
//   MAIL_PASS   its app password
//   MAIL_HOST   default smtp.gmail.com     MAIL_PORT  default 465 (TLS)     MAIL_TLS=0 only for tests
'use strict';
const tls = require('tls'), net = require('net'), crypto = require('crypto');

const cfg = () => ({ to: process.env.MAIL_TO || '', user: process.env.MAIL_USER || process.env.MAIL_TO || '', pass: (process.env.MAIL_PASS || '').replace(/\s+/g, ''),
  host: process.env.MAIL_HOST || 'smtp.gmail.com', port: +(process.env.MAIL_PORT || 465), tls: process.env.MAIL_TLS !== '0' });
const ready = () => { const c = cfg(); return !!(c.to && c.user && c.pass); };
const oneLine = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();
const isEmail = s => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(s || '').trim());
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const header = s => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?=';   // non-English text in a subject or name

// one email: { subject, text, replyTo? }
function send(msg) {
  return new Promise((resolve, reject) => {
    const c = cfg(); if (!ready()) return reject(new Error('email is not set up'));
    const domain = c.user.split('@')[1] || 'localhost', id = '<' + crypto.randomBytes(12).toString('hex') + '@' + domain + '>';
    const body = b64(msg.text).replace(/.{1,76}/g, '$&\r\n');
    const data = ['From: ' + header('Where is the Prince?') + ' <' + c.user + '>', 'To: <' + c.to + '>', 'Subject: ' + header(oneLine(msg.subject)), 'Date: ' + new Date().toUTCString(), 'Message-ID: ' + id,
      isEmail(msg.replyTo) ? 'Reply-To: <' + oneLine(msg.replyTo) + '>' : '', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64'].filter(Boolean).join('\r\n') + '\r\n\r\n' + body;
    const steps = [[null, 220], ['EHLO ' + domain, 250], ['AUTH LOGIN', 334], [b64(c.user), 334], [c.pass && b64(c.pass), 235], ['MAIL FROM:<' + c.user + '>', 250], ['RCPT TO:<' + c.to + '>', 250], ['DATA', 354], [data + '\r\n.', 250], ['QUIT', 221]];
    const sock = c.tls ? tls.connect({ host: c.host, port: c.port, servername: c.host }) : net.connect({ host: c.host, port: c.port });
    let buf = '', i = 0, done = false;
    const finish = err => { if (done) return; done = true; clearTimeout(timer); sock.destroy(); err ? reject(err) : resolve(); };
    const timer = setTimeout(() => finish(new Error('the mail server did not answer')), 20000);
    const next = () => { i++; if (i >= steps.length) return finish(); sock.write(steps[i][0] + '\r\n'); };
    sock.setEncoding('utf8');
    sock.on('data', d => {
      buf += d; let end;
      while ((end = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, end); buf = buf.slice(end + 2);
        if (/^\d{3}-/.test(line)) continue;                 // a reply of several lines: wait for its last line
        const code = +line.slice(0, 3), want = steps[i][1];
        if (code !== want) return finish(new Error(i === 4 ? 'the mail server refused the login (check the app password)' : 'the mail server said ' + code));   // never echo the server text: it could repeat a credential
        next();
      }
    });
    sock.on('error', e => finish(new Error('could not reach the mail server (' + (e.code || 'error') + ')')));
  });
}

// the email for one contact message
const TOPIC = { password: 'Forgot password', account: 'My account', bug: 'Something is broken', player: 'A player or a referee', idea: 'An idea', other: 'Something else' };
function forMessage(m) {
  const who = m.name || 'someone';
  return {
    subject: 'Where is the Prince? · ' + (TOPIC[m.topic] || 'Message') + ' · from ' + who,
    replyTo: m.reply,
    text: (TOPIC[m.topic] || 'Message') + '\n\nFrom: ' + who + (m.player ? ' (signed in as this player)' : ' (not signed in)') + '\nAnswer them at: ' + (m.reply || 'they left no way to answer') +
      '\nSent: ' + new Date(m.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '\n\n' + m.text + '\n\n' +
      (isEmail(m.reply) ? 'Reply to this email to answer them.\n' : '') + 'All messages are also on your dashboard: https://game.mosi-app.com/#owner\n'
  };
}

module.exports = { ready, send, forMessage, isEmail };

// `node server/mail.js --test` sends a test email (used by set-email.sh)
if (require.main === module && process.argv[2] === '--test') {
  send({ subject: 'Where is the Prince? · test', text: 'It works: messages from the contact form of the game will arrive here.\n' })
    .then(() => { console.log('sent'); }, e => { console.log('failed: ' + e.message); process.exit(1); });
}
