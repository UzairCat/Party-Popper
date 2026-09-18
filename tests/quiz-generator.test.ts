// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { OpenAIQuizGenerator, validateQuestion, shuffleAnswers, type QuizQuestion } from '../server/games/quiz-generator'
import { DEFAULT_FOUR_CHOICE_SETTINGS, type FourChoiceSettings } from '../shared/four-choice'

const settings: FourChoiceSettings = { ...DEFAULT_FOUR_CHOICE_SETTINGS, questionCount: 5, categories: ['science'] }
const question = (i: number) => ({ question: `Which number is the result of ${i} plus one?`, answers: [`${i + 1}`, '100', '200', '300'], correctAnswer: 0, category: 'science', difficulty: 'medium', concept: `math.addition.${i}` })
const response = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{type:'message', content:[{type:'output_text', text:JSON.stringify(value)}]}] }))

describe('AI generation pipeline', () => {
  it('rejects malformed options, duplicate choices, bad keys and unselected categories', () => {
    for (const candidate of [null, {}, {...question(1), answers: ['A','B','C']}, {...question(1), answers:['Paris',' PARIS! ','A','B']}, {...question(1), correctAnswer: 4}, {...question(1), category: 'history'}, {...question(1), difficulty:'hard'}]) {
      expect(validateQuestion(candidate, settings)).toBeNull()
    }
    const q = validateQuestion(question(1), settings)!
    expect(q).not.toBeNull()
    const shuffled = shuffleAnswers(q)
    expect(shuffled.answers[shuffled.correctAnswer]).toBe(q.answers[q.correctAnswer])
    expect(shuffled.answers).toHaveLength(4)
  })

  it('uses structured output, independently reviews, tops up rejected questions, and excludes history', async () => {
    let round = 0
    const request = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body))
      expect(body.store).toBe(false)
      expect(body.text.format).toMatchObject({type: 'json_schema', strict: true})
      if (body.text.format.schema.properties.questions) {
        expect(body.input[1].content).toContain('math.addition.0')
        const offset = round++ * 10
        return response({questions: Array.from({length: 7}, (_, i) => question(i + offset))})
      }
      const prompt: string = body.input[1].content
      const items = JSON.parse(prompt.split('Questions: ')[1]) as {id: string; question: string; correctAnswer?: number}[]
      expect(items.every(q => q.correctAnswer === undefined)).toBe(true)
      return response({reviews: items.map((q, i) => ({id: q.id, accepted: round > 1 || i < 3, correctAnswer: 0}))})
    })
    const generator = new OpenAIQuizGenerator({apiKey: 'test-only-not-a-real-key', fetch: request as typeof fetch})
    const recent = [validateQuestion(question(0), settings)!]
    const questions = await generator.generate(settings, recent, new AbortController().signal)
    expect(questions).toHaveLength(5)
    expect(questions.every(q => q.concept !== 'math.addition.0')).toBe(true)
    expect(new Set(questions.map(q => q.concept)).size).toBe(5)
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('rejects verifier disagreement and fails after bounded attempts', async () => {
    const request = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body))
      if (body.text.format.schema.properties.questions) return response({questions: Array.from({length: 7}, (_, i) => question(i))})
      const qs = JSON.parse(body.input[1].content.split('Questions: ')[1]) as QuizQuestion[]
      return response({reviews: qs.map(q => ({id: q.id, accepted:true, correctAnswer: 1}))})
    })
    const generator = new OpenAIQuizGenerator({apiKey:'test-only', fetch:request as typeof fetch})
    await expect(generator.generate(settings, [], new AbortController().signal)).rejects.toThrow('enough good questions')
    expect(request).toHaveBeenCalledTimes(8)
  })

  it('prepares all 100 questions before play with balanced selected categories', async () => {
    let sequence = 0
    const request = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body))
      const prompt: string = body.input[1].content
      if (body.text.format.schema.properties.questions) {
        const quotas = JSON.parse(prompt.split('Category quotas: ')[1].split('.\n')[0]) as {category:string;amount:number}[]
        return response({questions:quotas.flatMap(({category,amount}) => Array.from({length:amount}, () => ({...question(++sequence), category})))})
      }
      const qs = JSON.parse(prompt.split('Questions: ')[1]) as QuizQuestion[]
      return response({reviews:qs.map(q => ({id:q.id,accepted:true,correctAnswer:0}))})
    })
    const generator = new OpenAIQuizGenerator({apiKey:'test-only',fetch:request as typeof fetch})
    const result = await generator.generate({...settings,questionCount:100,categories:['science','history','gaming']}, [],new AbortController().signal)
    expect(result).toHaveLength(100)
    const counts = ['science','history','gaming'].map(c => result.filter(q => q.category === c).length)
    expect(Math.max(...counts)-Math.min(...counts)).toBe(1)
    expect(new Set(result.map(q => q.concept)).size).toBe(100)
  })

  it('fails safely on missing keys, provider errors, refusals and truncation', async () => {
    const missing = new OpenAIQuizGenerator({apiKey:''})
    await expect(missing.generate(settings, [], new AbortController().signal)).rejects.toThrow('isn’t configured')
    for (const body of [{status:'incomplete'}, {status:'completed', output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]}]) {
      const generator = new OpenAIQuizGenerator({apiKey:'test-only', fetch:vi.fn(async () => new Response(JSON.stringify(body))) as typeof fetch})
      await expect(generator.generate(settings, [], new AbortController().signal)).rejects.toThrow()
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const generator = new OpenAIQuizGenerator({apiKey:'secret-test-value', fetch:vi.fn(async () => new Response('provider private details', {status:429})) as typeof fetch})
      await expect(generator.generate(settings, [], new AbortController().signal)).rejects.toThrow('try again')
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret-test-value|provider private details/)
    } finally { log.mockRestore() }
  })
})
