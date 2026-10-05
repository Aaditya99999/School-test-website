<?php
/**
 * Radha Krishna Memorial Education Centre — admission enquiries -> Google Sheet
 * -------------------------------------------------------------------
 * The enquiry form posts here. This file checks the details and forwards
 * them to the school's Google Sheet through an Apps Script web app.
 *
 *   browser --POST--> api/leads.php --POST + secret--> Apps Script --> Sheet
 *
 * The secret lives only in config.php on the server and in the Apps
 * Script, so nobody can write to the sheet without going through the
 * checks and rate limit below.
 *
 * SETUP
 *   Fill in sheet_url and sheet_secret in config.php on the server.
 *   Requires PHP 7.4+ with cURL.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$config = require dirname(__DIR__) . '/config.php';

const MAX_LEN         = ['name' => 120, 'phone' => 40, 'class' => 120, 'message' => 2000, 'source' => 200];
const RATE_LIMIT_HITS = 10;    // submissions...
const RATE_LIMIT_SECS = 600;   // ...per this many seconds, per IP

function respond(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function clean($value, int $max): string
{
    if (!is_string($value)) {
        return '';
    }
    return mb_substr(trim($value), 0, $max);
}

function rate_limited(): bool
{
    $ip   = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $file = sys_get_temp_dir() . '/rkg_leads_' . md5($ip) . '.json';
    $now  = time();
    $hits = [];

    if (is_readable($file)) {
        $decoded = json_decode((string)file_get_contents($file), true);
        if (is_array($decoded)) {
            $hits = array_values(array_filter($decoded, static fn($t) => ($now - (int)$t) < RATE_LIMIT_SECS));
        }
    }

    if (count($hits) >= RATE_LIMIT_HITS) {
        return true;
    }

    $hits[] = $now;
    @file_put_contents($file, json_encode($hits), LOCK_EX);
    return false;
}

// ---------------------------------------------------------------
// METHOD + CONFIG
// ---------------------------------------------------------------
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['error' => 'Use POST.']);
}

$sheetUrl    = (string)($config['sheet_url'] ?? '');
$sheetSecret = (string)($config['sheet_secret'] ?? '');

if ($sheetUrl === '' || $sheetSecret === '') {
    error_log('[rkg-leads] sheet_url / sheet_secret are not set in config.php');
    respond(500, ['error' => 'Enquiries are not set up yet.']);
}

if (rate_limited()) {
    respond(429, ['error' => 'Too many submissions just now. Please try again later.']);
}

// ---------------------------------------------------------------
// VALIDATE INPUT
// ---------------------------------------------------------------
$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) {
    respond(400, ['error' => 'Malformed request.']);
}

$lead = [
    'name'    => clean($body['name'] ?? null, MAX_LEN['name']),
    'phone'   => clean($body['phone'] ?? null, MAX_LEN['phone']),
    'class'   => clean($body['class'] ?? null, MAX_LEN['class']),
    'message' => clean($body['message'] ?? null, MAX_LEN['message']),
    'source'  => clean($body['source'] ?? null, MAX_LEN['source']),
];

if ($lead['name'] === '') {
    respond(400, ['error' => 'Name is required.']);
}
if (strlen((string)preg_replace('/\D/', '', $lead['phone'])) < 7) {
    respond(400, ['error' => 'A valid phone number is required.']);
}

// ---------------------------------------------------------------
// SEND TO THE GOOGLE SHEET
// ---------------------------------------------------------------
$ch = curl_init($sheetUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode(['secret' => $sheetSecret] + $lead, JSON_UNESCAPED_UNICODE),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    // Apps Script answers with a redirect to the result; follow it.
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 3,
    CURLOPT_TIMEOUT        => 20,
]);

$response = curl_exec($ch);
$status   = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

$result = is_string($response) ? json_decode($response, true) : null;

if ($status < 200 || $status >= 300 || !is_array($result) || empty($result['ok'])) {
    error_log('[rkg-leads] sheet write failed (' . $status . '): ' . ($curlErr ?: substr((string)$response, 0, 300)));
    respond(502, ['error' => 'Could not save the enquiry. Please contact us on WhatsApp.']);
}

respond(201, ['ok' => true]);
