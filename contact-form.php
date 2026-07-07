<?php
// Volare Media contact form handler — sends inquiries to video@volaremedia.net

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  header('Location: /contact.html');
  exit;
}

// Honeypot: real visitors never fill this hidden field
if (!empty($_POST['website'])) {
  header('Location: /contact.html?sent=1');
  exit;
}

$name    = trim(strip_tags($_POST['name'] ?? ''));
$email   = filter_var(trim($_POST['email'] ?? ''), FILTER_VALIDATE_EMAIL);
$budget  = trim(strip_tags($_POST['budget'] ?? ''));
$message = trim(strip_tags($_POST['message'] ?? ''));

if ($name === '' || !$email || $message === '' || strlen($message) > 5000) {
  header('Location: /contact.html?error=1');
  exit;
}

$to      = 'video@volaremedia.net';
$subject = 'New project inquiry — ' . mb_substr($name, 0, 80);

$body  = "New inquiry from the volaremedia.net contact form\n";
$body .= "--------------------------------------------------\n\n";
$body .= "Name:    $name\n";
$body .= "Email:   $email\n";
$body .= "Budget:  " . ($budget !== '' ? $budget : '(not provided)') . "\n\n";
$body .= "Message:\n$message\n";

$headers  = "From: Volare Media Website <form@volaremedia.net>\r\n";
$headers .= "Reply-To: $email\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

mail($to, $subject, $body, $headers);

header('Location: /contact.html?sent=1');
exit;
