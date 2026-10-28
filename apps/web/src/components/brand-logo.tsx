import Image from 'next/image';

export function BrandLogo() {
  return (
    <Image src="/bharini.jpeg" alt="Bharini" width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
  );
}
