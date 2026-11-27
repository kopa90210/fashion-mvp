import Link from 'next/link'
import UploadScreen from './UploadScreen'

export default async function AddWardrobePage({searchParams}:{searchParams:Promise<{method?:string}>}){
 const {method}=await searchParams
 if(method==='photo')return <UploadScreen/>
 return <main className="stylegraph-quiz-surface min-h-dvh bg-[#141416] px-4 py-8 text-[#F5F1E9]"><div className="mx-auto max-w-lg space-y-5 text-center">
 <Link href="/wardrobe" className="block text-left text-sm text-[#B5B0A8]">Back</Link>
 <h1 className="text-2xl font-medium">Add to closet</h1>
 <p className="text-sm text-[#B5B0A8]">Personalize your future outfits with clothes you own.</p>
 <Link href="/wardrobe/add?method=photo" className="block rounded-full bg-[#F5F1E9] px-6 py-4 text-[#141416]">Add with photos<span className="block text-xs text-[#6D6257]">StyleGraph extracts your garments</span></Link>
 <Link href="/wardrobe/add/curated" className="block rounded-full bg-[#38383D] px-6 py-4">Search items</Link>
 </div></main>
}
