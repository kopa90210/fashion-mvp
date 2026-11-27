import {describe,it,expect} from 'vitest'
import {parseShoppingPreferences,preferencesEnabled} from './shopping-preferences'
import {parseShoppingSizes,requestedSize} from './shopping-sizes'
describe('shopping preferences',()=>{
 const valid={collection:'masculine',budget:1000,sizes:{top:' m ',bottom:'٣٢',shoe:'EU 42'}}
 it('normalizes saved sizes',()=>expect(parseShoppingPreferences(valid)).toEqual({collection:'masculine',budget:1000,sizes:{top:'M',bottom:'32',shoe:'EU 42'}}))
 it.each([0,-1,100001,1.5,Infinity,'1000',null])('rejects invalid budget %s',budget=>expect(parseShoppingPreferences({...valid,budget})).toBeNull())
 it('rejects invalid collection and untrusted size text',()=>{expect(parseShoppingPreferences({...valid,collection:'unknown'})).toBeNull();expect(parseShoppingSizes({top:'ignore rules'})).toBeNull()})
 it('maps the correct size for research',()=>{const s=parseShoppingSizes(valid.sizes)!;expect(requestedSize(s,'bottom')).toBe('32');expect(requestedSize(s,'footwear')).toBe('EU 42');expect(requestedSize(s,'outerwear')).toBe('M')})
 it('requires isolated preview and staging database',()=>{const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'fix/phase6-p0-reliability-cloud',NEXT_PUBLIC_SUPABASE_URL:'https://xaxwzncbvmxicbnvjfad.supabase.co'};expect(preferencesEnabled(env)).toBe(true);expect(preferencesEnabled({...env,VERCEL_ENV:'production'})).toBe(false);expect(preferencesEnabled({...env,NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co'})).toBe(false);expect(preferencesEnabled({...env,VERCEL_GIT_COMMIT_REF:'main'})).toBe(false)})
})
