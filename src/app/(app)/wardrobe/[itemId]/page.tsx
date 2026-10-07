import { notFound } from 'next/navigation'
import { getItemIntelligence } from './item-intelligence'
import WardrobeItemScreen from './WardrobeItemScreen'

export default async function WardrobeItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) notFound()
  const intelligence = await getItemIntelligence(itemId)
  if (!intelligence) notFound()
  return <WardrobeItemScreen {...intelligence} />
}
