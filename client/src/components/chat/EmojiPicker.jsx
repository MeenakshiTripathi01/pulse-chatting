import { useEffect, useId, useRef, useState } from 'react';

const EMOJI_GROUPS = [
  {
    label: 'Smileys',
    emojis: [
      ['😀', 'grinning face'],
      ['😃', 'grinning face with big eyes'],
      ['😄', 'grinning face with smiling eyes'],
      ['😁', 'beaming face'],
      ['😆', 'grinning squinting face'],
      ['😅', 'grinning face with sweat'],
      ['😂', 'face with tears of joy'],
      ['🤣', 'rolling on the floor laughing'],
      ['🙂', 'slightly smiling face'],
      ['😉', 'winking face'],
      ['😊', 'smiling face with smiling eyes'],
      ['😇', 'smiling face with halo'],
      ['🥰', 'smiling face with hearts'],
      ['😍', 'smiling face with heart eyes'],
      ['😘', 'face blowing a kiss'],
      ['😋', 'face savoring food'],
      ['😜', 'winking face with tongue'],
      ['🤪', 'zany face'],
      ['🤗', 'hugging face'],
      ['🤔', 'thinking face'],
      ['🤫', 'shushing face'],
      ['😐', 'neutral face'],
      ['😏', 'smirking face'],
      ['🙄', 'face with rolling eyes'],
      ['😬', 'grimacing face'],
      ['😌', 'relieved face'],
      ['😴', 'sleeping face'],
      ['😎', 'smiling face with sunglasses'],
      ['🤓', 'nerd face'],
      ['😕', 'confused face'],
      ['😮', 'face with open mouth'],
      ['😳', 'flushed face'],
      ['🥺', 'pleading face'],
      ['😢', 'crying face'],
      ['😭', 'loudly crying face'],
      ['😤', 'face with steam from nose'],
      ['😡', 'pouting face'],
      ['🤯', 'exploding head'],
      ['🥳', 'partying face'],
      ['😷', 'face with medical mask'],
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      ['👍', 'thumbs up'],
      ['👎', 'thumbs down'],
      ['👌', 'OK hand'],
      ['✌️', 'victory hand'],
      ['🤞', 'crossed fingers'],
      ['🤙', 'call me hand'],
      ['👋', 'waving hand'],
      ['✋', 'raised hand'],
      ['👏', 'clapping hands'],
      ['🙌', 'raising hands'],
      ['🙏', 'folded hands'],
      ['💪', 'flexed biceps'],
      ['🤝', 'handshake'],
      ['👊', 'oncoming fist'],
      ['👉', 'backhand index pointing right'],
      ['👀', 'eyes'],
    ],
  },
  {
    label: 'Hearts and symbols',
    emojis: [
      ['❤️', 'red heart'],
      ['🧡', 'orange heart'],
      ['💛', 'yellow heart'],
      ['💚', 'green heart'],
      ['💙', 'blue heart'],
      ['💜', 'purple heart'],
      ['🖤', 'black heart'],
      ['🤍', 'white heart'],
      ['💔', 'broken heart'],
      ['💕', 'two hearts'],
      ['💖', 'sparkling heart'],
      ['💯', 'hundred points'],
      ['✨', 'sparkles'],
      ['🔥', 'fire'],
      ['⭐', 'star'],
      ['🎉', 'party popper'],
    ],
  },
  {
    label: 'Food, nature and things',
    emojis: [
      ['🎂', 'birthday cake'],
      ['🎁', 'wrapped gift'],
      ['☕', 'hot beverage'],
      ['🍕', 'pizza'],
      ['🍔', 'hamburger'],
      ['🍫', 'chocolate bar'],
      ['🌹', 'rose'],
      ['🌸', 'cherry blossom'],
      ['☀️', 'sun'],
      ['🌙', 'crescent moon'],
      ['🌈', 'rainbow'],
      ['⚽', 'soccer ball'],
      ['🎵', 'musical note'],
      ['📷', 'camera'],
      ['💻', 'laptop'],
      ['📌', 'pushpin'],
    ],
  },
];

/** A button that opens a small emoji grid; picking one calls `onSelect(emoji)`. */
export function EmojiPicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();

  // Close on Escape or a click/tap anywhere outside the picker.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? 'Close emoji picker' : 'Add emoji'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className={`grid size-11 shrink-0 place-items-center rounded-xl hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 ${
          open ? 'bg-slate-100 text-brand-700' : 'text-slate-600'
        }`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="size-6"
        >
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
          <path strokeLinecap="round" strokeWidth="2.5" d="M9 9.5h.01M15 9.5h.01" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Emoji picker"
          className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <p className="px-1 pt-1 pb-1 text-xs font-medium text-slate-500">{group.label}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map(([emoji, name]) => (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={name}
                    title={name}
                    onClick={() => onSelect(emoji)}
                    className="grid size-8 place-items-center rounded-md text-xl hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
