import PdfPicker from '@/components/PdfPicker';
import { Inter } from 'next/font/google'
import { useRef, useState } from 'react';


const inter = Inter({ subsets: ['latin'] })

export default function Home() {

// have pdf from local storage??
// then draw point

// TODO: use native camera
  return (
    <>
      <PdfPicker />
    </>
  )
}
