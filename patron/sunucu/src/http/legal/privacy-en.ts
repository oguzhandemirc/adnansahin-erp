// Privacy policy — English translation of `gizlilik-tr.ts` (the Turkish text prevails). Change both in the same commit.
import { SAGLAYICI, UYGULAMA, VERI_SORUMLUSU as VS, YURURLUK, bostaEn, esc, sayfa, type LegalFacts } from "./ortak";

function dataTable(f: LegalFacts): string {
  const row = (data: string, why: string, keep: string) => `<tr><td data-b="Data">${data}</td><td data-b="Why">${why}</td><td data-b="How long">${keep}</td></tr>`;
  return `<div class="tablo"><table>
<thead><tr><th>Data</th><th>Why it is processed</th><th>How long it is kept</th></tr></thead>
<tbody>
${row("Account details: full name, user name, permissions, account status, last sign-in time", "To let you sign in and show only the sections you are authorized for. These details come from the mill's own management system; accounts cannot be created in the app.", "While the account is open. After the account is closed, the name and user name are permanently anonymized after " + esc(f.kimlikSilmeGun) + " days.")}
${row("Password hash", "To verify your password at sign-in. Your password itself is never stored; the one-way hash produced by the mill is additionally kept encrypted.", "While the account is open; deleted as soon as the account is closed.")}
${row("Two-step verification key (optional)", "If you turned this feature on, to check the verification code at sign-in. Stored encrypted.", "Until you turn it off, or " + esc(f.kimlikSilmeGun) + " days after the account is closed.")}
${row("Session record: hash of the session key, device type, last use time", "To keep you signed in and sign you out safely.", "A session ends after " + esc(bostaEn(f.oturumBostaSaat)) + " without use and in any case within " + esc(f.oturumAzamiGun) + " days; the record of an ended session is deleted after " + esc(f.oturumKayitGun) + " days.")}
${row("Security log: events such as sign-in, sign-out, failed sign-in, device registration, records sent from the phone, and their times", "Account security, detecting misuse and legal obligations.", "Failed sign-ins " + esc(f.denetimGirisGun) + " days, other events " + esc(f.denetimGun) + " days.")}
${row("IP address", "Security log of sign-in events; limiting excessive requests.", "Removed from sign-in events after " + esc(f.ipGun) + " days. For rate limiting it is held only in memory for about 1 minute; IP addresses are not written to the server access log.")}
${row("Notification device: push token, device type (iOS/Android), the phone's device name, last seen time", "To send you push notifications. Registered only when you allow notifications.", "While the account is open; you can remove the device in Notification Settings. Disabled when the account is closed and deleted " + esc(f.kimlikSilmeGun) + " days later.")}
${row("Notification history: title, text (e.g. customer name, order number, meters), read status", "To show the notification list and prevent the same notification from being sent twice.", "Completed notifications are deleted after " + esc(f.bildirimGun) + " days.")}
${row("Preferences: notification preferences, table/view preferences", "To show the app in the layout you chose.", "While the account is open.")}
${row("Records you enter on the phone (new order, new customer) and the sender's name", "To forward the record to the mill and show you the result. The original record is kept in the mill's system.", "In the cloud for the retention period chosen by the mill (13 months by default); the duplicate-protection receipt " + esc(f.islemGun) + " days. The sender's name is anonymized when the account is closed.")}
${row("Support requests (only if the Support feature is enabled): subject, message, screenshot, drawing or file you attach; name and account ID; app version, phone model and operating system version", "To resolve the issue you report.", "Not stored in the cloud; forwarded directly to " + SAGLAYICI.ad + "'s support system.")}
</tbody></table></div>`;
}

