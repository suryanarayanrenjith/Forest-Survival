import { useState, useEffect } from 'react';

interface DamageNumber {
  id: string;
  damage: number;
  x: number;
  y: number;
  isHeadshot: boolean;
  isCritical: boolean;
  timestamp: number;
}

interface HitMarker {
  id: string;
  timestamp: number;
  isHeadshot: boolean;
}

let damageNumbers: DamageNumber[] = [];
let hitMarkers: HitMarker[] = [];
let updateCallback: (() => void) | null = null;

export const addDamageNumber = (damage: number, x: number, y: number, isHeadshot: boolean = false, isCritical: boolean = false) => {
  const damageNum: DamageNumber = {
    id: `${Date.now()}-${Math.random()}`,
    damage,
    x,
    y,
    isHeadshot,
    isCritical,
    timestamp: Date.now()
  };

  damageNumbers.push(damageNum);

  if (updateCallback) {
    updateCallback();
  }
};

export const addHitMarker = (isHeadshot: boolean = false) => {
  const marker: HitMarker = {
    id: `${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    isHeadshot
  };

  hitMarkers.push(marker);

  if (updateCallback) {
    updateCallback();
  }
};

const HitMarkers = () => {
  const [damages, setDamages] = useState<DamageNumber[]>([]);
  const [markers, setMarkers] = useState<HitMarker[]>([]);

  useEffect(() => {
    updateCallback = () => {
      setDamages([...damageNumbers]);
      setMarkers([...hitMarkers]);
    };

    return () => {
      updateCallback = null;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      damageNumbers = damageNumbers.filter(d => now - d.timestamp < 1000);
      hitMarkers = hitMarkers.filter(m => now - m.timestamp < 300);
      setDamages([...damageNumbers]);
      setMarkers([...hitMarkers]);
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Centered Hit Markers */}
      <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
        {markers.map((marker) => (
          <div
            key={marker.id}
            className={`absolute ${marker.isHeadshot ? 'text-red-500' : 'text-white'}`}
            style={{
              animation: 'hitMarkerFade 0.3s ease-out'
            }}
          >
            <div className="relative w-8 h-8">
              {/* Cross hair hit marker */}
              <div className={`absolute top-0 left-1/2 w-0.5 h-3 ${marker.isHeadshot ? 'bg-red-500' : 'bg-white'} -translate-x-1/2`}></div>
              <div className={`absolute bottom-0 left-1/2 w-0.5 h-3 ${marker.isHeadshot ? 'bg-red-500' : 'bg-white'} -translate-x-1/2`}></div>
              <div className={`absolute left-0 top-1/2 w-3 h-0.5 ${marker.isHeadshot ? 'bg-red-500' : 'bg-white'} -translate-y-1/2`}></div>
              <div className={`absolute right-0 top-1/2 w-3 h-0.5 ${marker.isHeadshot ? 'bg-red-500' : 'bg-white'} -translate-y-1/2`}></div>

              {marker.isHeadshot && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold animate-pulse">💀</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Damage Numbers */}
      <div className="fixed inset-0 pointer-events-none z-40">
        {damages.map((dmg) => {
          const age = Date.now() - dmg.timestamp;
          const progress = age / 1000;
          const yOffset = progress * 100;
          const opacity = 1 - progress;

          return (
            <div
              key={dmg.id}
              className={`absolute font-bold ${
                dmg.isHeadshot
                  ? 'text-red-500 text-2xl'
                  : dmg.isCritical
                  ? 'text-yellow-400 text-xl'
                  : 'text-white text-lg'
              }`}
              style={{
                left: `${dmg.x}%`,
                top: `${dmg.y}%`,
                transform: `translate(-50%, -${yOffset}px) scale(${1 + progress * 0.5})`,
                opacity: opacity,
                textShadow: '0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.6)',
                pointerEvents: 'none'
              }}
            >
              {dmg.isHeadshot && '💀 '}
              -{dmg.damage}
              {dmg.isCritical && ' ⚡'}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes hitMarkerFade {
          0% {
            opacity: 1;
            transform: scale(1.5);
          }
          100% {
            opacity: 0;
            transform: scale(0.8);
          }
        }
      `}</style>
    </>
  );
};

export default HitMarkers;
