// Traduções no servidor: os mesmos catálogos do navegador (public/js/lang).
import { compile, localize, normLocale, translate } from '../public/js/lang/core.js';
import en from '../public/js/lang/en.js';
import fr from '../public/js/lang/fr.js';
import de from '../public/js/lang/de.js';
import ptBR from '../public/js/lang/pt-BR.js';
import ptPT from '../public/js/lang/pt-PT.js';

const CATS = { en: compile(en), fr: compile(fr), de: compile(de), 'pt-BR': compile(ptBR), 'pt-PT': compile(ptPT) };
export const langOf = (code) => normLocale(code) ?? 'es';
export const tr = (lang, s, vars) => translate(CATS[langOf(lang)] ?? null, s, vars) ?? s;
export const localizeFor = (lang, value) => (CATS[langOf(lang)] ? localize(CATS[langOf(lang)], value) : value);
