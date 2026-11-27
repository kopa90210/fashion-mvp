import Link from 'next/link'
import {redirect} from 'next/navigation'
import {createClient} from '@/src/lib/supabase/server'
import {getOwnedCuratedIds} from '@/src/app/actions/wardrobe'
import PieceSelectionScreen from '@/src/app/(app)/quiz/PieceSelectionScreen'
import {CATALOG_COLLECTIONS,parseCatalogCollection} from '@/src/lib/quiz/catalog-collection'

export default async function CuratedWardrobePage({searchParams}:{searchParams:Promise<{collection?:string}>}){
 const supabase=await createClient()
 const {data:{user}}=await supabase.auth.getUser()
 if(!user)redirect('/login')
 const collection=parseCatalogCollection((await searchParams).collection)
 if(!collection)return <main className="stylegraph-quiz-surface min-h-dvh bg-[#141416] px-6 py-10 text-center text-[#F5F1E9]"><Link href="/wardrobe/add" className="text-sm text-[#B5B0A8]">Back</Link><h1 className="mt-6 text-2xl">Choose a collection</h1><div className="mt-6 flex flex-wrap justify-center gap-3">{CATALOG_COLLECTIONS.map(c=><Link key={c.id} href={'/wardrobe/add/curated?collection='+c.id} className="rounded-full border border-[#E8C568] px-5 py-3 text-sm">{c.label}</Link>)}</div></main>
 const ownedIds=await getOwnedCuratedIds()
 return <PieceSelectionScreen key={collection} collection={collection} pending={{exists:false,itemIds:[],items:[],version:0,committed:false}} mode="wardrobe" ownedIds={ownedIds}/>
}
