import {describe,it,expect} from 'vitest'
import {providerCost} from './pricing'
const rate={version:'fixture-v1',inputUsdPerMillion:1,outputUsdPerMillion:2}
const config=JSON.stringify({'groq:test':rate,'gemini:test':rate})
describe('provider cost',()=>{
 it('does not double charge Groq reasoning',()=>expect(providerCost('groq','test',{input:100,output:50,thought:20},config)).toEqual({pricingVersion:'fixture-v1',cost:.0002}))
 it('adds Gemini thoughts',()=>expect(providerCost('gemini','test',{input:100,output:50,thought:20},config)).toEqual({pricingVersion:'fixture-v1',cost:.00024}))
 it('keeps missing Gemini thoughts unknown',()=>expect(providerCost('gemini','test',{input:100,output:50,thought:null},config).cost).toBeNull())
 it('keeps unknown models unknown',()=>expect(providerCost('groq','other',{input:1,output:1,thought:null},config).cost).toBeNull())
 it('rejects invalid rates and token counts',()=>{expect(providerCost('groq','test',{input:-1,output:1,thought:null},config).cost).toBeNull();expect(providerCost('groq','test',{input:1,output:1,thought:null},JSON.stringify({'groq:test':{...rate,inputUsdPerMillion:-1}})).cost).toBeNull()})
 it('distinguishes known zero from unknown',()=>expect(providerCost('groq','test',{input:0,output:0,thought:null},config)).toEqual({pricingVersion:'fixture-v1',cost:0}))
})
