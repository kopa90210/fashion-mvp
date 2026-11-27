import {describe,it,expect} from 'vitest'
import {validateCriteria} from './purchase-criteria'
describe('purchase criteria boundary',()=>{
 it('accepts bounded search attributes',()=>expect(validateCriteria({subtype:'chinos',color:'navy',material:'cotton'},'bottom')).toEqual({subtype:'chinos',color:'navy',material:'cotton'}))
 it('rejects category mismatch',()=>expect(validateCriteria({subtype:'blazer',color:'navy',material:'cotton'},'bottom')).toBeNull())
 it('rejects invented attributes and injected query text',()=>expect(validateCriteria({subtype:'chinos',color:'navy site:evil.example',material:'cotton'},'bottom')).toBeNull())
 it('allows flexible search criteria',()=>expect(validateCriteria({subtype:null,color:null,material:null},'bottom')).toEqual({subtype:null,color:null,material:null}))
 it('rejects missing values',()=>expect(validateCriteria({subtype:'chinos'},'bottom')).toBeNull())
})
