import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

interface AudioPlayerProps {
  src: string
  compact?: boolean
}

export interface AudioPlayerHandle {
  play: () => void
  pause: () => void
  reset: () => void
}

const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(
  ({ src, compact = false }, ref) => {
    const audioRef = useRef<HTMLAudioElement>(null)

    const [status, setStatus] = useState<
      'not_played' | 'playing' | 'finished'
    >('not_played')

    useImperativeHandle(ref, () => ({
      play: () => {
        const audio = audioRef.current

        if (!audio || status === 'finished') return

        setStatus('playing')

        audio.play().catch((err) => {
          console.warn('Audio playback failed:', err)
        })
      },

      pause: () => {
        audioRef.current?.pause()
      },

      reset: () => {
        const audio = audioRef.current

        if (!audio) return

        audio.pause()
        audio.currentTime = 0
        setStatus('not_played')
      },
    }), [status])

    function handleEnded() {
      setStatus('finished')
    }

    return (
      <div
        className={
          compact
            ? 'listening-audio-status listening-audio-status-compact'
            : 'listening-audio-status'
        }
      >
        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          onEnded={handleEnded}
        />

        {status === 'not_played' && (
          <span className="listening-audio-status waiting">
            Audio ready
          </span>
        )}

        {status === 'playing' && (
          <span className="listening-audio-status playing">
            <span className="audio-pulse" />
            Audio playing
          </span>
        )}

        {status === 'finished' && (
          <span className="listening-audio-status finished">
            ✓ Audio complete
          </span>
        )}
      </div>
    )
  }
)

AudioPlayer.displayName = 'AudioPlayer'

export default AudioPlayer