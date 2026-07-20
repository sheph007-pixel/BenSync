import { useState } from 'react';
import { Eye, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ClickToRevealPhoneProps {
  label?: string;
  className?: string;
  variant?: 'link' | 'button';
}

export function ClickToRevealPhone({
  label = "Click to reveal contact",
  className = "",
  variant = "link"
}: ClickToRevealPhoneProps) {
  const [revealed, setRevealed] = useState(false);

  // Number stored as encoded parts to prevent scraping
  const getParts = () => ['205', '641', '0469'];
  const getNumber = () => getParts().join('-');
  const getTelLink = () => `tel:+1${getParts().join('')}`;

  if (revealed) {
    return (
      <a
        href={getTelLink()}
        className={`font-semibold text-primary hover:underline ${className}`}
        style={{ display: 'inline' }}
      >
        {getNumber()}
      </a>
    );
  }

  if (variant === 'button') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setRevealed(true)}
        className={className}
      >
        <Eye className="h-4 w-4 mr-2" />
        {label}
      </Button>
    );
  }

  return (
    <button
      onClick={() => setRevealed(true)}
      className={`text-primary hover:underline ${className}`}
      style={{ display: 'inline' }}
    >
      {label}
    </button>
  );
}
