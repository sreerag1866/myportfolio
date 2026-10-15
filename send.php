<?php
/**
 * Contact form handler for sreerag portfolio.
 * Requires a PHP host (cPanel / shared hosting / VPS) with working mail().
 * GitHub Pages cannot run PHP.
 */
declare(strict_types=1);

// ---------- CONFIG ----------
$TO      = 'sreeraganair@gmail.com';        // where messages are delivered
$FROM    = '';                              // e.g. 'no-reply@yourdomain.com' (leave empty to auto-detect from this domain)
$PREFIX  = '[Portfolio] ';                  // subject prefix
$MIN_GAP = 45;                              // seconds between messages from one IP
// ----------------------------

$wantsJson = stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;

function respond(bool $ok, string $msg, int $code = 200): void {
    global $wantsJson;
    http_response_code($code);
    if ($wantsJson) {
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        echo json_encode(['ok' => $ok, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    } else {
        header('Content-Type: text/html; charset=utf-8');
        $safe = htmlspecialchars($msg, ENT_QUOTES, 'UTF-8');
        echo '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
           . '<title>Contact</title><body style="font-family:system-ui,sans-serif;background:#1f1c1d;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0">'
           . '<div style="text-align:center;padding:24px"><h1 style="color:' . ($ok ? '#ffe500' : '#ff9b9b') . '">' . ($ok ? 'Thank you!' : 'Oops') . '</h1>'
           . '<p>' . $safe . '</p><p><a style="color:#ffe500" href="index.html#contact">&larr; Back to the website</a></p></div></body>';
    }
    exit;
}

function clean(string $v, int $max): string {
    $v = trim(str_replace(["\r", "\n", "\t", "\0"], ' ', $v));   // strip header-injection characters
    return mb_substr($v, 0, $max);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(false, 'Invalid request.', 405);
}

// Honeypot: bots fill this hidden field
if (!empty($_POST['website'])) {
    respond(true, 'Thank you! Your message has been sent.');
}

// Too-fast submissions are almost always bots
if ((int)($_POST['elapsed'] ?? 0) < 2) {
    respond(false, 'Please take a moment to fill in the form and try again.', 429);
}

// Simple per-IP rate limit
$ip   = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$lock = sys_get_temp_dir() . '/cf_' . md5($ip);
if (is_file($lock) && (time() - (int)@filemtime($lock)) < $MIN_GAP) {
    respond(false, 'Please wait a minute before sending another message.', 429);
}

$name    = clean((string)($_POST['name'] ?? ''), 80);
$email   = clean((string)($_POST['email'] ?? ''), 120);
$phone   = clean((string)($_POST['phone'] ?? ''), 30);
$service = clean((string)($_POST['service'] ?? ''), 60);
$message = trim((string)($_POST['message'] ?? ''));
$message = mb_substr(str_replace("\0", '', $message), 0, 3000);

if ($name === '' || mb_strlen($message) < 10) {
    respond(false, 'Please enter your name and a message of at least 10 characters.', 422);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'Please enter a valid email address.', 422);
}
if ($phone !== '' && !preg_match('/^[0-9+\-\s().]{6,30}$/', $phone)) {
    respond(false, 'Please enter a valid phone number.', 422);
}

$host = preg_replace('/^www\./', '', (string)($_SERVER['SERVER_NAME'] ?? 'localhost'));
$from = $FROM !== '' ? $FROM : 'no-reply@' . $host;

$subject = '=?UTF-8?B?' . base64_encode($PREFIX . 'New enquiry from ' . $name) . '?=';
$body = "New message from your portfolio website\n"
      . "----------------------------------------\n"
      . "Name:    $name\n"
      . "Email:   $email\n"
      . "Phone:   " . ($phone !== '' ? $phone : '-') . "\n"
      . "Service: " . ($service !== '' ? $service : '-') . "\n"
      . "IP:      $ip\n"
      . "----------------------------------------\n\n"
      . $message . "\n";

$headers = [
    'From: Portfolio Website <' . $from . '>',
    'Reply-To: ' . $name . ' <' . $email . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'X-Mailer: PHP/' . PHP_VERSION,
];

if (@mail($TO, $subject, $body, implode("\r\n", $headers))) {
    @touch($lock);
    respond(true, 'Thank you, ' . $name . '! Your message has been sent. I will reply soon.');
}

error_log('Contact form: mail() failed for ' . $email);
respond(false, 'The server could not send your message right now.', 500);
