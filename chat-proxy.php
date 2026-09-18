<?php
/**
 * Trident Public School — chatbot proxy
 * ---------------------------------------------------------------
 * The browser talks ONLY to this file. This file holds the API key
 * and talks to the AI provider. The key is never sent to the browser.
 *
 * SETUP
 *   1. Put your key in the environment (preferred), e.g. in .htaccess:
 *          SetEnv AICREDITS_API_KEY sk-xxxxxxxx
 *      ...or, if your host has no env support, replace the fallback
 *      string on the API_KEY line below.
 *   2. Confirm API_BASE and MODEL match your provider (see README).
 *   3. Upload alongside index.html. Requires PHP 7.4+ with cURL.
 *
 * NEVER commit a real key to git or paste it into any .js file.
 */

declare(strict_types=1);

// ---------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------
const API_BASE = 'https://api.aicredits.in/v1';   // <-- confirm for your account
const MODEL    = 'gpt-4o-mini';                   // <-- any model your plan allows

$API_KEY = getenv('AICREDITS_API_KEY') ?: 'PASTE_YOUR_KEY_HERE';

// Only these origins may call this proxy. Add your live domain.
const ALLOWED_ORIGINS = [
    'https://tridentpublicschool.com',
    'https://www.tridentpublicschool.com',
    'http://localhost',
];

// Simple abuse limits.
const MAX_MESSAGES     = 20;    // conversation turns accepted per request
const MAX_CHARS        = 1500;  // per user message
const RATE_LIMIT_HITS  = 20;    // requests...
const RATE_LIMIT_SECS  = 300;   // ...per this many seconds, per IP

// What the assistant knows and how it behaves.
const SYSTEM_PROMPT = <<<'PROMPT'
You are the admissions and information assistant for Trident Public School,
a CBSE co-educational school in Beldari, Simri Bakhtiyarpur, Patna, Bihar.

Facts you may rely on:
- Affiliation: CBSE. Teacher-student ratio 1:20. Over 20 years of operation.
- Four campuses: Beldari (main, Nursery-XII, 980 students, since 2004);
  Bakhtiyarpur (senior wing, VI-XII, 720 students, since 2011);
  Fatuha (junior wing, Nursery-V, 460 students, since 2016);
  Patna City (Nursery-X, 540 students, since 2019).
- Facilities: smart classrooms, science laboratories, library, GPS-enabled
  school buses.
- Results 2025: 100% pass rate in Class X and XII for eleven consecutive
  years; 62% of students scored above 90%; 28 merit admissions.
- Principal: Dr. Anjali Mehra, Ph.D. Education (Patna University), 22 years
  in education, 9 as Principal.
- Admissions for 2025-26 are open. Office hours Monday to Saturday,
  8:00 AM to 4:00 PM.
- Phone +91 7544000044. Email info@tridentpublicschool.com.

How to answer:
- Be warm, brief and practical. Two to four sentences is usually right.
- You are talking mostly to parents. Avoid jargon.
- For fees, exact cut-off dates, seat availability, transfer certificates or
  anything about a specific child, say you do not have that detail and give
  the office phone number and hours.
- Never invent fees, dates, marks, staff names or policies. If you are not
  sure, say so and point to the office.
- Answer in the language the parent writes in (English or Hindi).
- You only discuss this school and its admissions. Politely decline anything
  unrelated.
PROMPT;

// ---------------------------------------------------------------
// CORS + METHOD
// ---------------------------------------------------------------
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Use POST.']);
    exit;
}

if ($API_KEY === 'PASTE_YOUR_KEY_HERE' || $API_KEY === '') {
    http_response_code(500);
    echo json_encode(['error' => 'The chat service is not configured yet.']);
    exit;
}

// ---------------------------------------------------------------
// RATE LIMIT (file-based; swap for Redis/APCu on a busy site)
// ---------------------------------------------------------------
$ip   = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$file = sys_get_temp_dir() . '/tps_chat_' . md5($ip) . '.json';
$now  = time();
$hits = [];

if (is_readable($file)) {
    $decoded = json_decode((string)file_get_contents($file), true);
    if (is_array($decoded)) {
        $hits = array_filter($decoded, static fn($t) => ($now - (int)$t) < RATE_LIMIT_SECS);
    }
}

if (count($hits) >= RATE_LIMIT_HITS) {
    http_response_code(429);
    echo json_encode(['error' => 'Too many messages just now. Please try again in a few minutes.']);
    exit;
}

$hits[] = $now;
@file_put_contents($file, json_encode(array_values($hits)), LOCK_EX);

// ---------------------------------------------------------------
// VALIDATE INPUT
// ---------------------------------------------------------------
$raw  = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);

if (!is_array($body) || !isset($body['messages']) || !is_array($body['messages'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Malformed request.']);
    exit;
}

// Rebuild the conversation ourselves. We never trust a system prompt,
// a model name or any other field sent by the browser.
$clean = [['role' => 'system', 'content' => SYSTEM_PROMPT]];

foreach (array_slice($body['messages'], -MAX_MESSAGES) as $m) {
    if (!is_array($m) || !isset($m['role'], $m['content'])) {
        continue;
    }
    $role = $m['role'] === 'assistant' ? 'assistant' : 'user';
    $text = trim((string)$m['content']);
    if ($text === '') {
        continue;
    }
    $clean[] = ['role' => $role, 'content' => mb_substr($text, 0, MAX_CHARS)];
}

if (count($clean) < 2) {
    http_response_code(400);
    echo json_encode(['error' => 'No message to answer.']);
    exit;
}

// ---------------------------------------------------------------
// CALL THE PROVIDER
// ---------------------------------------------------------------
$payload = json_encode([
    'model'       => MODEL,
    'messages'    => $clean,
    'temperature' => 0.3,
    'max_tokens'  => 500,
    'stream'      => false,
], JSON_UNESCAPED_UNICODE);

$ch = curl_init(API_BASE . '/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_TIMEOUT        => 45,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . $API_KEY,
        'Content-Type: application/json',
    ],
]);

$response = curl_exec($ch);
$status   = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($response === false) {
    error_log('[tps-chat] cURL failure: ' . $curlErr);
    http_response_code(502);
    echo json_encode(['error' => 'Could not reach the assistant. Please try again.']);
    exit;
}

if ($status < 200 || $status >= 300) {
    // Log the provider's message for us; never show it to the visitor,
    // since upstream errors can echo back key or account details.
    error_log('[tps-chat] provider ' . $status . ': ' . substr((string)$response, 0, 500));
    http_response_code(502);
    echo json_encode(['error' => 'The assistant is unavailable right now. Please call +91 7544000044.']);
    exit;
}

$data  = json_decode((string)$response, true);
$reply = $data['choices'][0]['message']['content'] ?? '';

if (trim($reply) === '') {
    http_response_code(502);
    echo json_encode(['error' => 'Empty reply from the assistant. Please try again.']);
    exit;
}

echo json_encode(['reply' => $reply], JSON_UNESCAPED_UNICODE);
