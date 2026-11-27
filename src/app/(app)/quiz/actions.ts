'use server'

import { createClient } from '@/src/lib/supabase/server'
import { catalogSelectionHref } from '@/src/lib/quiz/catalog-collection'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {answersFromSignals,replaceAnswer,signalKeys,parseDraft} from '@/src/lib/quiz/progress'
import {readQuizSignals,STYLE_DIMENSIONS} from '@/src/lib/quiz/scoring'
import { QUIZ_QUESTIONS_FOR_SCORING } from '@/src/lib/quiz/questions'
import { computeStyleVector, parseQuizSignals, type QuizAnswer } from '@/src/lib/quiz/scoring'

/** Persist one server-derived quiz result and Fashion DNA version. */
export async function submitStyleQuiz(answers: QuizAnswer[], collection?: unknown) {
  const signals = parseQuizSignals(answers, QUIZ_QUESTIONS_FOR_SCORING)
  const vector = computeStyleVector(answers, QUIZ_QUESTIONS_FOR_SCORING)
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) redirect('/login')

  // Older accounts may predate the auth sync trigger.
  const { error: profileError } = await supabase.from('users')
    .upsert({ id: authData.user.id }, { onConflict: 'id' })
  if (profileError) throw new Error(`Failed to initialize user profile: ${profileError.message}`)

  const { error } = await supabase.rpc('submit_style_quiz', {
    p_vector: vector,
    p_shopping_motivation: null,
    p_risk_tolerance: null,
    p_quiz_signals: signals,
  })
  if (error) throw new Error(`Failed to save style data: ${error.message}`)
  redirect(catalogSelectionHref(collection))
}

/** Edit one explicit preference without re-running wardrobe onboarding. */
export async function editQuizPreference(key:unknown,optionId:unknown){
 if(typeof key!=='string'||typeof optionId!=='string')throw new Error('Invalid preference')
 const index=signalKeys.findIndex(k=>k===key)
 const question=QUIZ_QUESTIONS_FOR_SCORING[index]
 if(!question||!question.options.some(o=>o.id===optionId))throw new Error('Invalid preference')
 const supabase=await createClient()
 const {data:{user},error:authError}=await supabase.auth.getUser()
 if(authError||!user)throw new Error('Not authenticated')
 const {data,error}=await supabase.from('fashion_dna').select('quiz_signals,vector').eq('user_id',user.id).single()
 const current=readQuizSignals(data?.quiz_signals)
 if(error||!current)throw new Error('Style preferences unavailable')
 const previous=answersFromSignals(current)
 const answers=replaceAnswer(previous,question.id,optionId)
 const signals=parseQuizSignals(answers,QUIZ_QUESTIONS_FOR_SCORING)
 if(current[signalKeys[index]]===optionId)return
 const oldBase=computeStyleVector(previous,QUIZ_QUESTIONS_FOR_SCORING)
 const newBase=computeStyleVector(answers,QUIZ_QUESTIONS_FOR_SCORING)
 // Retain the learned adjustment relative to the previous deterministic baseline.
 const vector=Object.fromEntries(STYLE_DIMENSIONS.map(d=>{
 const stored=data?.vector?.[d]
 const weight=typeof stored==='number'&&Number.isFinite(stored)?stored:oldBase[d]
 return [d,Math.round(Math.max(0,Math.min(1,weight+newBase[d]-oldBase[d]))*100)/100]
 }))
 const {error:saveError}=await supabase.rpc('submit_style_quiz',{p_vector:vector,p_shopping_motivation:null,p_risk_tolerance:null,p_quiz_signals:signals})
 if(saveError)throw new Error('Could not save preference')
 revalidatePath('/profile')
 revalidatePath('/search')
 revalidatePath('/outfits')
}

/** Persist a validated draft using optimistic concurrency and authenticated ownership. */
export async function saveQuizAccountDraft(accountId:string,raw:string,expectedVersion:number):Promise<number>{
 const draft=parseDraft(raw)
 if(!draft||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>=2147483647)throw new Error('Invalid quiz progress')
 const supabase=await createClient()
 const {data:{user},error:authError}=await supabase.auth.getUser()
 if(authError||!user||user.id!==accountId)throw new Error('Account changed. Reopen the quiz.')
 const {data:dna,error:dnaError}=await supabase.from('fashion_dna').select('quiz_signals').eq('user_id',user.id).maybeSingle()
 if(dnaError||readQuizSignals(dna?.quiz_signals))throw new Error('Quiz already completed or unavailable')
 const row={draft,version:expectedVersion+1,updated_at:new Date().toISOString()}
 const result=expectedVersion===0
 ?await supabase.from('style_quiz_drafts').insert({user_id:user.id,...row}).select('version').single()
 :await supabase.from('style_quiz_drafts').update(row).eq('user_id',user.id).eq('version',expectedVersion).select('version').maybeSingle()
 if(result.error||result.data?.version!==expectedVersion+1)throw new Error('Progress changed or could not be saved. Refresh to resume.')
 return result.data.version
}
