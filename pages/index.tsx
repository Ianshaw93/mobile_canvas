import PdfPicker from '@/components/PdfPicker';
import SupportBundleButton from '@/components/SupportBundleButton';
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {

  return (
    <>
      <div className="p-4 space-y-4">
        <PdfPicker/>
        <SupportBundleButton/>
      </div>
    </>
  )
}
