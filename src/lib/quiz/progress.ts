import {QUIZ_QUESTIONS} from './questions'
import type {QuizAnswer,QuizSignals} from './scoring'
import type {QuizImagePreference} from './imageSet'
export type QuizDraft={answers:QuizAnswer[];step:number;imageSet:QuizImagePreference}
export const draftKey=(userId:string)=>'stylegraph_quiz_v2_'+userId
export const signalKeys=['primaryOccasion','style','fit','formality','exploration'] as const
export function replaceAnswer(answers:QuizAnswer[],questionId:string,optionId:string):QuizAnswer[]{
 if(!QUIZ_QUESTIONS.find(q=>q.id===questionId)?.options.some(o=>o.id===optionId))throw new Error('Invalid quiz answer')
 return [...answers.filter(a=>a.questionId!==questionId),{questionId,optionId}]
}
export function answersFromSignals(signals:QuizSignals):QuizAnswer[]{
 return QUIZ_QUESTIONS.map((q,i)=>({questionId:q.id,optionId:signals[signalKeys[i]]}))
}
export function parseDraft(raw:unknown):QuizDraft|null{
 if(typeof raw!=='string'||raw.length>3000)return null
 try{
  const p=JSON.parse(raw)
  if(!p||!Array.isArray(p.answers)||p.answers.length>QUIZ_QUESTIONS.length||!Number.isInteger(p.step)||p.step<0||p.step>=QUIZ_QUESTIONS.length||(p.imageSet!=='masculine'&&p.imageSet!=='feminine'))return null
  let answers:QuizAnswer[]=[]
  for(const a of p.answers){
   if(!a||answers.some(x=>x.questionId===a.questionId))return null
   answers=replaceAnswer(answers,a.questionId,a.optionId)
  }
  if(QUIZ_QUESTIONS.slice(0,p.step).some(q=>!answers.some(a=>a.questionId===q.id)))return null
  return {answers,step:p.step,imageSet:p.imageSet}
 }catch{return null}
}
