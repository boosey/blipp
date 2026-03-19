import { Link } from "react-router-dom";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 py-20 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-zinc-400 mb-10">Last updated: March 19, 2026</p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Blipp ("the Service"), operated at podblipp.com, you agree to
              be bound by these Terms of Service. If you do not agree to these terms, do not use
              the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">2. Description of Service</h2>
            <p>
              Blipp is a podcast briefing platform that distills podcast episodes into short audio
              briefings. The Service includes content discovery, personalized briefing generation,
              audio playback, and related features available through the web application.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">3. User Accounts</h2>
            <p>
              To use certain features, you must create an account. You are responsible for
              maintaining the confidentiality of your account credentials and for all activities
              that occur under your account. You agree to provide accurate and complete information
              when creating your account and to update it as necessary.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">4. Subscriptions and Payments</h2>
            <p>
              Blipp offers free and paid subscription plans. Paid plans are billed on a recurring
              basis. You may cancel your subscription at any time through your account settings or
              the billing portal. Refunds are handled in accordance with our refund policy.
              Pricing is subject to change with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Use the Service for any unlawful purpose</li>
              <li>Attempt to reverse engineer, decompile, or disassemble the Service</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Share your account credentials with third parties</li>
              <li>Use automated tools to scrape or access the Service without permission</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">6. Intellectual Property</h2>
            <p>
              The Service, including its design, code, and branding, is the property of Blipp and
              is protected by intellectual property laws. Podcast content processed through the
              Service remains the property of its respective owners. AI-generated briefings are
              derivative works created for personal, non-commercial use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">7. Limitation of Liability</h2>
            <p>
              The Service is provided "as is" without warranties of any kind. To the maximum
              extent permitted by law, Blipp shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, including loss of data or profits,
              arising from your use of the Service. Our total liability shall not exceed the
              amount you paid for the Service in the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">8. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time for violation
              of these terms or for any other reason at our sole discretion. You may delete your
              account at any time through your account settings. Upon termination, your right to
              use the Service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">9. Changes to Terms</h2>
            <p>
              We may update these terms from time to time. We will notify you of material changes
              by posting the updated terms on this page with a revised "Last updated" date.
              Continued use of the Service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">10. Governing Law</h2>
            <p>
              These terms are governed by and construed in accordance with the laws of the United
              States. Any disputes arising from these terms or the Service shall be resolved in
              the courts of competent jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-50 mb-3">11. Contact</h2>
            <p>
              If you have questions about these terms, please contact us at{" "}
              <a href="mailto:support@podblipp.com" className="text-blue-400 hover:text-blue-300">
                support@podblipp.com
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
