# ATS Tutoring

The site uses Google sign-in and Firestore. The first version lets students apply, check their application status, search for approved tutors by subject, and arrange sessions by school email.

## Publish with GitHub Pages

1. Create a public GitHub repository named `ats-tutoring`. Initialize it with a README so it has a `main` branch.
2. In the repository, choose **Add file → Upload files**. Upload `index.html`, `style.css`, `script.js`, and `firebase.js` at the top level and commit them.
3. Go to **Settings → Pages**. Choose **Deploy from a branch**, select `main` and `/ (root)`, and save. When GitHub publishes the site, this page shows the link, typically `https://YOUR-USERNAME.github.io/ats-tutoring/`.
4. Use `YOUR-USERNAME.github.io` as the Firebase Authentication authorized domain. Use the full site link followed by `?review=1` as the Firestore `reviewUrl`.

GitHub Pages serves the website files. Firebase handles school sign-in, student applications, and reviewer notifications. Complete the Firebase setup and run a test submission before sharing the link with students.

## Firebase setup

1. In the `ats-tutoring` Firebase project, enable Google as an Authentication sign-in provider. Add the hostname where the site runs to **Authentication → Settings → Authorized domains**. Serve the site over HTTP locally or HTTPS when hosted.
2. In Firestore, create the document `settings/review` with two string fields. Set `reviewerEmail` to your lowercase `@ats.edu.mx` address. Set `reviewUrl` to the deployed site URL with `?review=1` appended, such as `https://ats-tutoring.web.app/?review=1` if using that hostname. The same school account can review applications and receives notifications.
3. Publish [firestore.rules](firestore.rules) to the Firestore database. You can paste the file into **Firestore Database → Rules**, or run `firebase deploy --only firestore:rules --project ats-tutoring` from this folder with the Firebase CLI.

Each new application creates a private application and a reviewer notification in one Firestore transaction. The email links to the dashboard, where the reviewer signs in and saves a decision for each requested subject. A new submission is limited to one per ATS account. The reviewer can update a decision in the dashboard. Older applications remain in Firestore and can be reviewed there. The reviewer can re-save an existing approval to publish it in the directory. Only applications with explicit email-sharing consent publish a contact address.

## Set up free email notifications

