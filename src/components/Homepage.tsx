import { Link } from 'react-router-dom'

function Icon({
  name,
  size = 24,
}: {
  name: 'headphones' | 'book' | 'pen' | 'arrow' | 'clock' | 'check' | 'play' | 'monitor'
  size?: number
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (name) {
    case 'headphones':
      return (
        <svg {...common}>
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M3 17a3 3 0 0 0 3 3h1v-8H6a3 3 0 0 0-3 3v2Z" />
          <path d="M21 17a3 3 0 0 1-3 3h-1v-8h1a3 3 0 0 1 3 3v2Z" />
        </svg>
      )

    case 'book':
      return (
        <svg {...common}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M8 7h8" />
          <path d="M8 10h6" />
        </svg>
      )

    case 'pen':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
          <path d="m15 5 3 3" />
        </svg>
      )

    case 'arrow':
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      )

    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )

    case 'check':
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      )

    case 'play':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m10 8 6 4-6 4V8Z" />
        </svg>
      )

    case 'monitor':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      )
  }
}


/* =========================================================
   HERO EXAM PREVIEW
   A CSS/SVG-based visual so the homepage does not need
   an external image asset.
   ========================================================= */

function ExamPreview() {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 520,
        margin: '0 auto',
      }}
    >
      {/* Decorative background circles */}
      <div
        style={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'rgba(0, 95, 175, 0.08)',
          right: -40,
          top: -50,
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: 'rgba(56, 189, 248, 0.12)',
          left: -25,
          bottom: 30,
        }}
      />

      {/* Main monitor */}
      <div
        style={{
          position: 'relative',
          background: '#FFFFFF',
          border: '1px solid #DCE6F2',
          borderRadius: 18,
          padding: 10,
          boxShadow:
            '0 30px 70px rgba(15, 55, 100, 0.15), 0 8px 20px rgba(15, 55, 100, 0.06)',
        }}
      >
        {/* Browser top bar */}
        <div
          style={{
            height: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 9px',
            borderBottom: '1px solid #EDF1F6',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#CBD5E1',
            }}
          />
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#CBD5E1',
            }}
          />
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#CBD5E1',
            }}
          />

          <div
            style={{
              marginLeft: 10,
              height: 16,
              flex: 1,
              borderRadius: 5,
              background: '#F5F7FA',
            }}
          />
        </div>

        {/* Exam application */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '72px 1fr',
            minHeight: 310,
          }}
        >
          {/* Sidebar */}
          <div
            style={{
              background: '#F7F9FC',
              borderRight: '1px solid #E7EDF4',
              padding: '18px 9px',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                margin: '0 auto 25px',
                borderRadius: 10,
                background: '#005FAF',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              OET
            </div>

            {[1, 2, 3, 4].map((item) => (
              <div
                key={item}
                style={{
                  width: 38,
                  height: 34,
                  margin: '0 auto 8px',
                  borderRadius: 8,
                  background: item === 2 ? '#E5EFF9' : 'transparent',
                  color: item === 2 ? '#005FAF' : '#94A3B8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {String(item).padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Main exam area */}
          <div style={{ padding: 22 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 22,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    color: '#64748B',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 4,
                  }}
                >
                  Reading · Part B
                </div>

                <div
                  style={{
                    fontFamily: 'Georgia, serif',
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#122033',
                  }}
                >
                  Question 04
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 9px',
                  borderRadius: 999,
                  background: '#E5EFF9',
                  color: '#005FAF',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                <Icon name="clock" size={13} />
                18:42
              </div>
            </div>

            <div
              style={{
                width: '76%',
                height: 8,
                borderRadius: 4,
                background: '#E8EEF5',
                marginBottom: 10,
              }}
            />

            <div
              style={{
                width: '91%',
                height: 8,
                borderRadius: 4,
                background: '#E8EEF5',
                marginBottom: 10,
              }}
            />

            <div
              style={{
                width: '63%',
                height: 8,
                borderRadius: 4,
                background: '#E8EEF5',
                marginBottom: 24,
              }}
            />

            {[1, 2, 3].map((item) => (
              <div
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '9px 11px',
                  border: `1px solid ${
                    item === 2 ? '#A9C7EE' : '#E3EAF2'
                  }`,
                  background: item === 2 ? '#F2F7FC' : '#FFFFFF',
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    border: `1.5px solid ${
                      item === 2 ? '#005FAF' : '#CBD5E1'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {item === 2 && (
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: '#005FAF',
                      }}
                    />
                  )}
                </div>

                <div
                  style={{
                    width: `${45 + item * 12}%`,
                    height: 6,
                    borderRadius: 3,
                    background: '#E5EBF2',
                  }}
                />
              </div>
            ))}

            <div
              style={{
                marginTop: 18,
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <div
                style={{
                  padding: '8px 15px',
                  borderRadius: 8,
                  background: '#005FAF',
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              >
                Next question →
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating score card */}
      <div
        style={{
          position: 'absolute',
          right: -20,
          bottom: -24,
          background: '#FFFFFF',
          border: '1px solid #E1E9F3',
          borderRadius: 14,
          padding: '14px 16px',
          boxShadow: '0 14px 30px rgba(15, 55, 100, 0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 170,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            background: '#ECFDF3',
            color: '#3F9928',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="check" size={20} />
        </div>

        <div>
          <div
            style={{
              fontSize: 10,
              color: '#64748B',
              marginBottom: 2,
            }}
          >
            Practice progress
          </div>

          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: '#122033',
            }}
          >
            12 / 15
          </div>
        </div>
      </div>
    </div>
  )
}


/* =========================================================
   HOMEPAGE
   ========================================================= */

function Homepage() {
  return (
    <div>
      {/* =====================================================
          NAVIGATION
          ===================================================== */}

      <nav className="nav">
        <Link
          to="/"
          className="nav-logo"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <img src="/logo.png" alt="YouEngage OET Training Centre" width={40} height={40} style={{ display: 'block', borderRadius: '50%' }} />

          <span>YouEngage OET</span>
        </Link>

        <div className="nav-links">
          <a href="#offerings">Practice</a>

          <a href="#how-it-works">How it works</a>

          <Link to="/exam">Have a code?</Link>

          <Link to="/login?mode=login">
            <button className="btn-secondary">Log in</button>
          </Link>

          <Link to="/login">
            <button className="btn-primary" style={{ padding: '10px 18px' }}>Sign up</button>
          </Link>
        </div>
      </nav>


      {/* =====================================================
          HERO
          ===================================================== */}

      <section className="hero">
        <div>
          <span className="eyebrow">
            Occupational English Test preparation
          </span>

          <h1>
            Prepare for OET with
            <span style={{ color: 'var(--color-success)' }}>
              {' '}confidence.
            </span>
          </h1>

          <p className="hero-sub">
            Realistic computer-based practice designed to help you
            prepare for Listening, Reading, and Writing under
            authentic exam-style conditions.
          </p>

          <div className="hero-cta-row">
            <Link
              to="/login"
              style={{
                textDecoration: 'none',
              }}
            >
              <button className="btn-primary">
                Sign up free
                <span style={{ marginLeft: 8 }}>
                  <Icon name="arrow" size={17} />
                </span>
              </button>
            </Link>

            <Link
              to="/login?mode=login"
              style={{
                textDecoration: 'none',
              }}
            >
              <button className="btn-secondary">
                Log in
              </button>
            </Link>
          </div>

          <p style={{ marginTop: 18, fontSize: 14, color: 'var(--color-ink-muted)' }}>
            Have an access code from your tutor?{' '}
            <Link to="/exam" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
              Start a practice test
            </Link>
          </p>

          {/* Small reassurance row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              flexWrap: 'wrap',
              marginTop: 28,
              color: 'var(--color-ink-muted)',
              fontSize: 12,
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--color-success-light)',
                  color: 'var(--color-success)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="check" size={13} />
              </span>
              Exam-style practice
            </span>

            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="monitor" size={13} />
              </span>
              Computer-based
            </span>
          </div>
        </div>

        <div className="hero-visual">
          <ExamPreview />
        </div>
      </section>


      {/* =====================================================
          FEATURE STRIP
          ===================================================== */}

      <section
        style={{
          background: '#FFFFFF',
          borderTop: '1px solid var(--color-border-light)',
          borderBottom: '1px solid var(--color-border-light)',
          padding: '26px 48px',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--container-width)',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
          }}
        >
          {[
            {
              icon: 'monitor' as const,
              title: 'Computer-based',
              text: 'Practice in a digital environment built for the modern OET experience.',
            },
            {
              icon: 'clock' as const,
              title: 'Timed practice',
              text: 'Build confidence working under realistic time pressure.',
            },
            {
              icon: 'check' as const,
              title: 'Instant progress',
              text: 'See your objective results as soon as your test is complete.',
            },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '4px 12px',
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  flexShrink: 0,
                  borderRadius: 12,
                  background: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={item.icon} size={20} />
              </div>

              <div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 13,
                    color: 'var(--color-ink)',
                    marginBottom: 2,
                  }}
                >
                  {item.title}
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--color-ink-muted)',
                    lineHeight: 1.45,
                  }}
                >
                  {item.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>


      {/* =====================================================
          WHAT WE OFFER
          ===================================================== */}

      <section className="section" id="offerings">
        <div className="section-heading">
          <span className="folder-tab">
            What we offer
          </span>

          <h2>
            Practice built around the real exam
          </h2>

          <p>
            Focus on the skills that matter with dedicated
            practice for each OET sub-test.
          </p>
        </div>

        <div className="subtest-grid">
          {/* Listening */}
          <div className="subtest-card">
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 14,
                background: '#E5EFF9',
                color: '#005FAF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <Icon name="headphones" size={24} />
            </div>

            <span className="folder-tab">
              Listening
            </span>

            <h3>
              Listen with confidence
            </h3>

            <p>
              Case notes, workplace extracts, and presentations
              give you focused listening practice in a
              computer-based environment.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 20,
                color: 'var(--color-primary)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Explore listening practice
              <Icon name="arrow" size={14} />
            </div>
          </div>


          {/* Reading */}
          <div className="subtest-card">
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 14,
                background: '#EAF3FB',
                color: '#0356A6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <Icon name="book" size={24} />
            </div>

            <span className="folder-tab">
              Reading
            </span>

            <h3>
              Read under pressure
            </h3>

            <p>
              Work through workplace texts and question sets
              while developing the pace and accuracy needed
              for the test.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 20,
                color: 'var(--color-primary)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Explore reading practice
              <Icon name="arrow" size={14} />
            </div>
          </div>


          {/* Writing */}
          <div className="subtest-card">
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: 14,
                background: '#F0F7FF',
                color: '#005FAF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <Icon name="pen" size={24} />
            </div>

            <span className="folder-tab">
              Writing
            </span>

            <h3>
              Write with purpose
            </h3>

            <p>
              Work from realistic case notes and practise
              producing the professional letters expected
              in the OET Writing sub-test.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 20,
                color: 'var(--color-primary)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Explore writing practice
              <Icon name="arrow" size={14} />
            </div>
          </div>
        </div>
      </section>


      {/* =====================================================
          HOW IT WORKS
          ===================================================== */}

      <section
        className="section"
        id="how-it-works"
        style={{
          paddingTop: 20,
        }}
      >
        <div className="section-heading">
          <span className="folder-tab">
            How it works
          </span>

          <h2>
            From sign-up to results
          </h2>

          <p>
            Create an account, choose your exam, and start practising --
            no class or waiting on anyone else required.
          </p>
        </div>

        <div className="steps">
          <div className="step">
            <span className="step-number">
              01
            </span>

            <h3>
              Create your account
            </h3>

            <p>
              Sign up with your email in under a minute --
              no tutor or class needed to get started.
            </p>
          </div>

          <div className="step">
            <span className="step-number">
              02
            </span>

            <h3>
              Choose &amp; buy your exam
            </h3>

            <p>
              Browse the catalog and pay for the practice
              exam you want -- access opens immediately.
            </p>
          </div>

          <div className="step">
            <span className="step-number">
              03
            </span>

            <h3>
              Take the mock test
            </h3>

            <p>
              Complete Listening, Reading, and Writing
              through the computer-based practice flow.
            </p>
          </div>

          <div className="step">
            <span className="step-number">
              04
            </span>

            <h3>
              Review your results
            </h3>

            <p>
              Finish your test and receive a summary of
              your objective results.
            </p>
          </div>
        </div>

        <p style={{ marginTop: 28, fontSize: 13, color: 'var(--color-ink-muted)' }}>
          Working with a tutor instead?{' '}
          <Link to="/exam" style={{ color: 'var(--color-primary)' }}>
            Start a practice test with the access code they gave you
          </Link>
          .
        </p>
      </section>


      {/* =====================================================
          CONTACT
          ===================================================== */}

      <section className="section" id="contact">
        <div className="section-heading">
          <span className="folder-tab">Contact us</span>

          <h2>Get in touch</h2>

          <p>Questions about the practice tests or your account? We would love to hear from you.</p>
        </div>

        <div className="contact-grid">
          <a className="contact-card" href="tel:+260979760113">
            <span className="contact-label">Phone</span>
            <strong>+260 979 760 113</strong>
          </a>

          <a className="contact-card" href="mailto:youengageoettrainingcentre@gmail.com">
            <span className="contact-label">Email</span>
            <strong>youengageoettrainingcentre@gmail.com</strong>
          </a>

          <a
            className="contact-card"
            href="https://www.instagram.com/youengageoettrainingcentre"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="contact-label">Instagram</span>
            <strong>@youengageoettrainingcentre</strong>
          </a>

          <div className="contact-card">
            <span className="contact-label">Visit us</span>
            <strong>Olympia, Lusaka</strong>
            <span>
              Plot 3771, Chilubula Road, behind Manda Hill.
              <br />
              Open Monday to Friday, 9:00 AM to 4:00 PM.
            </span>
          </div>
        </div>
      </section>


      {/* =====================================================
          CTA
          ===================================================== */}

      <section className="cta-banner">
        <h2>
          Ready to start practising?
        </h2>

        <p>
          Create a free account and start practising for OET today.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            to="/login"
            style={{
              textDecoration: 'none',
            }}
          >
            <button
              className="btn-secondary"
              style={{
                background: '#FFFFFF',
                borderColor: '#FFFFFF',
                color: 'var(--color-primary-dark)',
                boxShadow: '0 8px 20px rgba(0,0,0,0.10)',
              }}
            >
              Create your account
              <span style={{ marginLeft: 8 }}>
                <Icon name="arrow" size={16} />
              </span>
            </button>
          </Link>
        </div>

        <p style={{ marginTop: 18, fontSize: 13, opacity: 0.85 }}>
          Have an access code from your tutor instead?{' '}
          <Link to="/exam" style={{ color: '#FFFFFF', textDecoration: 'underline' }}>
            Start a practice test
          </Link>
          .
        </p>
      </section>


      {/* =====================================================
          FOOTER
          ===================================================== */}

      <footer>
        <div className="footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
            <img src="/logo.png" alt="" width={56} height={56} style={{ display: 'block', borderRadius: '50%' }} />
            <div>
              <div
                style={{
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-display)',
                  fontSize: 17,
                  fontWeight: 600,
                  marginBottom: 5,
                }}
              >
                YouEngage OET Training Centre
              </div>

              <span>Prepare. Perform. Progress.</span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22,
            }}
          >
            <a
              href="#offerings"
              style={{ textDecoration: 'none' }}
            >
              Practice
            </a>

            <a
              href="#how-it-works"
              style={{ textDecoration: 'none' }}
            >
              How it works
            </a>

            <a
              href="#contact"
              style={{ textDecoration: 'none' }}
            >
              Contact
            </a>

            <Link
              to="/tutor"
              style={{ textDecoration: 'none' }}
            >
              Tutor login
            </Link>

            <Link
              to="/admin"
              style={{ textDecoration: 'none' }}
            >
              Admin upload
            </Link>

            <Link
              to="/admin-panel"
              style={{ textDecoration: 'none' }}
            >
              Admin panel
            </Link>
          </div>
        </div>

        <div
          style={{
            maxWidth: 'var(--container-width)',
            margin: '28px auto 0',
            paddingTop: 18,
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.40)',
          }}
        >
          © {new Date().getFullYear()} YouEngage OET Training Centre
        </div>
      </footer>
    </div>
  )
}

export default Homepage