// Definiciones de los programas con "companheiro" (todos menos Sem Fumo, que tiene sus tablas propias).
import alcohol from './alcohol.js';
import ansiedad from './ansiedad.js';
import azucar from './azucar.js';
import sueno from './sueno.js';

export const COMPANIONS = { alcohol, azucar, ansiedad, sueno };
export const COMPANION_SLUGS = Object.keys(COMPANIONS);
export const getCompanion = (slug) => (Object.hasOwn(COMPANIONS, slug) ? COMPANIONS[slug] : null);
export default COMPANIONS;