function bolumBir(f: LegalFacts): string {
  return `<div class="ust"><span>Effective date: ${YURURLUK}</span><a href="/gizlilik" hreflang="tr" lang="tr">Türkçe</a></div>
<h1>${UYGULAMA} — Privacy Policy</h1>
<p>This policy explains how your personal data is processed when you use the ${UYGULAMA} mobile app (Android and iOS) and the cloud server it connects to. This is a translation; if the two versions differ, the Turkish text prevails.</p>
<nav><ol>
<li><a href="#who">Data controller and contact</a></li><li><a href="#purpose">Purpose of the app</a></li>
<li><a href="#data">Data we process</a></li><li><a href="#permissions">App permissions</a></li>
<li><a href="#device">Data kept on your phone</a></li><li><a href="#sharing">Third parties</a></li>
<li><a href="#retention">Retention and deletion</a></li><li><a href="#security">Security</a></li>
<li><a href="#rights">Your rights</a></li><li><a href="#account-deletion">Account and data deletion</a></li>
<li><a href="#children">Children</a></li><li><a href="#changes">Changes</a></li>
</ol></nav>

<h2 id="who">1. Data controller and contact</h2>
<p><strong>Data controller:</strong> ${VS.unvan}<br>Address: ${VS.adres}, Türkiye<br>Email: <a href="mailto:${VS.eposta}">${VS.eposta}</a></p>
<p><strong>Software provider and support (data processor):</strong> ${SAGLAYICI.ad} — <a href="mailto:${SAGLAYICI.eposta}">${SAGLAYICI.eposta}</a>. ${SAGLAYICI.ad} develops, operates and supports the app and the cloud server on behalf of the data controller and does not use the data for its own purposes.</p>

<h2 id="purpose">2. Purpose of the app and who uses it</h2>
<p>${UYGULAMA} is for the owner of the Adnan Şahin textile mill and the employees the mill authorizes. It lets them follow the mill's orders, stock, shipping, production and customer accounts from the phone, and lets authorized users send new orders and new customers.</p>
<ul>
<li>There is no public sign-up; accounts cannot be created in the app. Accounts are users of the mill's own management system and are opened, changed and closed by the mill's administrator.</li>
<li>Sign-in uses the mill user name and password; two-step verification (authenticator app code) can optionally be turned on.</li>
<li>Business data shown in the app (orders, stock, customer/account names, etc.) belongs to the mill and is a read copy sent from the mill's system. It may include names of contact persons at customer companies; the mill is the controller of that data too.</li>
</ul>
<p><strong>Legal basis:</strong> performance of the working relationship and the service (KVKK Art. 5/2-c; GDPR Art. 6(1)(b)), legal obligations (KVKK Art. 5/2-ç; GDPR Art. 6(1)(c)) and legitimate interests such as account security (KVKK Art. 5/2-f; GDPR Art. 6(1)(f)).</p>

<h2 id="data">3. Data we process</h2>
${dataTable(f)}
<p>The app contains no advertising, analytics, crash reporting or tracking tools. Your location, contacts, photo library and advertising ID are not read. Your data is not sold and not used for advertising.</p>

<h2 id="permissions">4. App permissions and why</h2>
<h3>Notifications</h3>
<p>Requested for the results of records you send from the phone and the mill alerts you choose. Without it the app works without notifications. You choose which notifications you receive in Notification Settings. Some notifications show short business details on the lock screen (for example "new order: customer name, order no, meters").</p>
<h3>Microphone and speech recognition</h3>
<p>Used only when you want to fill in the new order form by voice, and only while you tap the microphone button. Your speech is converted to text by your phone's own speech recognition service: Apple's on iPhone, Google's on Android. These services may send the audio to their own servers for recognition, subject to that company's privacy terms. The app does not record audio and does not send it to the ${UYGULAMA} cloud; the resulting text is used only on the phone to fill in the form, and the order is sent only when you tap Send. Without this permission you can fill in the form by hand.</p>
<p>The app does not request location, camera, contacts or photo library permissions. A screenshot attached to a support request is taken only of the app's own screen and only when you ask for it.</p>

<h2 id="device">5. Data kept on your phone</h2>
<ul>
<li>Session key: in the phone's secure storage (iOS Keychain / Android Keystore).</li>
<li>Cache of the last received data: in the app's own storage, to show the last data when the connection drops. Excluded from Android backup. Deleted when you sign out.</li>
<li>View preferences (theme, table layout).</li>
</ul>
<p>Uninstalling the app deletes all of this data from the phone.</p>

<h2 id="sharing">6. Sharing with third parties</h2>
<p>Your data is not sold, rented or shared for advertising or marketing. It is transferred only to the following, so that the service works:</p>
<ul>
<li><strong>${SAGLAYICI.ad}</strong> — software provider and data processor: operating the cloud server, maintenance and support requests.</li>
<li><strong>Expo (650 Industries, Inc., USA)</strong> — push notification delivery service: push token, notification title and text.</li>
<li><strong>Google Firebase Cloud Messaging</strong> (Android) and <strong>Apple Push Notification service</strong> (iOS) — delivering the notification to your phone.</li>
<li><strong>Apple / Google speech recognition services</strong> — only when you use the microphone, through your phone's operating system (see section 4).</li>
<li>Authorized public authorities — only when required by law.</li>
</ul>
<p><strong>International transfers:</strong> servers of the notification and speech recognition providers may be located outside Türkiye (mainly in the USA). Transfers for notifications are made in line with KVKK Art. 9; if you do not allow notifications, no data is transferred abroad for notifications.</p>
`;
}

