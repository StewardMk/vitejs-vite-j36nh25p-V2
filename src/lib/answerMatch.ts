// Answer comparison for auto-marked questions.
//
// Case and surrounding spaces never matter. In Listening, a number may be
// written either as digits or as words ("2" and "two" are the same answer),
// because the audio gives the candidate no written form to copy.

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

// Replaces number words with digits: "twenty five" / "twenty-five" -> "25", "two" -> "2".
export function numberWordsToDigits(input: string): string {
  let s = input.trim().toLowerCase()
  s = s.replace(
    /\b(twenty|thirty|f(?:o|ou)rty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g,
    (_m, t: string, u: string) => String(TENS[t] + UNITS[u]),
  )
  s = s.replace(/\b(twenty|thirty|f(?:o|ou)rty|fifty|sixty|seventy|eighty|ninety)\b/g, (_m, t: string) => String(TENS[t]))
  s = s.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g,
    (_m, u: string) => String(UNITS[u]),
  )
  return s.replace(/\s+/g, ' ')
}

export function answersEqual(given: string, correct: string, subtest: string): boolean {
  const a = given.toString().trim().toLowerCase()
  const b = String(correct).trim().toLowerCase()
  if (a === b) return true
  if (subtest === 'listening') return numberWordsToDigits(a) === numberWordsToDigits(b)
  return false
}
