import { Dumbbell, Flame, Target, Zap, Activity } from 'lucide-react';

/**
 * Devuelve el ícono correspondiente al tipo de clase por nombre.
 * Fuente única — importar desde aquí en lugar de duplicar en cada página.
 */
export function getClassIcon(name: string, color: string, size = 18) {
  const n = (name ?? '').toUpperCase();
  if (n.includes('STRENGTH'))   return <Dumbbell  size={size} color={color} />;
  if (n.includes('UPPER BURN')) return <Flame     size={size} color={color} />;
  if (n.includes('TEST'))       return <Target    size={size} color={color} />;
  if (n.includes('ATHLETE'))    return <Zap       size={size} color={color} />;
  return                               <Activity  size={size} color={color} />;
}
