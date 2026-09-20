import UploadScreen from './UploadScreen'

export default function AddWardrobePage() {
  return <UploadScreen outfitUploadEnabled={process.env.ENABLE_OUTFIT_PHOTO_UPLOAD === 'true'} />
}
