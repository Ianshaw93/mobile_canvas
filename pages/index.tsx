import Link from 'next/link';
import PdfPicker from '@/components/PdfPicker';
import SupportBundleButton from '@/components/SupportBundleButton';
import UpdatePrompt from '@/components/UpdatePrompt';
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {

  return (
    <>
      <div className="p-4 space-y-4">
        <div className="flex justify-end">
          <Link href="/updates" className="text-sm text-blue-600 underline">
            Updates
          </Link>
        </div>
        <PdfPicker/>
        <SupportBundleButton/>
      </div>
      <UpdatePrompt/>
    </>
  )
}
