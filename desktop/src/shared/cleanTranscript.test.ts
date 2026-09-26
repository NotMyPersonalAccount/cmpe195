import { describe, expect, it } from 'vitest'
import { cleanTranscriptText } from './cleanTranscript'

describe('cleanTranscriptText', () => {
  it('keeps normal repeated speech', () => {
    expect(cleanTranscriptText('This is very very important.')).toBe(
      'This is very very important.'
    )
  })

  it('collapses a runaway repeated decoder token', () => {
    expect(cleanTranscriptText('Submit Friday biasesVIDEO biasesVIDEO biasesVIDEO biasesVIDEO'))
      .toBe('Submit Friday biasesVIDEO biasesVIDEO')
  })

  it('removes an exact duplicated paragraph', () => {
    const paragraph = 'Please read chapter four and submit the worksheet by Friday.'
    expect(cleanTranscriptText(`${paragraph} ${paragraph}`)).toBe(paragraph)
  })

  it('removes common non-speech annotations from the model', () => {
    expect(
      cleanTranscriptText(
        'Tuesday exam (sighs) Thursday exam. [inaudible] (soft music) (muffled speaking) [BLANK_AUDIO] (mumbling)'
      )
    ).toBe('Tuesday exam Thursday exam.')
  })

  it('collapses repeated sentences from a noisy live chunk', () => {
    expect(
      cleanTranscriptText(
        '- Thank you. - Thanks, Sam. - Thanks, Sam. - Thanks, Sam. Read chapter four.'
      )
    ).toBe('- Thank you. - Thanks, Sam. Read chapter four.')
  })
})
