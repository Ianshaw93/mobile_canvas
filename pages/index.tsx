import CameraLogic from '@/components/CameraLogic';
import PdfPicker from '@/components/PdfPicker';
import { Inter } from 'next/font/google'
import { useRef, useState } from 'react';
// import { defineCustomeElements } from '@ionic/pwa-elements/loader';

const inter = Inter({ subsets: ['latin'] })

export default function Home() {

// have pdf from local storage??
// then draw point
// defineCustomeElements(window)

// TODO: use native camera
  return (
    <>
      <CameraLogic />
      <PdfPicker />
    </>
  )
}
