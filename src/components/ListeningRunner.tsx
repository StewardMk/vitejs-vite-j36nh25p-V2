import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import QuestionInput from './QuestionInput'
import AudioPlayer, {
  type AudioPlayerHandle,
} from './AudioPlayer'

import { submitAttempt } from '../lib/submitAttempt'


interface SubtestResult {
  correctCount: number
  scorableCount: number
}

interface ListeningRunnerProps {
  testData: any
  studentName: string
  sessionGroupId: string
  onComplete: (result: SubtestResult) => void
}


function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60

  return `${m}:${s.toString().padStart(2, '0')}`
}


function getPartType(part: any) {
  const label = String(part?.label ?? '').toLowerCase()

  if (label.includes('part a')) return 'A'
  if (label.includes('part b')) return 'B'
  if (label.includes('part c')) return 'C'

  return null
}


function ListeningRunner({
  testData,
  studentName,
  sessionGroupId,
  onComplete,
}: ListeningRunnerProps) {

  const [hasStarted, setHasStarted] = useState(false)

  const [answers, setAnswers] =
    useState<Record<string, string>>({})

  const [result, setResult] =
    useState<SubtestResult | null>(null)

  const [submitting, setSubmitting] =
    useState(false)

  const [timeLeft, setTimeLeft] =
    useState<number | null>(null)

  const [currentPartIndex, setCurrentPartIndex] =
    useState(0)

  const [currentQuestionIndex, setCurrentQuestionIndex] =
    useState(0)

  const [showFinishModal, setShowFinishModal] =
    useState(false)

  const [visitedQuestions, setVisitedQuestions] =
    useState<Set<string>>(new Set())


  /*
   * All audio elements are mounted from the beginning.
   *
   * This is important because browser autoplay permissions
   * are much more reliable when play() is triggered directly
   * from a genuine user interaction on an already-mounted
   * audio element.
   */

  const audioRefs =
    useRef<Record<string, AudioPlayerHandle | null>>({})


  const listeningSubtest =
    testData.subtests.find(
      (s: any) => s.type === 'listening'
    )

  const parts =
    listeningSubtest?.parts ?? []


  const currentPart =
    parts[currentPartIndex]

  const currentPartType =
    getPartType(currentPart)


  /*
   * Flatten all questions.
   * Used for scoring/submission.
   */

  const allListeningQuestions =
    useMemo(
      () =>
        parts.flatMap((part: any) =>
          part.stimuli.flatMap(
            (stimulus: any) => stimulus.questions
          )
        ),
      [parts]
    )


  /*
   * Questions for the current part.
   */

  const currentPartQuestions =
    useMemo(
      () =>
        currentPart?.stimuli?.flatMap(
          (stimulus: any) => stimulus.questions
        ) ?? [],
      [currentPart]
    )


  /*
   * Part B is sequential.
   */

  const currentSequentialQuestion =
    currentPartQuestions[currentQuestionIndex]


  /*
   * Total unanswered questions.
   */

  const unansweredCount =
    allListeningQuestions.filter(
      (question: any) =>
        !answers[question.id]?.trim()
    ).length


  /*
   * Start the timer immediately when the Listening
   * component appears.
   *
   * This deliberately happens BEFORE the student clicks
   * Begin Listening, matching the planned OET behaviour.
   */

  useEffect(() => {
    if (!parts.length) return

    setTimeLeft(parts[0]?.time_limit_sec ?? null)
  }, [parts])


  /*
   * Continuous timer.
   */

  useEffect(() => {
    if (timeLeft === null || result) return

    const timer = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current === null) return null

        if (current <= 1) {
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [result])


  /*
   * When the timer reaches zero, finish automatically.
   */

  useEffect(() => {
    if (timeLeft !== 0 || result || submitting) return

    finalizeSubmission()
  }, [timeLeft])


  /*
   * Play the first audio when the student clicks
   * Begin Listening.
   */

  function handleBegin() {
    if (hasStarted || !parts.length) return

    setHasStarted(true)

    const firstPart = parts[0]
    const firstType = getPartType(firstPart)

    if (firstType === 'B') {
      const firstQuestion =
        firstPart?.stimuli?.[0]?.questions?.[0]

      if (firstQuestion) {
        setVisitedQuestions(
          new Set([firstQuestion.id])
        )

        const firstStimulus =
          firstPart.stimuli.find(
            (stimulus: any) =>
              stimulus.questions?.some(
                (q: any) =>
                  q.id === firstQuestion.id
              )
          )

        if (firstStimulus) {
          audioRefs.current[firstStimulus.id]?.play()
        }
      }
    } else {
      const firstAudio =
        firstPart?.stimuli?.find(
          (stimulus: any) =>
            stimulus.type === 'audio'
        )

      if (firstAudio) {
        audioRefs.current[firstAudio.id]?.play()
      }
    }
  }


  function handleAnswerChange(
    questionId: string,
    value: string
  ) {
    setAnswers((previous) => ({
      ...previous,
      [questionId]: value,
    }))
  }


  /*
   * Move from Part A → B → C.
   */

  function moveToNextPart() {
    if (currentPartIndex >= parts.length - 1) {
      setShowFinishModal(true)
      return
    }

    const nextPartIndex =
      currentPartIndex + 1

    const nextPart =
      parts[nextPartIndex]

    setCurrentPartIndex(nextPartIndex)

    setCurrentQuestionIndex(0)

    const nextPartType =
      getPartType(nextPart)

    if (nextPartType === 'B') {
      const firstQuestion =
        nextPart?.stimuli?.[0]?.questions?.[0]

      if (firstQuestion) {
        setVisitedQuestions(
          (previous) =>
            new Set([
              ...previous,
              firstQuestion.id,
            ])
        )

        const stimulus =
          nextPart.stimuli.find(
            (item: any) =>
              item.questions?.some(
                (question: any) =>
                  question.id === firstQuestion.id
              )
          )

        if (stimulus) {
          window.setTimeout(() => {
            audioRefs.current[stimulus.id]?.play()
          }, 0)
        }
      }
    } else {
      const audio =
        nextPart?.stimuli?.find(
          (stimulus: any) =>
            stimulus.type === 'audio'
        )

      if (audio) {
        window.setTimeout(() => {
          audioRefs.current[audio.id]?.play()
        }, 0)
      }
    }
  }


  /*
   * Part B:
   *
   * One question + one audio.
   * No going backwards.
   */

  function advancePartBQuestion() {
    if (
      currentQuestionIndex >=
      currentPartQuestions.length - 1
    ) {
      moveToNextPart()
      return
    }

    const nextQuestionIndex =
      currentQuestionIndex + 1

    const nextQuestion =
      currentPartQuestions[nextQuestionIndex]

    setCurrentQuestionIndex(nextQuestionIndex)

    setVisitedQuestions(
      (previous) =>
        new Set([
          ...previous,
          nextQuestion.id,
        ])
    )

    const nextStimulus =
      currentPart?.stimuli?.find(
        (stimulus: any) =>
          stimulus.questions?.some(
            (question: any) =>
              question.id === nextQuestion.id
          )
      )

    if (nextStimulus) {
      window.setTimeout(() => {
        audioRefs.current[nextStimulus.id]?.play()
      }, 0)
    }
  }


  /*
   * A/C question navigation.
   */

  function jumpToQuestion(questionId: string) {
    const questionIndex =
      currentPartQuestions.findIndex(
        (question: any) =>
          question.id === questionId
      )

    if (questionIndex === -1) return

    /*
     * Do not allow jumping into questions that
     * have not yet been visited.
     */

    if (
      !visitedQuestions.has(questionId) &&
      questionIndex !== 0
    ) {
      return
    }

    const element =
      document.getElementById(
        `listening-question-${questionId}`
      )

    element?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }


  /*
   * Finish confirmation.
   */

  function requestFinish() {
    setShowFinishModal(true)
  }


  async function finalizeSubmission() {
    if (submitting || result) return

    setShowFinishModal(false)

    setSubmitting(true)

    try {
      const outcome =
        await submitAttempt(
          testData.id,
          'listening',
          allListeningQuestions,
          answers,
          studentName,
          sessionGroupId
        )

      setResult(outcome)
    } catch (err) {
      console.error(err)

      alert(
        err instanceof Error
          ? err.message
          : 'Submission failed.'
      )
    }

    setSubmitting(false)
  }


  if (!parts.length) {
    return (
      <div className="exam-shell">
        <div className="card">
          <h2>Listening unavailable</h2>

          <p>
            No Listening content is available for this test.
          </p>
        </div>
      </div>
    )
  }


  return (
    <div className="exam-shell listening-shell">

      {/* =====================================================
          PRELOAD ALL AUDIO
          ===================================================== */}

      <div className="listening-audio-preload">
        {parts.flatMap((part: any) =>
          part.stimuli
            .filter(
              (stimulus: any) =>
                stimulus.type === 'audio' &&
                stimulus.file_url
            )
            .map((stimulus: any) => (
              <AudioPlayer
                key={stimulus.id}
                src={stimulus.file_url}
                ref={(element) => {
                  audioRefs.current[stimulus.id] =
                    element
                }}
                compact
              />
            ))
        )}
      </div>


      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="listening-topbar">

        <div>
          <span className="folder-tab">
            Listening
          </span>

          <h2>
            {currentPart?.label}
          </h2>
        </div>

        {timeLeft !== null && !result && (
          <div
            className={`timer-chip ${
              timeLeft <= 60
                ? 'urgent'
                : ''
            }`}
          >
            {formatTime(timeLeft)}
          </div>
        )}

      </div>


      {/* =====================================================
          QUESTION AREA
          ===================================================== */}

      <div className="listening-layout">

        {/* ===================================================
            NAVIGATION SIDEBAR
            =================================================== */}

        {(currentPartType === 'A' ||
          currentPartType === 'C') &&
          hasStarted &&
          !result && (

          <aside className="listening-question-nav">

            <div className="listening-question-nav-title">
              Questions
            </div>

            <div className="listening-question-tabs">

              {currentPartQuestions.map(
                (
                  question: any,
                  index: number
                ) => {

                  const visited =
                    visitedQuestions.has(
                      question.id
                    )

                  return (
                    <button
                      key={question.id}
                      type="button"
                      disabled={!visited}
                      className={`
                        listening-question-tab
                        ${
                          visited
                            ? 'visited'
                            : ''
                        }
                        ${
                          answers[question.id]
                            ? 'answered'
                            : ''
                        }
                      `}
                      onClick={() =>
                        jumpToQuestion(
                          question.id
                        )
                      }
                    >
                      {index + 1}
                    </button>
                  )
                }
              )}

            </div>

          </aside>
        )}


        {/* ===================================================
            MAIN TEST CARD
            =================================================== */}

        <main className="listening-main-card">

          {!hasStarted && (
            <div className="listening-intro">

              <div className="listening-intro-icon">
                🎧
              </div>

              <span className="folder-tab">
                Listening
              </span>

              <h1>
                {testData.title}
              </h1>

              <p>
                You are about to begin the Listening
                sub-test.
              </p>

              <div className="listening-instructions">

                <div>
                  <strong>
                    Audio plays automatically
                  </strong>

                  <span>
                    Make sure your volume is on before
                    you continue.
                  </span>
                </div>

                <div>
                  <strong>
                    Listen carefully
                  </strong>

                  <span>
                    Audio recordings cannot be paused,
                    rewound, or replayed.
                  </span>
                </div>

                <div>
                  <strong>
                    Time starts now
                  </strong>

                  <span>
                    The section timer includes these
                    instructions.
                  </span>
                </div>

              </div>

              <button
                className="btn-primary listening-begin-button"
                onClick={handleBegin}
              >
                Begin Listening
              </button>

            </div>
          )}


          {hasStarted && !result && (

            <>

              {/* =============================================
                  PART B — SEQUENTIAL
                  ============================================= */}

              {currentPartType === 'B' ? (

                <div className="listening-sequential">

                  <div className="listening-progress">
                    <span>
                      Question{' '}
                      {currentQuestionIndex + 1}
                    </span>

                    <span>
                      of{' '}
                      {currentPartQuestions.length}
                    </span>
                  </div>

                  <div className="listening-sequential-card">

                    <div className="listening-audio-indicator">
                      <span className="audio-pulse" />
                      Listen to the recording
                    </div>

                    <QuestionInput
                      question={
                        currentSequentialQuestion
                      }
                      value={
                        answers[
                          currentSequentialQuestion?.id
                        ] ?? ''
                      }
                      onChange={(value) =>
                        handleAnswerChange(
                          currentSequentialQuestion.id,
                          value
                        )
                      }
                    />

                  </div>

                  <div className="listening-sequential-footer">

                    <span>
                      You cannot return to a previous
                      question.
                    </span>

                    <button
                      className="btn-primary"
                      onClick={
                        advancePartBQuestion
                      }
                    >
                      {currentQuestionIndex ===
                      currentPartQuestions.length - 1
                        ? 'Continue'
                        : 'Next question'}
                      <span>
                        →
                      </span>
                    </button>

                  </div>

                </div>

              ) : (

                /* ===========================================
                   PART A / C — GROUPED
                   =========================================== */

                <div className="listening-grouped">

                  {currentPart?.stimuli.map(
                    (stimulus: any) => (

                      <section
                        key={stimulus.id}
                        className="listening-stimulus"
                      >

                        {stimulus.type === 'audio' && (
                          <div className="listening-audio-banner">
                            <div>
                              <span className="audio-pulse" />

                              <strong>
                                Audio recording
                              </strong>
                            </div>

                            <span>
                              Plays once only
                            </span>
                          </div>
                        )}

                        {stimulus.content && (
                          <p className="stimulus-text">
                            {stimulus.content}
                          </p>
                        )}

                        {stimulus.questions.map(
                          (
                            question: any,
                            index: number
                          ) => {

                            /*
                             * Mark questions in the current
                             * group as visited once the part
                             * begins.
                             */

                            if (hasStarted) {
                              visitedQuestions.add(
                                question.id
                              )
                            }

                            return (
                              <div
                                key={question.id}
                                id={`listening-question-${question.id}`}
                                className="listening-question-anchor"
                              >
                                <div className="listening-question-number">
                                  {index + 1}
                                </div>

                                <QuestionInput
                                  question={question}
                                  value={
                                    answers[
                                      question.id
                                    ] ?? ''
                                  }
                                  onChange={(value) =>
                                    handleAnswerChange(
                                      question.id,
                                      value
                                    )
                                  }
                                />
                              </div>
                            )
                          }
                        )}

                      </section>
                    )
                  )}

                  <div className="listening-section-actions">

                    <button
                      className={
                        currentPartIndex ===
                        parts.length - 1
                          ? 'btn-primary'
                          : 'btn-secondary'
                      }
                      onClick={
                        currentPartIndex ===
                        parts.length - 1
                          ? requestFinish
                          : moveToNextPart
                      }
                    >
                      {currentPartIndex ===
                      parts.length - 1
                        ? 'Finish Listening'
                        : 'Continue to next part'}
                    </button>

                  </div>

                </div>
              )}

            </>
          )}


          {/* =================================================
              RESULTS
              ================================================= */}

          {result && (
            <div className="results-summary listening-result">

              <div className="listening-result-icon">
                ✓
              </div>

              <span className="folder-tab">
                Listening complete
              </span>

              <h2>
                Section finished
              </h2>

              <p>
                Your Listening responses have been
                submitted successfully.
              </p>

              <button
                className="btn-primary"
                onClick={() =>
                  onComplete(result)
                }
              >
                Continue
                <span style={{ marginLeft: 8 }}>
                  →
                </span>
              </button>

            </div>
          )}

        </main>

      </div>


      {/* =====================================================
          FINISH MODAL
          ===================================================== */}

      {showFinishModal && (

        <div
          className="listening-modal-backdrop"
          role="dialog"
          aria-modal="true"
        >

          <div className="listening-modal">

            <div className="listening-modal-icon">
              ?
            </div>

            <h2>
              Finish Listening?
            </h2>

            {unansweredCount > 0 ? (

              <p>
                You have{' '}
                <strong>
                  {unansweredCount}
                </strong>{' '}
                unanswered question
                {unansweredCount === 1
                  ? ''
                  : 's'}
                . Once you finish this section,
                you cannot return to it.
              </p>

            ) : (

              <p>
                You have answered all of the
                Listening questions. Are you sure
                you want to finish this section?
              </p>

            )}

            <div className="listening-modal-actions">

              <button
                className="btn-secondary"
                onClick={() =>
                  setShowFinishModal(false)
                }
              >
                Keep working
              </button>

              <button
                className="btn-primary"
                onClick={
                  finalizeSubmission
                }
                disabled={submitting}
              >
                {submitting
                  ? 'Submitting...'
                  : 'Finish Listening'}
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  )
}

export default ListeningRunner