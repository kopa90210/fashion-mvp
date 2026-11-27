import {describe,it,expect} from 'vitest'
import {parseDraft,replaceAnswer,answersFromSignals} from './progress'
import {QUIZ_QUESTIONS} from './questions'
describe('quiz navigation',()=>{
 const answers=QUIZ_QUESTIONS.map(q=>({questionId:q.id,optionId:q.options[0].id}))
 it('replaces a previous answer without losing others',()=>{
 const q=QUIZ_QUESTIONS[1],updated=replaceAnswer(answers,q.id,q.options[1].id)
 expect(updated).toHaveLength(5);expect(updated.filter(a=>a.questionId===q.id)).toEqual([{questionId:q.id,optionId:q.options[1].id}])
 expect(updated.filter(a=>a.questionId!==q.id)).toEqual(answers.filter(a=>a.questionId!==q.id))
 })
 it('resumes a valid draft and rejects invalid or duplicate choices',()=>{
 const draft={answers:answers.slice(0,2),step:2,imageSet:'masculine'}
 expect(parseDraft(JSON.stringify(draft))).toEqual(draft)
 expect(parseDraft(JSON.stringify({...draft,answers:[answers[0],answers[0]]}))).toBeNull()
 expect(parseDraft(JSON.stringify({...draft,step:4}))).toBeNull()
 expect(parseDraft(JSON.stringify({...draft,answers:[{questionId:'invalid',optionId:'invalid'}]}))).toBeNull()
 })
 it('reconstructs exactly five answers from saved signals',()=>expect(answersFromSignals({primaryOccasion:'work-university',style:'minimal',fit:'slim',formality:'casual',exploration:'familiar'})).toEqual(answers))
})
