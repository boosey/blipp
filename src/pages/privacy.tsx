import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          &larr; Back to home
        </Link>
        <h1 className="text-4xl font-bold mb-2 mt-8">Privacy Policy</h1>
        <p className="text-zinc-400 mb-10">Last updated: April 21, 2026</p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">1. Data We Collect</h2>
            <p>We collect the following types of information:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>
                <strong>Account information:</strong> Name, email address, and profile image
                provided through your authentication provider (Clerk). If you sign in with Apple
                or Google, we receive basic profile information from those providers.
              </li>
              <li>
                <strong>Preferences:</strong> Podcast subscriptions, topic interests, voice and
                duration preferences, and other settings you choose
              </li>
              <li>
                <strong>Usage data:</strong> Briefing history, playback activity, and feature
                interactions, stored in our database to deliver the service. We do not use
                third-party web analytics.
              </li>
              <li>
                <strong>Device information:</strong> Browser type, operating system, and
                platform-specific details used to deliver the Service
              </li>
              <li>
                <strong>Payment information:</strong> Billing details processed securely through
                Stripe (web) or Apple's App Store via RevenueCat (iOS in-app purchases). We do
                not store card numbers.
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
              <li>Improve the Service using aggregated, anonymized usage data from our own systems</li>
              <li>Provide customer support</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">3. Data Sharing</h2>
            <p>
              We do not sell your personal data, and we do not share your data with advertising
              networks or data brokers. We share data only with the following third-party services
              needed to operate Blipp:
            </p>
            <p className="mt-3 font-semibold text-zinc-50">Infrastructure</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>
                <strong>Cloudflare:</strong> Application hosting, content delivery, file storage,
                and request logs
              </li>
              <li>
                <strong>Neon:</strong> PostgreSQL database hosting for your account and briefing
                data
              </li>
              <li>
                <strong>Clerk:</strong> Authentication and user management
              </li>
            </ul>
            <p className="mt-3 font-semibold text-zinc-50">Payments and subscriptions</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>
                <strong>Stripe:</strong> Payment processing for web subscriptions
              </li>
              <li>
                <strong>Apple:</strong> In-App Purchase processing and receipt verification for
                iOS subscriptions
              </li>
              <li>
                <strong>RevenueCat:</strong> Subscription management for iOS in-app purchases
              </li>
            </ul>
            <p className="mt-3 font-semibold text-zinc-50">Sign-in providers (only if you choose them)</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>
                <strong>Apple</strong> (Sign in with Apple)
              </li>
              <li>
                <strong>Google</strong> (Sign in with Google)
              </li>
            </ul>
            <p className="mt-3 font-semibold text-zinc-50">Content processing</p>
            <p className="text-sm text-zinc-400 mt-1">
              We use the following AI providers to transcribe podcast audio, summarize episodes,
              and generate briefing narration. We send them podcast content (audio, transcripts,
              and episode metadata) — we do not send your name, email, account identifiers, or
              other personal data.
            </p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>
                <strong>Anthropic:</strong> Claude language models for summarization and
                briefing generation
              </li>
              <li>
                <strong>OpenAI:</strong> Speech-to-text transcription and language models
              </li>
              <li>
                <strong>Groq:</strong> Speech-to-text, text-to-speech, and language model
                inference
              </li>
              <li>
                <strong>Cloudflare Workers AI:</strong> On-platform AI inference
              </li>
            </ul>
            <p className="mt-4">
              We may also disclose data when required by law or to protect our rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">4. Cookies and Local Storage</h2>
            <p>
              Blipp uses cookies and browser local storage for authentication sessions, user
              preferences (such as theme and consent choices), and essential service functionality.
              We do not use third-party advertising cookies or web analytics trackers, and Blipp
              does not include any advertising SDKs. If we add an audio ad provider in the future,
              we will update this policy before serving any ads. You can manage cookie preferences
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
