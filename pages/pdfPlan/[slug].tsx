import React from 'react';
import { useRouter } from 'next/router';

const Page = () => {
  const router = useRouter();
  return (
    <div>{router.query.slug}</div>
  );
}

export default Page;