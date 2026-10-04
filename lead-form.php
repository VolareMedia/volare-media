<?php
// Volare Media landing page lead form: short "free creative session" requests
// from the ad landing pages. Sends to video@volaremedia.net, then redirects back
// to the page with ?sent=1 (which fires the Google Ads / Meta / GA4 lead events).

// Landing pages allowed to post here, and where to send visitors back to
$pages = [
  'corporate-event-content' => ['url' => '/corporate-event-content.html', 'label' => 'Corporate event content page'],
  'free-creative-session'   => ['url' => '/free-creative-session.html',   'label' => 'Free creative session page'],
];

$key  = $_POST['page'] ?? '';
$page = $pages[$key] ?? null;
$back = $page ? $page['url'] : '/contact.html';

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !$page) {
  header('Location: ' . $back);
  exit;
}

// Honeypot: real visitors never fill this hidden field. Bots get the page back without a conversion.
if (!empty($_POST['website'])) {
  header('Location: ' . $back);
  exit;
}

// One line, no tags, capped length
function clean_line($v, $max) {
  $v = trim(strip_tags((string) $v));
  $v = preg_replace('/[\r\n\t]+/', ' ', $v);
  return substr($v, 0, $max);
}

$name    = clean_line($_POST['name'] ?? '', 120);
$contact = clean_line($_POST['contact'] ?? '', 160);
$src     = clean_line($_POST['src'] ?? '', 200);
$goal    = substr(trim(strip_tags((string) ($_POST['goal'] ?? ''))), 0, 3000);
// One-tap "What can we help with?" choice (only accept the values the form offers)
$reasons = ['Video', 'Ads & marketing', 'Website', 'Not sure yet'];
$reason  = in_array($_POST['reason'] ?? '', $reasons, true) ? $_POST['reason'] : '';

// "Email or phone": accept a valid email, or anything with 7 to 15 digits
$email  = filter_var($contact, FILTER_VALIDATE_EMAIL);
$digits = preg_replace('/\D/', '', $contact);
$phone  = (!$email && strlen($digits) >= 7 && strlen($digits) <= 15) ? $contact : '';

if ($name === '' || (!$email && $phone === '')) {
  header('Location: ' . $back . '?error=1#book');
  exit;
}

$to      = 'video@volaremedia.net';
$subject = 'Free creative session request: ' . $name . ' (' . $page['label'] . ')';

$body  = "New free creative session request\n";
$body .= "---------------------------------\n\n";
$body .= "Name:     $name\n";
$body .= $email ? "Email:    $email\n" : "Phone:    $phone\n";
if ($reason !== '') $body .= "Wants:    $reason\n";
$body .= "From:     " . $page['label'] . "\n";
$body .= "Came via: " . ($src !== '' ? $src : '(unknown)') . "\n\n";
if ($goal !== '' || $key === 'corporate-event-content') {
  $body .= "What they'd like it to do:\n" . ($goal !== '' ? $goal : '(left blank)') . "\n";
}

$headers  = "From: Volare Media Website <form@volaremedia.net>\r\n";
if ($email) $headers .= "Reply-To: $email\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);

header('Location: ' . $back . '?sent=1#book');
exit;
