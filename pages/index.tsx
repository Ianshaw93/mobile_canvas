import PdfPicker from '@/components/PdfPicker';
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function Home() {

  return (
    <>
      <PdfPicker/>
    </>
  )
}
