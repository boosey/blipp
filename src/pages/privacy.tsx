import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-zinc-400 mb-10">Last updated: March 19, 2026</p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">1. Data We Collect</h2>
            <p>We collect the following types of information:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>
                <strong>Account information:</strong> Name, email address, and profile image
                provided through your authentication provider (Clerk)
              </li>
              <li>
                <strong>Usage data:</strong> Podcast subscriptions, briefing history, playback
                activity, and feature interactions
              </li>
              <li>
                <strong>Device information:</strong> Browser type, operating system, and device
                identifiers for push notifications
              </li>
              <li>
                <strong>Payment information:</strong> Billing details processed securely through
                Stripe (we do not store card numbers)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">2. How We Use Your Data</h2>
            <p>Your data is used to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Provide and personalize the Blipp service</li>
              <li>Generate tailored podcast briefings based on your subscriptions</li>
              <li>Process payments and manage your subscription</li>
              <li>Send push notifications about new briefings (with your consent)</li>
              <li>Improve the Service through aggregated, anonymized analytics</li>
              <li>Provide customer support</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">3. Data Sharing</h2>
            <p>
              We do not sell your personal data. We share data only with the following third-party
              services necessary to operate Blipp:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>
                <strong>Clerk:</strong> Authentication and user management
              </li>
              <li>
                <strong>Stripe:</strong> Payment processing
              </li>
              <li>
                <strong>Neon:</strong> Database hosting
              </li>
              <li>
                <strong>Cloudflare:</strong> Application hosting, content delivery, and storage
              </li>
              <li>
                <strong>Sentry:</strong> Error monitoring and performance tracking
              </li>
            </ul>
            <p className="mt-2">
              We may also disclose data when required by law or to protect our rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">4. Cookies and Local Storage</h2>
            <p>
              Blipp uses cookies and browser local storage for authentication sessions, user
              preferences (such as theme and consent choices), and essential service functionality.
              We do not use third-party advertising cookies. You can manage cookie preferences
              through the consent banner shown on your first visit.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">5. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. Briefing and
              playback history is retained for the duration of your account. If you delete your
              account, we will remove your personal data within 30 days, except where retention
              is required by law or for legitimate business purposes (e.g., billing records).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">6. Your Rights (GDPR)</h2>
            <p>
              If you are located in the European Economic Area, you have the following rights
              regarding your personal data:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>
                <strong>Access:</strong> Request a copy of the data we hold about you
              </li>
              <li>
                <strong>Correction:</strong> Request correction of inaccurate data
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your data ("right to be forgotten")
              </li>
              <li>
                <strong>Export:</strong> Download your data in a portable format
              </li>
              <li>
                <strong>Restriction:</strong> Request that we limit processing of your data
              </li>
              <li>
                <strong>Objection:</strong> Object to processing based on legitimate interests
              </li>
            </ul>
            <p className="mt-2">
              You can exercise your right to data export and account deletion directly from your{" "}
              <Link to="/settings" className="text-blue-400 hover:text-blue-300">
                Settings
              </Link>{" "}
              page. For other requests, contact us at the address below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">7. Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your data,
              including encryption in transit (TLS), secure authentication, and access controls.
              However, no method of transmission or storage is completely secure, and we cannot
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">8. Children's Privacy</h2>
            <p>
              Blipp is not intended for children under 13. We do not knowingly collect personal
              data from children. If you believe a child has provided us with personal data,
              please contact us so we can remove it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by posting the updated policy on this page with a revised "Last updated"
              date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">10. Contact Us</h2>
            <p>
              For privacy-related questions or to exercise your rights, contact us at{" "}
              <a href="mailto:privacy@podblipp.com" className="text-blue-400 hover:text-blue-300">
                privacy@podblipp.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="text-center mt-12">
          <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            &larr; Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
