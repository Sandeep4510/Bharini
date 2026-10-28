import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = { title: 'Terms & Conditions · Bharini' };

const LAST_UPDATED = '28 October 2026';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

const list = 'list-disc space-y-1.5 pl-5';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <Link href="/" className="text-sm text-violet-300 hover:text-violet-200">
            ← Bharini
          </Link>
          <h1 className="text-3xl font-semibold">Terms &amp; Conditions</h1>
          <p className="text-sm text-slate-400">Last updated: {LAST_UPDATED}</p>
        </header>

        <Section id="introduction" title="1. Introduction">
          <p>
            Bharini (&quot;we&quot;, &quot;us&quot;) is an online platform where artists and technicians (actors, singers,
            musicians, dancers, directors, camera crew and others) show their work, and production houses and producers
            discover talent and publish casting calls. These Terms form a binding agreement between you and Bharini. By
            creating an account, signing in with Google, or using Bharini in any way, you agree to these Terms. If you do
            not agree, do not use Bharini.
          </p>
          <p>
            Bharini is an intermediary under the Information Technology Act, 2000 and the Information Technology
            (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021. We process personal data under the
            Digital Personal Data Protection Act, 2023 (&quot;DPDP Act&quot;).
          </p>
        </Section>

        <Section id="eligibility" title="2. Who can use Bharini">
          <ul className={list}>
            <li>You must give true, current information about yourself, including your real name and date of birth.</li>
            <li>You may hold only one personal account, and only for yourself, unless you are a parent or guardian managing a minor&apos;s account under section 3.</li>
            <li>A production house account must be run by someone authorised to act for that business.</li>
            <li>You must not use Bharini if we have suspended or removed your account before, or if the law bars you from it.</li>
          </ul>
        </Section>

        <Section id="minors" title="3. Children and minors">
          <p>
            The DPDP Act treats anyone under 18 as a child. Under the Indian Contract Act, 1872, a minor cannot enter a
            binding contract alone. For these reasons:
          </p>
          <ul className={list}>
            <li>
              <strong className="text-white">Under 16:</strong> the account must be created, owned and managed by the
              child&apos;s parent or lawful guardian. The guardian accepts these Terms on the child&apos;s behalf and is
              responsible for all activity on the account, including messages and applications.
            </li>
            <li>
              <strong className="text-white">16 and 17:</strong> the user may operate the account only with the
              verifiable consent of a parent or lawful guardian, and under their guidance and supervision.
            </li>
            <li>
              When a date of birth under 18 is entered, we ask for the parent or guardian&apos;s name and consent before
              the profile can be completed. We may ask for proof of guardianship, and we may suspend an account until we
              receive it.
            </li>
            <li>
              In line with the DPDP Act, we do not track or monitor children&apos;s behaviour, we do not target
              advertising at them, and we do not process their data in ways likely to harm their well-being.
            </li>
            <li>
              Production houses that contact or cast a minor must deal through the parent or guardian. They must follow
              the Child and Adolescent Labour (Prohibition and Regulation) Act, 1986 and its rules for child artists,
              including permissions, working hours, schooling and safety, together with any guidelines from the National
              Commission for Protection of Child Rights.
            </li>
            <li>
              Any sexual, exploitative or inappropriate contact with a minor is strictly prohibited. We will remove it
              and report it to the authorities, including under the Protection of Children from Sexual Offences (POCSO)
              Act, 2012.
            </li>
          </ul>
        </Section>

        <Section id="account" title="4. Your account">
          <ul className={list}>
            <li>Keep your password secret. You are responsible for everything done through your account.</li>
            <li>Tell us right away if you think someone else has accessed your account.</li>
            <li>
              <strong className="text-white">Deleting your account:</strong> you can delete your account at any time
              from Settings. It is hidden at once. For 90 days you can restore it by logging in and confirming the link
              we email you. After 90 days, your account details, profile, portfolio, posts, comments, connections,
              follows and messages are deleted permanently and cannot be recovered. We may keep limited records where
              the law requires it.
            </li>
          </ul>
        </Section>

        <Section id="content" title="5. Your content and rights">
          <p>
            You own the photos, videos, audio, documents and text you upload (&quot;your content&quot;). You give Bharini a
            non-exclusive, royalty-free, worldwide licence to host, store, display, resize and share your content, only to
            run and promote the service, for as long as it is on Bharini. You can remove your content at any time.
          </p>
          <p>
            You promise that you have the rights to everything you upload. This includes the consent of every
            identifiable person in it and, for minors, the consent of their parent or guardian.
          </p>
        </Section>

        <Section id="dos-and-donts" title="6. Dos and don'ts">
          <p>You agree to:</p>
          <ul className={list}>
            <li>follow all applicable laws, including Indian law;</li>
            <li>give accurate information about yourself, your work and your casting calls;</li>
            <li>treat other members with respect.</li>
          </ul>
          <p>You must not:</p>
          <ul className={list}>
            <li>create a fake profile, impersonate anyone, or misrepresent your identity, age or authority;</li>
            <li>post fake casting calls, or ask artists for money to audition, register or be cast (&quot;pay-to-play&quot;);</li>
            <li>harass, threaten, stalk, bully or discriminate against anyone, or send unwanted sexual content;</li>
            <li>upload content that is obscene, defamatory, hateful, violent, or that harms children;</li>
            <li>copy, scrape or misuse other members&apos; photos, videos or contact details;</li>
            <li>spam people, or use bots, scripts or other automated means to access Bharini;</li>
            <li>infringe anyone&apos;s copyright, trademark, privacy or other rights;</li>
            <li>upload malware, or try to break, overload or get around Bharini&apos;s security.</li>
          </ul>
        </Section>

        <Section id="safety" title="7. Blocking, reporting and safety">
          <p>
            You can block any member. You will no longer see each other&apos;s posts, comments, profile or messages, and
            any connection or follow between you is removed. Meet people you contact through Bharini in safe, public
            places. Never share bank details, OTPs or passwords. Bharini does not verify every casting call, so use your
            own judgement before you accept an offer.
          </p>
        </Section>

        <Section id="privacy" title="8. Privacy">
          <p>
            We collect and use your personal data only to provide Bharini. This includes your name, email, date of birth,
            photos, media, location and messages. Your date of birth and contact details are not shown publicly. Under
            the DPDP Act you have the right to access, correct and erase your data, to withdraw consent, and to raise a
            grievance.
          </p>
        </Section>

        <Section id="termination" title="9. Suspension and termination">
          <p>
            We may suspend or remove content or accounts that break these Terms or the law, or that put other members at
            risk. Where the law allows, we will tell you why. You may stop using Bharini at any time.
          </p>
        </Section>

        <Section id="disclaimer" title="10. Disclaimer and limitation of liability">
          <p>
            Bharini is provided &quot;as is&quot;. We connect artists and production houses, but we are not a party to any
            agreement between them. We do not guarantee any job, role, payment or result, and we are not responsible
            for what members say or do. To the extent the law allows, our total liability to you is limited to the
            amount you paid us in the 12 months before the claim, if any.
          </p>
        </Section>

        <Section id="changes" title="11. Changes to these Terms">
          <p>
            We may update these Terms. If a change is significant, we will tell you in the app or by email before it
            takes effect. If you keep using Bharini after that, you accept the new Terms.
          </p>
        </Section>

        <Section id="law" title="12. Governing law and disputes">
          <p>
            These Terms are governed by the laws of India. Courts in India have exclusive jurisdiction over any dispute
            arising from them.
          </p>
        </Section>

        <Section id="grievance" title="13. Grievance Officer and contact">
          <p>
            Under the IT Rules, 2021 and the DPDP Act, you may raise complaints about content, safety or your personal
            data with our Grievance Officer. We will acknowledge each complaint within 24 hours and resolve it within the
            time set by law.
          </p>
          <p>Grievance Officer: [name to be added] · Email: [email to be added] · Address: [address to be added]</p>
        </Section>
      </article>
    </main>
  );
}