1. Sign in to [Google Apps Script](https://script.google.com/home) with the Google account that manages the ATS Tutoring Firebase project. Create a private standalone project named **ATS Tutoring notifications**.
2. In the editor, replace the contents of `Code.gs` with [apps-script/Code.gs](apps-script/Code.gs). In **Project Settings**, turn on **Show "appsscript.json" manifest file in editor**. Replace the manifest with [apps-script/appsscript.json](apps-script/appsscript.json) and save both files.
3. Select **checkNotifier** in the function dropdown and click **Run**. Review and authorize the Google permission prompt with the project-managing account. Check the execution log for confirmation that Firestore is accessible and that the account has email quota. This step sends zero emails.
4. Select **installNotifier** and click **Run** to install the five-minute trigger. Set up only one notifier project. The script sends pending alerts to the current `reviewerEmail`, and removes each notification from the queue after Google accepts it for sending. Tutor applications remain in Firestore.

The account that installs the trigger owns the automation and sends the email. To change the reviewer, update `settings/review.reviewerEmail` to the new reviewer's ATS Google address. That change controls both future notifications and dashboard access. To transfer the automation itself, remove the old trigger and install the notifier using the school's designated account with Firestore access.

## Check before launch

- Sign in with a personal Google account and confirm access is denied. Sign in with an ATS student account and check that the reviewer dashboard is restricted.
- Submit a test application as a student. Confirm that it appears as awaiting approval and that the reviewer receives the email after the next scheduled run. If it does not arrive, check the Apps Script **Executions** log, the `mail` queue in Firestore, and the reviewer's spam folder.
- Sign in as reviewer and approve one subject and decline another. Sign back in as a student and confirm the application reports both decisions and the directory returns the tutor for the approved subject. Open the profile and check the email link.
- Decline the remaining approved subject and confirm the tutor is removed from the directory. Use a different student account to confirm application status only shows that account's own applications.

## Session scheduling and profile revisions

Students request a one-hour session from an approved tutor profile, choosing an approved subject, format, date and available start time (up to 60 days ahead). Times use Tampico school time, UTC−06:00. A request stays pending until its tutor accepts and supplies meeting details. Both parties see live updates under **My sessions**, can cancel upcoming requests/sessions, and can download an accepted session as an `.ics` calendar file. Session email notifications are not enabled; the existing Apps Script still sends tutor-application review emails.

Session details are readable only by the two participants. Tutor contact details remain in private applications and are copied into a session only when its tutor accepts; cancellation removes those copied contacts. Public tutor documents no longer contain email/phone fields. The reviewer dashboard upgrades legacy tutor documents to include their owner UID and removes previously published contact fields before enabling scheduling for them.

Each acceptance atomically reserves the tutor and student for that hour using `scheduleLocks`. Concurrent acceptance cannot book either participant twice. Cancellation releases both reservations. Booking is currently individual; the tutor's group-capacity preference is retained for future group scheduling.

Tutors use **My tutor profile & application → Edit profile / application**. Approved tutors save all profile edits immediately, including subject changes. The transaction preserves initial review metadata and creation time, updates the private application and the contact-free directory listing together, and queues no reviewer email. Pending or rejected applicants still require initial approval; removed tutors cannot restore themselves. Confirmed sessions retain their agreed time, rate and meeting details. Removed tutor accounts must contact the reviewer instead of editing a removed application.

Deploy `firestore.rules` before publishing matching frontend files. The new collections are `sessionRequests`, `scheduleLocks` and private `profileEdits` receipts (used to bind legacy application IDs to review notification writes). No paid Firebase services or new packages are used.

Run the isolated backend checks with `node tests/scheduling.test.cjs`. These execute the actual Firebase module against an in-memory transaction adapter and never write real Firebase data. They cover participant ownership, private contacts, revisions, removal restrictions, validation, midnight/timezone behavior, duplicate requests, competing acceptances, student and tutor conflicts, cancellation and listener cleanup. Browser fixture checks and rules compilation complement these checks; a two-school-account production smoke test is still recommended before rollout.

## Help reports and reviewer access

The shared footer opens **Help / Report an issue** on every screen. School Google sign-in is required to send. Reports contain only a category, message and submission time; report emails do not include the sender's account name/email. This is **not full anonymity**: `supportLimits/{uid}` is a private spam-control record linking the latest report to its account, and messages can themselves contain identifying details. The form explains this before submission.

Each account can send up to three reports per UTC day. Firestore transactions and rules bind each report to one counter increment, so a batch cannot submit multiple reports using a single quota increment. Students cannot read queued reports or other users' counters.

The existing five-minute Apps Script handler now checks both `mail` and `supportReports`, preserving acknowledgement/retry behavior. It validates the report format, emails its text to `settings/review.supportEmail` (falling back to `reviewerEmail`), then removes the queued report after sending. It uses the existing scopes and IAM role; no paid service or new email permission is needed. Application and report emails share the sender account's daily MailApp quota; unsent messages remain queued when quota is exhausted.

**Profile** in the header opens the student's own tutor application and edit option, or an invitation to sign up. **My Sessions** opens their schedule. The prominent blue **Review tutor applications** button appears only when the signed-in school email matches `settings/review.reviewerEmail`. Firestore also enforces reviewer access; hiding the button is not the security boundary. Change `reviewerEmail` when the vice principal takes over, and keep `supportEmail` set independently if reports should still go to the website coordinator.

Run `node tests/scheduling.test.cjs` and `node tests/notifier.test.cjs` for backend, privacy-field, quota and sender regression checks.

## Homepage visual refinements

- Sign out uses the same 42px header height and vertical alignment as the other account buttons.
- Find a Tutor and Sign Up as a Tutor use the same 17px label size as the reviewer button.
- Your Next Step includes a small original inline SVG book illustration in school colors, alongside the mathematics symbols. The decorative illustration is hidden from assistive technology, and card animation respects reduced-motion preferences. No image-storage service or new dependency is needed.

## School-named address

On November 24, 2026, the existing public repository was transferred to `ATSTutoring/atstutoring.github.io`, preserving source history. The live website is https://atstutoring.github.io/ and Pages publishes from `main`, root. The organization uses GitHub Free and the dedicated website Gmail for notices; no collaborators were invited. Firebase remains in the existing project. Its authorized domains include `atstutoring.github.io`, and `settings/review.reviewUrl` is `https://atstutoring.github.io/?review=1`. School-account sign-in and profile access were verified at the new address. The existing sender reads this reviewer URL dynamically; a fresh application email was not sent during migration. Replace previously shared website links: GitHub Pages URLs at the previous owner are not automatically redirected after repository transfer.

## Shared school-color styling

The homepage and shared screens use stronger blue gradients, red-and-blue banners, colored card edges and highlighted progress panels. Search, signup, profiles, sessions, reviewer views and Help share the school palette. These are static HTML/CSS changes using the existing free hosting.

## Pilot notices and online meetings

The shared footer includes a compact tutoring expectations notice and an expandable privacy summary, with the current coordinator address for correction/deletion requests. School-approved privacy ownership, retention and rollout arrangements remain to be confirmed. Online tutors enter a separate HTTPS call-link field when accepting; the link and optional instructions are stored together in the existing private meetingDetails field (250 characters total). Confirmed participants get a Join session link; the meeting URL is never added to the public tutor directory. The site does not create Zoom/Meet calls itself.
