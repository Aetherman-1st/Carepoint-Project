#!/usr/bin/env node
'use strict';

const crypto = require('crypto');

const PUBLIC_URL = (process.env.RL_PUBLIC_URL || 'https://carepoint-15l.pages.dev').replace(/\/+$/, '');
const ADMIN_URL = (process.env.RL_ADMIN_URL || 'https://carepoint-admin.pages.dev').replace(/\/+$/, '');
const PUBLIC_PATH = process.env.RL_PUBLIC_PATH || '/login';
const ADMIN_PATH = process.env.RL_ADMIN_PATH || '/api/login';
const EXPECTED_ADMIN_PROCESSED = Number(process.env.RL_EXPECT_ADMIN_PROCESSED || 4);
const EXPECTED_PUBLIC_ALLOWED = Number(process.env.RL_EXPECT_PUBLIC_ALLOWED || 10);
const PARALLEL_COUNT = 12;
const PASSWORD = 'wrongpass123';

function throwawayEmail(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}@example.invalid`;
}

function headerVariants(index) {
  const octet = 40 + index;
  return [
    { 'x-forwarded-for': `203.0.113.${octet}` },
    { 'x-forwarded-for': `198.51.100.${octet}`, 'x-real-ip': `198.51.100.${octet}` },
    { 'x-forwarded-for': `192.0.2.${octet}`, 'user-agent': `rl-test-${index}` },
    { 'x-forwarded-for': `203.0.113.${octet}`, 'user-agent': `rl-test-${index}`, 'x-requested-with': 'XMLHttpRequest' }
  ][index % 4];
}

async function post(base, path, { email, headers = {}, origin }) {
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (origin) requestHeaders.Origin = origin;
  try {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ email, password: PASSWORD })
    });
    const text = await response.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch (err) {
      body = text.slice(0, 120);
    }
    return {
      status: response.status,
      retryAfter: response.headers.get('retry-after'),
      body
    };
  } catch (err) {
    return { status: 0, retryAfter: null, body: `network_error: ${err.message}` };
  }
}

function summarize(label, results) {
  return {
    test: label,
    total: results.length,
    statuses: results.map((item) => item.status),
    processed: results.filter((item) => item.status === 401).length,
    blocked: results.filter((item) => item.status === 429).length
  };
}

async function parallelAdminLogin() {
  const email = throwawayEmail('rl-admin');
  const jobs = [];
  for (let index = 0; index < PARALLEL_COUNT; index += 1) {
    jobs.push(
      post(ADMIN_URL, ADMIN_PATH, {
        email,
        headers: headerVariants(index),
        origin: ADMIN_URL
      })
    );
  }
  const results = await Promise.all(jobs);
  const summary = summarize('admin_login_parallel_same_email', results);
  summary.email = email;
  summary.expectedProcessed = EXPECTED_ADMIN_PROCESSED;
  summary.pass = summary.processed === EXPECTED_ADMIN_PROCESSED && summary.blocked === PARALLEL_COUNT - EXPECTED_ADMIN_PROCESSED;
  return { summary, results };
}

async function publicSequential() {
  const email = throwawayEmail('rl-public');
  const results = [];
  for (let index = 0; index < EXPECTED_PUBLIC_ALLOWED + 1; index += 1) {
    results.push(
      await post(PUBLIC_URL, PUBLIC_PATH, {
        email,
        headers: headerVariants(index),
        origin: PUBLIC_URL
      })
    );
  }
  const summary = summarize('public_login_sequential', results);
  summary.email = email;
  summary.expectedAllowed = EXPECTED_PUBLIC_ALLOWED;
  summary.pass = results.slice(0, EXPECTED_PUBLIC_ALLOWED).every((item) => item.status === 401) &&
    results[results.length - 1].status === 429;
  return { summary, results };
}

async function headerEvasion(base, path, email, origin) {
  const results = [];
  for (let index = 0; index < 4; index += 1) {
    results.push(
      await post(base, path, {
        email,
        headers: {
          ...headerVariants(index + 5),
          'x-forwarded-for': `203.0.113.${200 + index}, 10.0.0.${index}`,
          'x-real-ip': `198.51.100.${200 + index}`
        },
        origin
      })
    );
  }
  const summary = summarize('locked_email_with_different_ip_headers', results);
  summary.pass = results.every((item) => item.status === 429);
  return { summary, results };
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    publicUrl: PUBLIC_URL + PUBLIC_PATH,
    adminUrl: ADMIN_URL + ADMIN_PATH,
    note: 'Only nonexistent @example.invalid addresses are used; no real admin account is contacted.'
  };

  const admin = await parallelAdminLogin();
  report.adminParallel = admin.summary;
  report.adminParallelResponses = admin.results;

  const adminEvasion = await headerEvasion(ADMIN_URL, ADMIN_PATH, admin.summary.email, ADMIN_URL);
  report.adminHeaderEvasion = adminEvasion.summary;
  report.adminHeaderEvasionResponses = adminEvasion.results;

  const publicResult = await publicSequential();
  report.publicSequential = publicResult.summary;
  report.publicSequentialResponses = publicResult.results;

  const publicEvasion = await headerEvasion(PUBLIC_URL, PUBLIC_PATH, publicResult.summary.email, PUBLIC_URL);
  report.publicHeaderEvasion = publicEvasion.summary;
  report.publicHeaderEvasionResponses = publicEvasion.results;

  report.pass = [admin.summary, adminEvasion.summary, publicResult.summary, publicEvasion.summary]
    .every((item) => item.pass);

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
