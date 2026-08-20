import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface StudentEntryProps {
  onSuccess: (testData: any, studentName: string) => void
}

function extractErrorMessage(error: any) {
  return error?.message || 'Something went wrong. Please try again.'
}

function LoginIcon({
  type,
}: {
  type: 'user' | 'key' | 'shield' | 'arrow' | 'alert'
}) {
  const common = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (type === 'user') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    )
  }

  if (type === 'key') {
    return (
      <svg {...common}>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 9-9" />
        <path d="m17 6 2 2" />
        <path d="m14 9 2 2" />
      </svg>
    )
  }

  if (type === 'shield') {
    return (
      <svg {...common}>
        <path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  }

  if (type === 'alert') {
    return (
      <svg {...common}>
        <path d="M12 3 22 20H2L12 3Z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}


function StudentEntry({ onSuccess }: StudentEntryProps) {
  const [code, setCode] = useState('')
  const [studentName, setStudentName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!code.trim() || !studentName.trim()) {
      setError('Enter both your name and the access code.')
      return
    }

    setLoading(true)
    setError('')

    const { data, error: redeemError } = await supabase.rpc('redeem_access_code', {
      p_code: code.trim().toUpperCase(),
    })

    setLoading(false)

    if (redeemError) {
      setError(extractErrorMessage(redeemError))
      return
    }

    if (!data?.test) {
      setError(data?.error ?? 'That access code is invalid, expired, or has reached its usage limit.')
      return
    }

    onSuccess(data.test, studentName.trim())
  }

  return (
    <div className="student-entry-page">
      <div className="student-entry-layout">

        {/* =================================================
            LEFT SIDE
            ================================================= */}

        <div className="student-entry-intro">
          <span className="eyebrow">
            OET Training Centre
          </span>

          <h1>
            Your practice test
            <span> starts here.</span>
          </h1>

          <p>
            Enter the details provided by your tutor to access
            your computer-based OET practice test.
          </p>

          <div className="student-entry-features">

            <div className="student-entry-feature">
              <span className="student-entry-feature-icon">
                <LoginIcon type="shield" />
              </span>

              <span>
                Secure access to your assigned test
              </span>
            </div>

            <div className="student-entry-feature">
              <span className="student-entry-feature-icon">
                <LoginIcon type="key" />
              </span>

              <span>
                Use the one-time code provided by your tutor
              </span>
            </div>

            <div className="student-entry-feature">
              <span className="student-entry-feature-icon">
                <LoginIcon type="user" />
              </span>

              <span>
                Your name will appear on your test results
              </span>
            </div>

          </div>
        </div>


        {/* =================================================
            LOGIN CARD
            ================================================= */}

        <div className="student-entry-card">

          <div className="student-entry-icon">
            <LoginIcon type="key" />
          </div>

          <h2>
            Enter your details
          </h2>

          <p className="student-entry-card-subtitle">
            Use the access code provided by your tutor
            to begin your practice session.
          </p>


          <form
            className="student-entry-form"
            onSubmit={handleSubmit}
          >

            {/* Name */}

            <div className="student-entry-field">
              <label htmlFor="student-name">
                Your name
              </label>

              <input
                id="student-name"
                type="text"
                value={studentName}
                onChange={(e) => {
                  setStudentName(e.target.value)
                  setError('')
                }}
                placeholder="Enter your full name"
                autoComplete="name"
                disabled={loading}
              />
            </div>


            {/* Access code */}

            <div className="student-entry-field">
              <label htmlFor="access-code">
                Access code
              </label>

              <input
                id="access-code"
                type="text"
                className="student-access-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase())
                  setError('')
                }}
                placeholder="e.g. ABC123"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={loading}
                maxLength={20}
              />

              <div className="student-entry-helper">
                <LoginIcon type="shield" />

                <span>
                  Your tutor provides the access code at
                  the start of your practice session.
                </span>
              </div>
            </div>


            {/* Error */}

            {error && (
              <div className="student-entry-error">
                <LoginIcon type="alert" />

                <span>
                  {error}
                </span>
              </div>
            )}


            {/* Submit */}

            <button
              type="submit"
              className="btn-primary student-entry-submit"
              disabled={loading}
            >
              {loading ? (
                'Checking access code...'
              ) : (
                <>
                  Start practice test

                  <span>
                    <LoginIcon type="arrow" />
                  </span>
                </>
              )}
            </button>

          </form>


          <div className="student-entry-card-footer">
            <span>
              Having trouble?
            </span>

            <strong>
              Ask your tutor for help.
            </strong>
          </div>

        </div>
      </div>
    </div>
  )
}

export default StudentEntry