function bolumIki(f: LegalFacts): string {
  return `<h2 id="retention">7. Retention and deletion</h2>
<p>The retention period of each item is listed in the table above. Expired records are deleted or anonymized automatically by the cloud server's regular maintenance job. Daily backups of the cloud database are kept for 14 days; deleted data leaves the backups at the latest at the end of that period.</p>

<h2 id="security">8. Security</h2>
<ul>
<li>All connections between the app and the cloud are encrypted with HTTPS (TLS).</li>
<li>Data transfer between the mill and the cloud is started by the mill; every request is signed with the mill's installation key.</li>
<li>Passwords themselves are never stored; the password hash and the two-step verification key are kept encrypted. The server keeps the session key only as a hash.</li>
<li>Each account sees only the data it is authorized for; this separation is also enforced in the database.</li>
<li>Repeated failed sign-ins lock the account temporarily; excessive requests are limited.</li>
</ul>

<h2 id="rights">9. Your rights</h2>
<p>Under Article 11 of the Turkish Personal Data Protection Law No. 6698 (KVKK) you may ask the data controller to: learn whether your personal data is processed and request information about it; learn the purpose of processing and whether it is used accordingly; know the third parties in Türkiye or abroad to whom it is transferred; request correction of incomplete or inaccurate data; request deletion or destruction under KVKK Art. 7; request that corrections and deletions be notified to those third parties; object to a result against you arising solely from automated analysis; and claim compensation for damage caused by unlawful processing.</p>
<p>Send your request to <a href="mailto:${VS.eposta}">${VS.eposta}</a> or to the postal address above. Requests are answered free of charge within 30 days at the latest. If you are not satisfied with the answer you may complain to the Turkish Personal Data Protection Board.</p>
<p>Users in the European Union also have the GDPR rights of access, rectification, erasure, restriction of processing, data portability and objection, and may lodge a complaint with the data protection authority of their country.</p>

<h2 id="account-deletion">10. Account and data deletion request</h2>
<div class="kutu">
<p>The app has no button to create or delete an account; accounts are managed in the mill's management system. You can request deletion of your account and related data in two ways:</p>
<ol>
<li>Ask your administrator at the mill to close your account.</li>
<li>Or send an email with the subject "Account deletion request" and your user name to <a href="mailto:${VS.eposta}?subject=Account%20deletion%20request">${VS.eposta}</a> (copy: <a href="mailto:${SAGLAYICI.eposta}">${SAGLAYICI.eposta}</a>). After your identity is verified, the request is completed within 30 days at the latest.</li>
</ol>
</div>
<h3>What is deleted?</h3>
<ul>
<li>As soon as the account is closed: the password hash is deleted, open sessions end, sign-in is no longer possible and your notification devices are disabled.</li>
<li>${esc(f.kimlikSilmeGun)} days after closing: your name and user name are permanently anonymized; the two-step verification key, session records and notification device records are deleted; your name shown on records you sent from the phone is anonymized.</li>
</ul>
<h3>What is kept, and for how long?</h3>
<ul>
<li>An anonymous account number that does not identify you, with the account's permission and status data, is kept for record integrity.</li>
<li>Security log entries are kept until their own periods end (failed sign-ins ${esc(f.denetimGirisGun)} days, others ${esc(f.denetimGun)} days); the IP address in them is deleted after ${esc(f.ipGun)} days.</li>
<li>Notification history is kept for at most ${esc(f.bildirimGun)} days.</li>
<li>Orders and customers you sent from the phone are the mill's commercial records and stay in the mill's system for the legally required retention periods.</li>
<li>Data on your phone is deleted when you sign out or uninstall the app.</li>
</ul>

<h2 id="children">11. Children</h2>
<p>The app is only for adult employees authorized by the mill; it is not directed at anyone under 18 and does not knowingly collect data from children.</p>

<h2 id="changes">12. Changes</h2>
<p>This policy may be updated. The current text is always published at this address and opens from the "Privacy policy" link in the app. The effective date at the top of the page shows the latest update.</p>

<footer>${VS.unvan} · ${SAGLAYICI.ad}</footer>`;
}

export function privacyEn(f: LegalFacts): string {
  return sayfa({ lang: "en", baslik: `${UYGULAMA} — Privacy Policy`, govde: `${bolumBir(f)}\n${bolumIki(f)}` });
}
